import staticEditions from '../../data/approved/editions.json';
import { approvedForEdition, byLine, factDisplay, factInOriginal, forEdition, mergeApproved, ownPending, pendingView, sortFacts, sourceLine, type Contribution } from '../lib/contrib';
import { contentLang, t, tAround } from '../lib/i18n';
import { stateLabel } from '../lib/site';
import { liveQuery } from '../lib/live';
import { raiseStates, refreshStates } from './states';
import { url } from '../lib/paths';
import { getClient } from '../lib/supabase';
import type { EditionState } from '../lib/types';
import { maxState, mediaUrl, uploadMedia, uploadStates, type UploadLike } from '../lib/uploads';

type EditionRow = { festival: string; year: number; status: 'unknown' | 'held' | 'not_held'; note?: string | null };

/** Mark archive or community text as Spanish on pages in another language (WCAG 3.1.2). */
function original<E extends HTMLElement>(e: E): E {
  const l = contentLang();
  if (l) e.lang = l;
  return e;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Same markup as the static build renders into #hechos. */
export function renderFacts(mount: HTMLElement, facts: Contribution[]): void {
  mount.replaceChildren();
  if (!facts.length) return;
  const dl = el('dl', 'hechos');
  for (const c of sortFacts(facts)) {
    const { label, value } = factDisplay(c);
    const row = el('div');
    const dd = el('dd');
    dd.append(factInOriginal(c) ? original(el('span', undefined, value)) : value);
    const by = byLine(c);
    if (by) dd.append(' ', el('span', 'muted small', by));
    const fuente = sourceLine(c);
    if (fuente && contentLang()) {
      // "Fuente: …" in the page's language; what the contributor wrote, in theirs.
      const [before, after] = tAround('edicion.fuente', 'fuente');
      const s = el('span', 'muted small fuente');
      s.append(before, original(el('span', undefined, String(c.payload?.fuente ?? '').trim())), after);
      dd.append(s);
    } else if (fuente) dd.append(el('span', 'muted small fuente', fuente));
    row.append(el('dt', undefined, label), dd);
    dl.append(row);
  }
  mount.append(dl);
}

/** Same markup as the static build renders into #recuerdos. */
export function renderMemories(mount: HTMLElement, memories: Contribution[]): void {
  mount.replaceChildren();
  if (!memories.length) return;
  const ul = el('ul', 'recuerdos');
  for (const c of memories) {
    const li = el('li');
    li.append(original(el('blockquote', undefined, String(c.payload?.text ?? ''))));
    const by = byLine(c);
    if (by) li.append(el('p', 'muted small', by));
    ul.append(li);
  }
  mount.append(ul);
}

/** Same markup as the static build renders into #transcripciones: one folded block per approved transcription. */
export function renderEditionTranscriptions(mount: HTMLElement, list: Contribution[], titles: Record<string, string>): void {
  mount.replaceChildren();
  for (const c of list) {
    const title = c.item_id ? titles[c.item_id] : undefined;
    if (!title) continue; // restricted or unknown item: never link it
    const d = el('details', 'tr-detalle');
    const [before, after] = tAround('edicion.transcripcion_aporte', 'titulo');
    const s = el('summary');
    s.append(before, contentLang() ? original(el('span', undefined, title)) : title, after);
    const by = byLine(c);
    if (by) s.append(' ', el('span', 'muted small', by));
    const p = el('p', 'small');
    const a = el('a', undefined, t('edicion.transcripcion_documento'));
    a.href = url(`item/${c.item_id}/`);
    p.append(a);
    d.append(s, p, original(el('blockquote', 'tr-aporte', String(c.payload?.text ?? ''))));
    mount.append(d);
  }
}

function readTitles(mount: HTMLElement): Record<string, string> {
  try {
    const v = JSON.parse(mount.dataset.titles ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Public URL of a `media` bucket object: from the client when there is one, else from PUBLIC_SUPABASE_URL. */
function publicMedia(path: string): string | null {
  const client = getClient();
  if (client) {
    try {
      return client.storage.from('media').getPublicUrl(path).data.publicUrl;
    } catch {
      /* fall through */
    }
  }
  return mediaUrl(import.meta.env.PUBLIC_SUPABASE_URL, path);
}

/** One approved upload: thumbnail (linking to page 1), page links, category, description, byline. */
function uploadRow(c: Contribution): HTMLLIElement {
  const li = el('li', 'aporte');
  const cat = String(c.payload?.category ?? '');
  const desc = String(c.payload?.description ?? '') || t('edicion.aporte_sin_descripcion');
  const media = uploadMedia(c);
  const pages = (media?.pages ?? []).map(publicMedia).filter((u): u is string => Boolean(u));
  const thumb = media?.thumb ? publicMedia(media.thumb) : null;
  if (thumb || pages.length) {
    const a = el('a', 'aporte-thumb');
    a.href = pages[0] ?? thumb!;
    a.dataset.lb = `aporte-${c.id}`;
    const img = el('img');
    img.src = thumb ?? pages[0];
    img.alt = t('item.miniatura_alt', { titulo: desc });
    img.loading = 'lazy';
    img.decoding = 'async';
    a.append(img);
    li.append(a);
  }
  const text = el('div', 'aporte-texto');
  if (cat) text.append(el('span', 'badge', t(`categorias.${cat}`)), ' ');
  text.append(c.payload?.description ? original(el('span', undefined, desc)) : desc);
  const by = byLine(c);
  if (by) text.append(' ', el('span', 'muted small', by));
  if (pages.length > 1) {
    const p = el('p', 'aporte-paginas small');
    p.append(t('item.paginas', { n: pages.length }), ':');
    pages.forEach((u, i) => {
      const a = el('a', undefined, String(i + 1));
      a.href = u;
      a.dataset.lb = `aporte-${c.id}`;
      a.setAttribute('aria-label', t('item.ampliar', { n: i + 1 }));
      p.append(' ', a);
    });
    text.append(p);
  }
  li.append(text);
  return li;
}

/** Approved uploads, listed under the contribution links in #aportes (same markup as the static build). */
export function renderUploads(mount: HTMLElement, uploads: Contribution[], offline: boolean): void {
  mount.querySelector('.aportes-live')?.remove();
  const box = el('div', 'aportes-live');
  if (uploads.length) {
    box.append(el('h3', 'small', t('edicion.aportes_aprobados')));
    const ul = el('ul', 'aportes-lista');
    for (const c of uploads) ul.append(uploadRow(c));
    box.append(ul);
  }
  if (offline) box.append(el('p', 'muted small', t('estado.sin_conexion')));
  if (box.childNodes.length) mount.append(box);
}

/** A short-lived link to the contributor's own original (allowed by uploads_select_own). */
async function ownOriginal(path: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client.storage.from('uploads').createSignedUrl(path, 600);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}

/** One pending contribution as a dashed card: pill, text, and an image preview or the file name. */
function draftCard(c: Contribution): HTMLDivElement {
  const v = pendingView(c);
  const card = el('div', 'borrador');
  const text = el('div', 'borrador-texto');
  text.append(el('span', 'pill pill-pending', t('edicion.pendiente')), v.text);
  if (v.label) text.append(el('p', 'muted small', v.label));
  card.append(text);
  if (v.preview === 'image' && v.path) {
    void ownOriginal(v.path).then((src) => {
      if (!src) return;
      const a = el('a');
      a.href = src;
      a.dataset.lb = `borrador-${c.id}`;
      a.setAttribute('aria-label', t('item.ampliar_imagen'));
      const img = el('img');
      img.src = src;
      img.alt = v.text;
      img.loading = 'lazy';
      a.append(img);
      card.prepend(a);
    });
  }
  return card;
}

/** The signed-in contributor's own pending rows, each in its section, after the published ones. */
async function renderDrafts(festival: string, year: number, mounts: Record<'hechos' | 'recuerdos' | 'aportes', HTMLElement | null>): Promise<void> {
  const rows = await ownPending(festival, year);
  for (const m of Object.values(mounts)) m?.querySelector('.borradores')?.remove();
  if (!rows.length) return;
  for (const section of ['hechos', 'recuerdos', 'aportes'] as const) {
    const mount = mounts[section];
    const mine = rows.filter((c) => pendingView(c).section === section);
    if (!mount || !mine.length) continue;
    const box = el('div', 'borradores');
    if (section === 'aportes') box.append(el('h3', 'small', t('edicion.pendientes_titulo')));
    for (const c of mine) box.append(draftCard(c));
    mount.append(box);
  }
}

function readStatic(): Contribution[] {
  const s = document.getElementById('aprobados-data');
  if (!s?.textContent) return [];
  try {
    const v = JSON.parse(s.textContent);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function hydrateEdition(): Promise<void> {
  const hechos = document.getElementById('hechos');
  const recuerdos = document.getElementById('recuerdos');
  const aportes = document.getElementById('aportes');
  const ref = hechos ?? recuerdos ?? aportes;
  if (!ref) return;
  const festival = ref.dataset.festival ?? '';
  const year = Number(ref.dataset.year);
  if (!festival || !Number.isInteger(year)) return;

  const live = await approvedForEdition(festival, year);
  if (live.offline) {
    // Keep what the static build rendered; only say we could not check for news.
    if (aportes) renderUploads(aportes, forEdition(readStatic(), festival, year, 'upload'), true);
    await renderDrafts(festival, year, { hechos, recuerdos, aportes });
    return;
  }
  const all = mergeApproved(readStatic(), live.data);
  if (hechos) renderFacts(hechos, forEdition(all, festival, year, 'fact'));
  if (recuerdos) renderMemories(recuerdos, forEdition(all, festival, year, 'memory'));
  if (aportes) renderUploads(aportes, forEdition(all, festival, year, 'upload'), false);
  const trMount = document.getElementById('transcripciones');
  if (trMount) renderEditionTranscriptions(trMount, forEdition(all, festival, year, 'transcription'), readTitles(trMount));
  applyUploadStates(document, uploadStates(forEdition(all, festival, year, 'upload')));
  await renderDrafts(festival, year, { hechos, recuerdos, aportes });
}

/** Raise grid cells, timeline rows and the edition badge to what approved uploads say (never lowers). */
export const applyUploadStates = raiseStates;

/**
 * Mark editions that never happened (editions.status = not_held) on grids, timelines
 * and the edition badge; ones known to have happened but with nothing archived say
 * so instead of asking "¿Se realizó?".
 */
export function applyEditionStatus(root: ParentNode, rows: EditionRow[]): void {
  const status = new Map<string, EditionRow['status']>();
  for (const r of rows) status.set(`${r.festival}:${r.year}`, r.status);
  const label = t('edicion.no_realizada');
  for (const node of root.querySelectorAll<HTMLElement>('[data-festival][data-year][data-state]')) {
    const { festival = '', year = '' } = node.dataset;
    const s = status.get(`${festival}:${year}`);
    if (s === 'held' && node.dataset.status !== 'held' && node.dataset.status !== 'not_held') {
      node.dataset.status = 'held';
      if (node.dataset.state === 'none') setHeldLabel(node, festival, year);
      continue;
    }
    if (s !== 'not_held' || node.dataset.status === 'not_held') continue;
    node.dataset.status = 'not_held';
    if (node.matches('[data-cell]')) {
      node.setAttribute('aria-label', t('inicio.celda', { festival: t(`festivales.${festival}`), year, estado: label }));
      node.title = label;
    } else if (node.classList.contains('badge-state')) {
      node.classList.add('st-not_held');
      node.textContent = label;
    } else {
      node.classList.add('tl-not_held');
      const st = node.querySelector('.st');
      if (st) st.textContent = label;
    }
  }
}

/** "Se realizó, sin documentos" on a cell, timeline row or badge. */
function setHeldLabel(node: HTMLElement, festival: string, year: string): void {
  const label = stateLabel('none', 'held');
  if (node.matches('[data-cell]')) {
    node.setAttribute('aria-label', t('inicio.celda', { festival: t(`festivales.${festival}`), year, estado: label }));
    node.title = label;
  } else if (node.classList.contains('badge-state')) node.textContent = label;
  else {
    const first = node.querySelector('.st')?.firstChild;
    if (first?.nodeType === 3) first.textContent = label;
  }
}

/** Grids, timelines and the edition badge: catalog-only state (live corrections included) raised by live uploads. */
async function overlayUploads(): Promise<void> {
  await refreshStates(document);
}

async function overlayEditions(): Promise<void> {
  if (!document.querySelector('[data-festival][data-year][data-state]')) return;
  const live = await liveQuery<EditionRow[]>((c) => c.from('editions').select('festival, year, status'), []);
  // Live rows win over the last export for the same edition; offline, the export alone.
  const merged = new Map<string, EditionRow>();
  for (const r of [...(staticEditions as EditionRow[]), ...live.data]) merged.set(`${r.festival}:${r.year}`, r);
  applyEditionStatus(document, [...merged.values()]);
}

if (typeof document !== 'undefined') {
  void hydrateEdition();
  void overlayEditions();
  void overlayUploads();
}
