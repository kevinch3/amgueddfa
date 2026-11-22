/**
 * Video player on edition pages: a click on a video card opens it here, in YouTube's
 * no-cookie player, with its transcription beside it (synced, searchable, each line
 * a jump to its moment). The card keeps its plain link to YouTube for no-JS, middle
 * click and modified clicks. YouTube's code loads only when a visitor opens a video.
 * The address carries the open video (#v=<id>&t=<seconds>, lib/video-hash.ts), so a moment can be linked.
 * Transcriptions: public/transcripciones-video/<id>.json (scripts/export_video_transcripts.py), with the approved
 * corrections the file does not hold yet applied live (lib/live-video-corrections.ts).
 * Chubut and Trevelin collaborators can correct the text here (edit mode, scripts/editor-transcripcion.ts).
 */
import { formatList, t } from '../lib/i18n';
import { lineCredit, loadTranscriptLive, type LiveTranscript } from '../lib/live-video-corrections';
import { url } from '../lib/paths';
import { creditos, findLines, fmtTime, letraAt, lineAt, lineLang, type Transcript } from '../lib/video-transcript';
import { parseVideoHash, videoHash } from '../lib/video-hash';
import { videoUrl } from '../lib/videos';
import { ASENTADA_EVENT, EDITANDO, LINEAS_EVENT, wireEditor, type EditorVideo } from './editor-transcripcion';

type YTPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  stopVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const dialog = document.getElementById('reproductor') as HTMLDialogElement | null;
const $ = <T extends HTMLElement>(sel: string) => dialog?.querySelector<T>(sel) ?? null;

let api: Promise<void> | null = null;
/** YouTube's IFrame API, loaded once, on the first open. */
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  api ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.append(s);
  });
  return api;
}

const LANGS: Record<string, string> = { es: 'reproductor.idiomas.es', cy: 'reproductor.idiomas.cy', en: 'reproductor.idiomas.en' };

if (dialog) {
  let list: HTMLLIElement[] = [];
  let index = 0;
  let player: YTPlayer | null = null;
  let current: Transcript | null = null;
  let active = -1;
  let timer = 0;
  let userScrolledAt = 0;
  let loadToken = 0;
  let chapters: [number, string, string, string][] = [];
  let activeCh = -1;
  let chToken = 0;
  /** The second the open video must start at, until it has really played from there. Safari and phones
   *  block autoplay: YouTube then only cues the video, and its own play button may ignore `start`. */
  let pendingStart = 0;

  /** Put the video at its moment (when it is ready, and again when it first plays). */
  function honourStart(playing: boolean): void {
    if (!player || pendingStart <= 0) return;
    try {
      if (Math.abs(player.getCurrentTime() - pendingStart) > 2) player.seekTo(pendingStart, true);
      if (playing) pendingStart = 0;
      else player.playVideo();
    } catch {
      /* not ready yet: the next event tries again */
    }
  }

  const lines = $<HTMLOListElement>('[data-rep-lineas]')!;
  const search = $<HTMLInputElement>('[data-rep-q]')!;
  const follow = $<HTMLInputElement>('[data-rep-seguir]')!;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  lines.addEventListener('scroll', () => (userScrolledAt = Date.now()), { passive: true });

  function videosOf(li: HTMLLIElement): HTMLLIElement[] {
    const sec = li.closest('[data-videos]') ?? document;
    const seen = new Set<string>();
    return [...sec.querySelectorAll<HTMLLIElement>('li[data-video]')].filter((x) => {
      const id = x.dataset.video ?? '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /** Mark line i as the one playing; `scroll` false keeps the list where the visitor has it. */
  function setActive(i: number, scroll = true): void {
    if (i === active) return;
    lines.querySelector('.actual')?.classList.remove('actual');
    lines.querySelector('[aria-current]')?.removeAttribute('aria-current');
    active = i;
    const li = i >= 0 ? (lines.children[i] as HTMLElement | undefined) : undefined;
    if (!li) return;
    li.classList.add('actual');
    li.querySelector('button[data-i]')?.setAttribute('aria-current', 'true');
    // Follow the video unless the visitor turned it off, is reading elsewhere (scrolled in the last 4 s) or is
    // correcting a line (edit mode: the line being edited stays where it is).
    if (scroll && follow.checked && !lines.hasAttribute(EDITANDO) && Date.now() - userScrolledAt > 4000) {
      li.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function tick(): void {
    if (!player || !dialog!.open) return;
    try {
      const now = player.getCurrentTime();
      markChapter(lineAt(chapters.map((c) => [c[0], c[2]] as [number, string]), now));
      if (!current) return;
      setActive(lineAt(current.seg, now));
    } catch {
      /* the player is still loading */
    }
  }

  /** Draw the lines, then tell the edit mode (it puts its controls and marks back on the new lines). */
  function renderTranscript(shown: LiveTranscript | null): void {
    drawTranscript(shown);
    dialog!.dispatchEvent(new CustomEvent(LINEAS_EVENT));
  }

  function drawTranscript(shown: LiveTranscript | null): void {
    const tr = shown?.tr ?? null;
    const autores = shown?.autores ?? {};
    current = tr;
    active = -1;
    lines.replaceChildren();
    $('[data-rep-vacio]')!.hidden = !!tr;
    $('[data-rep-buscador]')!.hidden = !tr;
    renderFooter(tr, shown?.nombres ?? []);
    const badge = $('[data-rep-fuente]')!;
    badge.hidden = !tr;
    search.value = '';
    $('[data-rep-n]')!.textContent = '';
    if (!tr) return;
    const lang = LANGS[tr.lang] ? t(LANGS[tr.lang]) : tr.lang;
    badge.textContent = `${t(`reproductor.fuente.${tr.src}`)}${lang ? ` · ${lang}` : ''}${tr.letras ? ` · ${t('reproductor.letra_alineada')}` : ''}`;
    badge.dataset.fuente = tr.src;
    const frag = document.createDocumentFragment();
    tr.seg.forEach(([start, text], i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.i = String(i);
      const time = document.createElement('span');
      time.className = 'rep-t';
      time.textContent = fmtTime(start);
      const words = document.createElement('span');
      words.className = 'rep-w';
      words.textContent = text;
      const letra = letraAt(tr, start);
      if (letra) li.classList.add('rep-letra');
      // The line's own language: its lyric's, the export's idiomas, Welsh when the Welsh model heard it, else the transcript's.
      const lang = lineLang(tr, i, letra);
      if (lang) words.lang = lang;
      // Quietly marked when it differs from the rest of the transcript (Welsh in a Spanish session).
      if (lang && tr.lang && lang !== tr.lang && !letra) {
        li.classList.add('rep-otra');
        time.dataset.lang = lang;
      }
      b.setAttribute('aria-label', `${t('reproductor.ir_a', { tiempo: fmtTime(start) })}: ${text}`);
      // Its sources, and who corrected it: a corrected or added line keeps its look plus a small mark.
      const cred = lineCredit(tr.fuentes?.[i], autores[i]);
      if (cred.title) b.title = cred.title;
      if (cred.colab) li.dataset.colab = '';
      b.append(time, words);
      li.append(b);
      frag.append(li);
    });
    lines.append(frag);
  }

  /** The same video's transcript again, now with the approved corrections it did not hold: the visitor keeps their
   *  place in the list, the line playing and their search. Only the footer when the lines did not change. */
  function refreshTranscript(shown: LiveTranscript): void {
    if (shown.tr === current) {
      renderFooter(shown.tr, shown.nombres);
      return;
    }
    const top = lines.scrollTop;
    const playing = active >= 0 ? current?.seg[active]?.[0] : undefined;
    const q = search.value;
    renderTranscript(shown);
    lines.scrollTop = top;
    if (playing !== undefined) setActive(lineAt(shown.tr.seg, playing), false);
    if (q) {
      search.value = q;
      markHits(false);
    }
  }

  /** The footer under the lines: the Whisper warning, one credit line per lyric (title, author, rights, source), and
   *  the collaborators whose approved corrections are in the text. */
  function renderFooter(tr: Transcript | null, nombres: string[]): void {
    const whisper = tr?.src === 'whisper';
    const cred = tr ? creditos(tr) : [];
    $('[data-rep-nota]')!.hidden = !whisper;
    $('[data-rep-creditos]')!.hidden = !cred.length;
    const colab = $('[data-rep-colab]')!;
    colab.hidden = !nombres.length;
    colab.textContent = nombres.length ? t('reproductor.correcciones_de', { nombres: formatList(nombres) }) : '';
    // Always there under a transcript: at least the link to how its text is produced (/creditos/#videos).
    $('[data-rep-pie]')!.hidden = !tr;
    const ul = $('[data-rep-creditos-lista]')!;
    ul.replaceChildren(
      ...cred.map((c) => {
        const li = document.createElement('li');
        const ti = document.createElement('cite');
        ti.textContent = `«${c.titulo}»`;
        li.append(ti, c.autor ? `, ${c.autor}` : '');
        if (c.derechos) li.append(` · ${c.derechos}`);
        if (c.fuente.href) {
          const a = document.createElement('a');
          a.href = c.fuente.href;
          a.rel = 'noopener';
          a.target = '_blank';
          a.textContent = c.fuente.host ?? c.fuente.href;
          li.append(' · ', a, c.fuente.texto ? `, ${c.fuente.texto}` : '');
        } else if (c.fuente.texto) li.append(` · ${c.fuente.texto}`);
        return li;
      }),
    );
  }

  function markChapter(i: number): void {
    if (i === activeCh) return;
    activeCh = i;
    const list = $('[data-rep-cap-lista]')!;
    for (const [k, li] of [...list.children].entries()) li.classList.toggle('actual', k === i);
  }

  // Automatic chapters (scripts/video_markers.py): competition starts and ceremonies of long sessions.
  async function loadChapters(id: string): Promise<void> {
    const box = $('[data-rep-capitulos]')!;
    const list = $('[data-rep-cap-lista]')!;
    const token = ++chToken;
    chapters = [];
    activeCh = -1;
    list.replaceChildren();
    box.hidden = true;
    try {
      const r = await fetch(url(`marcadores-video/${id}.json`));
      if (!r.ok) return;
      const d = await r.json();
      if (token !== chToken || !Array.isArray(d?.markers)) return;
      chapters = d.markers.filter((m: unknown) => Array.isArray(m) && typeof m[0] === 'number');
    } catch {
      return;
    }
    if (token !== chToken || !chapters.length) return;
    for (const [sec, n, label, kind] of chapters) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.sec = String(sec);
      const tm = document.createElement('span');
      tm.className = 'rep-t';
      tm.textContent = fmtTime(sec);
      const w = document.createElement('span');
      w.className = 'rep-w';
      w.textContent = kind === 'comp' ? `${t('reproductor.comp', { n })}: ${label}` : label;
      w.lang = 'es';
      b.append(tm, w);
      li.append(b);
      list.append(li);
    }
    box.hidden = false;
  }

  async function loadTranscript(id: string): Promise<void> {
    const token = ++loadToken;
    renderTranscript(null);
    $('[data-rep-vacio]')!.textContent = t('reproductor.cargando');
    // The published file at once (null for a 404; offline or none: the panel says so); then, if the approved
    // corrections it does not hold yet change it, the corrected text in place. Never waits for the database.
    await loadTranscriptLive(
      id,
      async (v) => {
        const r = await fetch(url(`transcripciones-video/${v}.json`));
        return r.ok ? r.json() : null;
      },
      (shown, update) => {
        if (update) refreshTranscript(shown!);
        else {
          $('[data-rep-vacio]')!.textContent = t('reproductor.sin_transcripcion');
          renderTranscript(shown);
        }
      },
      {
        stale: () => token !== loadToken, // the visitor moved to another video meanwhile
        settled: () => dialog!.dispatchEvent(new CustomEvent(ASENTADA_EVENT)), // the text is final: edit mode may start
      },
    );
  }

  async function show(i: number, start = 0): Promise<void> {
    index = Math.max(0, Math.min(list.length - 1, i));
    const li = list[index];
    const id = li.dataset.video ?? '';
    $('[data-rep-titulo]')!.textContent = li.dataset.title ?? '';
    $('[data-rep-meta]')!.textContent = [li.dataset.channel, list.length > 1 ? t('reproductor.de', { n: index + 1, total: list.length }) : '']
      .filter(Boolean)
      .join(' · ');
    for (const a of dialog!.querySelectorAll<HTMLAnchorElement>('[data-rep-yt], [data-rep-yt-error]')) a.href = videoUrl(id);
    ($('[data-rep-anterior]') as HTMLButtonElement).disabled = index === 0;
    ($('[data-rep-siguiente]') as HTMLButtonElement).disabled = index === list.length - 1;
    $('[data-rep-error]')!.hidden = true;
    $('[data-rep-copiado]')!.textContent = '';
    $('.rep-marco')!.hidden = false;
    // The address names the open video; no history entry, so "back" still leaves the page.
    history.replaceState(history.state, '', videoHash(id, start));
    void loadTranscript(id);
    void loadChapters(id);
    pendingStart = Math.floor(start);
    await loadApi();
    if (player) {
      (player as unknown as { loadVideoById(o: { videoId: string; startSeconds: number }): void }).loadVideoById({ videoId: id, startSeconds: start });
      return;
    }
    player = new window.YT!.Player($<HTMLElement>('[data-rep-player]')!, {
      host: 'https://www.youtube-nocookie.com',
      videoId: id,
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, autoplay: 1, start: Math.floor(start) },
      events: {
        onReady: () => honourStart(false),
        // 1: playing.
        onStateChange: (ev: { data: number }) => {
          if (ev.data === 1) honourStart(true);
        },
        // 2, 5, 100, 101, 150: bad id, HTML5 error, removed, embedding not allowed.
        onError: () => {
          $('.rep-marco')!.hidden = true;
          $('[data-rep-error]')!.hidden = false;
        },
      },
    });
  }

  function open(li: HTMLLIElement, start = 0): void {
    list = videosOf(li);
    const i = list.findIndex((x) => x.dataset.video === li.dataset.video);
    if (!dialog!.open) dialog!.showModal();
    window.clearInterval(timer);
    timer = window.setInterval(tick, 300);
    void show(i < 0 ? 0 : i, start);
  }

  // A plain click on a card opens the player; middle click and Ctrl/⌘/Shift-click keep YouTube's link.
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>('li[data-video] > a');
    if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (!a.closest('[data-videos]')) return;
    ev.preventDefault();
    open(a.parentElement as HTMLLIElement);
  });

  // "▶ 1:24:14" links on programa lines (automatic markers) open the video at that moment.
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-play-video]');
    if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const li = document.querySelector<HTMLLIElement>(`[data-videos] li[data-video="${CSS.escape(a.dataset.playVideo ?? '')}"]`);
    if (!li) return;
    ev.preventDefault();
    open(li, Number(a.dataset.playT) || 0);
  });

  /** Open the video a hash names, at its second; false when the hash is not a video of this page. */
  function openFromHash(hash: string): boolean {
    const m = parseVideoHash(hash);
    const li = m && document.querySelector<HTMLLIElement>(`[data-videos] li[data-video="${CSS.escape(m.id)}"]`);
    if (!m || !li) return false;
    open(li, m.t);
    return true;
  }

  // Links to a moment of a video of this page (search results, shared links pasted in a text) open it here.
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href*="#v="]');
    if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (a.origin !== location.origin || a.pathname !== location.pathname) return;
    if (openFromHash(a.hash)) ev.preventDefault();
  });
  window.addEventListener('hashchange', () => void openFromHash(location.hash));
  // A shared link: the cards are in the page's own markup, so the player can open at once.
  openFromHash(location.hash);

  lines.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-i]');
    if (!b || !current || !player) return;
    const start = current.seg[Number(b.dataset.i)]?.[0] ?? 0;
    userScrolledAt = 0;
    pendingStart = 0; // the visitor chose another moment
    player.seekTo(start, true);
    player.playVideo();
    setActive(Number(b.dataset.i));
  });

  $('[data-rep-cap-lista]')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-sec]');
    if (!b || !player) return;
    userScrolledAt = 0;
    pendingStart = 0; // the visitor chose another moment
    player.seekTo(Number(b.dataset.sec), true);
    player.playVideo();
  });

  /** Highlight the lines that match the search, and (`scroll`) bring the first one into view. */
  function markHits(scroll: boolean): void {
    if (!current) return;
    const hits = new Set(findLines(current.seg, search.value));
    for (const [i, li] of [...lines.children].entries()) li.classList.toggle('coincide', hits.has(i));
    const n = $('[data-rep-n]')!;
    n.textContent = search.value.trim() ? (hits.size ? t('reproductor.coincidencias', { n: hits.size }) : t('reproductor.sin_coincidencias')) : '';
    const first = Math.min(...hits);
    if (scroll && Number.isFinite(first)) {
      userScrolledAt = Date.now();
      (lines.children[first] as HTMLElement).scrollIntoView({ block: 'center' });
    }
  }
  search.addEventListener('input', () => markHits(true));

  $('[data-rep-anterior]')?.addEventListener('click', () => void show(index - 1));
  $('[data-rep-siguiente]')?.addEventListener('click', () => void show(index + 1));
  $('[data-rep-cerrar]')?.addEventListener('click', () => dialog.close());
  // "Copiar enlace a este momento": the page's address with the open video and the second it is at.
  $('[data-rep-copiar]')?.addEventListener('click', async () => {
    const id = list[index]?.dataset.video ?? '';
    let now = 0;
    try {
      now = player?.getCurrentTime() ?? 0;
    } catch {
      /* not ready yet: the start */
    }
    const hash = videoHash(id, now);
    history.replaceState(history.state, '', hash);
    const href = `${location.origin}${location.pathname}${location.search}${hash}`;
    const status = $('[data-rep-copiado]')!;
    try {
      await navigator.clipboard.writeText(href);
      status.textContent = t('reproductor.enlace_copiado', { tiempo: fmtTime(now) });
    } catch {
      status.textContent = href; // no clipboard (http, old browser): the address bar has it too
    }
  });
  // "Informar un error": close the player and use the card's own report button (scripts/informar.ts).
  $('[data-rep-informar]')?.addEventListener('click', () => {
    const btn = list[index]?.querySelector<HTMLButtonElement>('[data-informar-video]');
    dialog.close();
    btn?.click();
  });
  /** The video open now, with its edition (the card's section), for the edit mode. */
  function openVideo(): EditorVideo | null {
    const li = list[index];
    if (!li) return null;
    const sec = li.closest<HTMLElement>('[data-videos]');
    return { id: li.dataset.video ?? '', title: li.dataset.title ?? '', festival: sec?.dataset.festival ?? '', year: Number(sec?.dataset.year) || 0 };
  }
  wireEditor(dialog, () => ({
    tr: current,
    video: openVideo(),
    currentTime: () => {
      try {
        return player?.getCurrentTime() ?? 0;
      } catch {
        return 0; // not ready yet: the start
      }
    },
  }));

  dialog.addEventListener('close', () => {
    window.clearInterval(timer);
    if (parseVideoHash(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
    try {
      player?.stopVideo();
    } catch {
      /* not ready yet */
    }
  });
}
