/**
 * Video player on edition pages: a click on a video card opens it here, in YouTube's
 * no-cookie player, with its transcription beside it (synced, searchable, each line
 * a jump to its moment). The card keeps its plain link to YouTube for no-JS, middle
 * click and modified clicks. YouTube's code loads only when a visitor opens a video.
 * The address carries the open video (#v=<id>&t=<seconds>, lib/video-hash.ts), so a moment can be linked.
 * Transcriptions: public/transcripciones-video/<id>.json (scripts/export_video_transcripts.py).
 */
import { t } from '../lib/i18n';
import { url } from '../lib/paths';
import { asTranscript, findLines, fmtTime, letraAt, lineAt, type Transcript } from '../lib/video-transcript';
import { parseVideoHash, videoHash } from '../lib/video-hash';
import { videoUrl } from '../lib/videos';

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

  function setActive(i: number): void {
    if (i === active) return;
    lines.querySelector('.actual')?.classList.remove('actual');
    lines.querySelector('[aria-current]')?.removeAttribute('aria-current');
    active = i;
    const li = i >= 0 ? (lines.children[i] as HTMLElement | undefined) : undefined;
    if (!li) return;
    li.classList.add('actual');
    li.querySelector('button')?.setAttribute('aria-current', 'true');
    // Follow the video unless the visitor turned it off or is reading elsewhere (scrolled in the last 4 s).
    if (follow.checked && Date.now() - userScrolledAt > 4000) {
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

  function renderTranscript(tr: Transcript | null): void {
    current = tr;
    active = -1;
    lines.replaceChildren();
    $('[data-rep-vacio]')!.hidden = !!tr;
    $('[data-rep-buscador]')!.hidden = !tr;
    $('[data-rep-nota]')!.hidden = tr?.src !== 'whisper';
    const notaLetra = $('[data-rep-nota-letra]')!;
    notaLetra.hidden = !tr?.letras;
    notaLetra.textContent = tr?.letras ? t('reproductor.nota_letra', { piezas: tr.letras.map((l) => `«${l.titulo}» (${l.autor})`).join(', ') }) : '';
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
      if (letra?.idioma || tr.lang) words.lang = letra?.idioma || tr.lang;
      b.setAttribute('aria-label', `${t('reproductor.ir_a', { tiempo: fmtTime(start) })}: ${text}`);
      b.append(time, words);
      li.append(b);
      frag.append(li);
    });
    lines.append(frag);
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
    let tr: Transcript | null = null;
    try {
      const r = await fetch(url(`transcripciones-video/${id}.json`));
      if (r.ok) tr = asTranscript(await r.json());
    } catch {
      /* offline or none: the panel says so */
    }
    if (token !== loadToken) return; // the visitor moved to another video meanwhile
    $('[data-rep-vacio]')!.textContent = t('reproductor.sin_transcripcion');
    renderTranscript(tr);
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
    $('.rep-marco')!.hidden = false;
    // The address names the open video; no history entry, so "back" still leaves the page.
    history.replaceState(history.state, '', videoHash(id, start));
    void loadTranscript(id);
    void loadChapters(id);
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
    player.seekTo(start, true);
    player.playVideo();
    setActive(Number(b.dataset.i));
  });

  $('[data-rep-cap-lista]')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-sec]');
    if (!b || !player) return;
    userScrolledAt = 0;
    player.seekTo(Number(b.dataset.sec), true);
    player.playVideo();
  });

  search.addEventListener('input', () => {
    if (!current) return;
    const hits = new Set(findLines(current.seg, search.value));
    for (const [i, li] of [...lines.children].entries()) li.classList.toggle('coincide', hits.has(i));
    const n = $('[data-rep-n]')!;
    n.textContent = search.value.trim() ? (hits.size ? t('reproductor.coincidencias', { n: hits.size }) : t('reproductor.sin_coincidencias')) : '';
    const first = Math.min(...hits);
    if (Number.isFinite(first)) {
      userScrolledAt = Date.now();
      (lines.children[first] as HTMLElement).scrollIntoView({ block: 'center' });
    }
  });

  $('[data-rep-anterior]')?.addEventListener('click', () => void show(index - 1));
  $('[data-rep-siguiente]')?.addEventListener('click', () => void show(index + 1));
  $('[data-rep-cerrar]')?.addEventListener('click', () => dialog.close());
  // "Informar un error": close the player and use the card's own report button (scripts/informar.ts).
  $('[data-rep-informar]')?.addEventListener('click', () => {
    const btn = list[index]?.querySelector<HTMLButtonElement>('[data-informar-video]');
    dialog.close();
    btn?.click();
  });
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
