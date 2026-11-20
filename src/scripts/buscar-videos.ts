/**
 * Search in what is said in the videos: type a word, get the videos that say it, each with
 * the lines where it is said and a link to that moment. On an edition page it searches that
 * edition (one file, fetched when the visitor reaches for the box); on /buscar/ every edition
 * (their files arrive a few at a time, newest first, and results grow as they do).
 * Data: datos/videos-texto/ (lib/video-search-data.ts). Matching: lib/video-search.ts.
 */
import { contentLang, t } from '../lib/i18n';
import { url } from '../lib/paths';
import { videoHash } from '../lib/video-hash';
import { editionKey, queryTerms, searchVideos, type Hit, type SearchEdition, type SearchIndexEntry, type VideoHits } from '../lib/video-search';
import { fmtTime } from '../lib/video-transcript';
import { videoThumb } from '../lib/videos';

/** Lines shown per video and videos per edition before "Ver más". */
const LINES = 3;
const VIDEOS = 6;
const PARALLEL = 4;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(url(path));
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The line with the found words in <mark>. */
function marked(hit: Hit, lang: string): HTMLSpanElement {
  const w = el('span', 'vb-w');
  if (lang) w.lang = lang;
  let at = 0;
  for (const [from, to] of hit.marks) {
    w.append(hit.text.slice(at, from), el('mark', undefined, hit.text.slice(from, to)));
    at = to;
  }
  w.append(hit.text.slice(at));
  return w;
}

/** "Ver 4 más": adds the rest when asked, so a common word does not build thousands of rows. */
function more<T>(rest: T[], add: (x: T) => Node, into: HTMLElement, cls: string): HTMLButtonElement | null {
  if (!rest.length) return null;
  const b = el('button', `btn-link small ${cls}`, t('videos.buscar.mas', { n: rest.length }));
  b.type = 'button';
  b.addEventListener('click', () => {
    const nodes = rest.map(add);
    into.append(...nodes);
    b.remove();
    (nodes[0] as HTMLElement | undefined)?.querySelector<HTMLElement>('a')?.focus();
  });
  return b;
}

function videoRow(page: string, r: VideoHits): HTMLLIElement {
  const moment = (s: number) => `${page}${videoHash(r.video.id, s)}`;
  const li = el('li', 'vb-video');
  const thumb = el('a', 'vb-thumb');
  thumb.href = moment(r.hits[0]?.t ?? 0);
  thumb.tabIndex = -1;
  thumb.setAttribute('aria-hidden', 'true');
  const img = el('img');
  Object.assign(img, { src: videoThumb(r.video.id), alt: '', loading: 'lazy', decoding: 'async', width: 160, height: 90 });
  thumb.append(img);

  const body = el('div', 'vb-cuerpo');
  const head = el('p', 'vb-titulo');
  const title = el('a', undefined, r.video.title);
  title.href = moment(0);
  // The uploader's own words: their language, not the page's (WCAG 3.1.2).
  const lang = contentLang();
  if (lang) title.lang = lang;
  head.append(title, ' ', el('span', 'badge', t(`videos.tipos.${r.video.kind}`)), ' ', el('span', 'vb-n muted small', t('videos.buscar.momentos', { n: r.total })));

  const list = el('ol', 'vb-momentos');
  const line = (h: Hit) => {
    const item = el('li');
    const a = el('a');
    a.href = moment(h.t);
    a.append(el('span', 'rep-t', fmtTime(h.t)), marked(h, r.video.lang));
    item.append(a);
    return item;
  };
  list.append(...r.hits.slice(0, LINES).map(line));
  body.append(head, list);
  const rest = more(r.hits.slice(LINES), line, list, 'vb-mas');
  if (rest) body.append(rest);
  li.append(thumb, body);
  return li;
}

function setup(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-vb-q]')!;
  const status = root.querySelector<HTMLElement>('[data-vb-estado]')!;
  const out = root.querySelector<HTMLElement>('[data-vb-resultados]')!;
  const note = root.querySelector<HTMLElement>('[data-vb-nota]')!;
  const others = root.querySelector<HTMLAnchorElement>('[data-vb-otras]');
  const own = root.dataset.edicion ?? '';
  const all = !own;

  /** The editions to search, in order, and the ones that have arrived. */
  let wanted: { key: string; festival: string; year: number }[] | null = null;
  const loaded = new Map<string, SearchEdition>();
  let failed = 0;
  let loading: Promise<void> | null = null;
  let timer = 0;

  /** Fetch what this box searches, once; `run` is called as each file arrives. */
  function load(): Promise<void> {
    loading ??= (async () => {
      if (all) {
        const index = (await getJson<SearchIndexEntry[]>('datos/videos-texto/indice.json')) ?? [];
        wanted = index.map((e) => ({ key: editionKey(e.festival, e.year), festival: e.festival, year: e.year }));
      } else {
        const [, festival, year] = /^(.*)-(\d+)$/.exec(own) ?? [];
        wanted = [{ key: own, festival, year: Number(year) }];
      }
      const queue = [...wanted];
      const worker = async () => {
        for (let e = queue.shift(); e; e = queue.shift()) {
          const data = await getJson<SearchEdition>(`datos/videos-texto/${e.key}.json`);
          if (data && Array.isArray(data.videos)) loaded.set(e.key, data);
          else failed++;
          run();
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      run();
    })();
    return loading;
  }

  function run(): void {
    const q = input.value.trim();
    if (others) others.href = `${others.dataset.base}?${new URLSearchParams(q ? { q, en: 'videos' } : { en: 'videos' })}`;
    if (all) {
      const p = new URLSearchParams(location.search);
      if (p.get('en') === 'videos' && (p.get('q') ?? '') !== q) {
        if (q) p.set('q', q);
        else p.delete('q');
        history.replaceState(history.state, '', `${location.pathname}?${p}`);
      }
    }
    out.replaceChildren();
    note.hidden = true;
    if (!queryTerms(q).length) {
      status.textContent = '';
      return;
    }
    if (!wanted) {
      status.textContent = t('videos.buscar.cargando');
      return;
    }
    let moments = 0;
    let videos = 0;
    for (const e of wanted) {
      const data = loaded.get(e.key);
      const found = data ? searchVideos(data.videos, q) : [];
      if (!found.length) continue;
      videos += found.length;
      moments += found.reduce((n, r) => n + r.total, 0);
      const page = url(`${e.festival}/${e.year}/`);
      const list = el('ul', 'vb-videos');
      const row = (r: VideoHits) => videoRow(page, r);
      list.append(...found.slice(0, VIDEOS).map(row));
      if (all) {
        const group = el('section', 'vb-edicion');
        const h = el('h2');
        const a = el('a', undefined, `${t(`festivales.${e.festival}`)} ${e.year}`);
        a.href = page;
        h.append(a);
        group.append(h, list);
        out.append(group);
      } else out.append(list);
      const rest = more(found.slice(VIDEOS), row, list, 'vb-mas-videos');
      if (rest) list.after(rest);
    }
    const pending = wanted.length - loaded.size - failed;
    const parts = [
      videos ? t('videos.buscar.resultados', { n: moments, videos }) : pending ? '' : t(all ? 'videos.buscar.sin_resultados_todas' : 'videos.buscar.sin_resultados', { q }),
      pending ? (all ? t('videos.buscar.progreso', { n: loaded.size + failed, total: wanted.length }) : t('videos.buscar.cargando')) : '',
      !pending && failed ? t('videos.buscar.error') : '',
    ];
    status.textContent = parts.filter(Boolean).join(' · ');
    note.hidden = !videos;
  }

  input.addEventListener('focus', () => void load(), { once: true });
  input.addEventListener('input', () => {
    void load();
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 150);
  });
  root.querySelector('[data-vb-form]')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    window.clearTimeout(timer);
    run();
  });

  root.hidden = false;
  // /buscar/?q=cadair&en=videos arrives with its query (the "otras ediciones" link of an edition page).
  if (all) {
    const p = new URLSearchParams(location.search);
    if (p.get('en') === 'videos' && p.get('q')) {
      input.value = p.get('q')!;
      void load();
      run();
    }
  }
}

for (const root of document.querySelectorAll<HTMLElement>('[data-vbuscar]')) setup(root);
