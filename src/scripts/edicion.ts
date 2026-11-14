import staticEditions from '../../data/approved/editions.json';
import { approvedForEdition, byLine, factDisplay, forEdition, mergeApproved, ownPending, pendingView, sortFacts, sourceLine, type Contribution } from '../lib/contrib';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { getClient } from '../lib/supabase';
import type { EditionState } from '../lib/types';
import { revealDecade } from '../lib/timeline';
import { maxState, mediaUrl, uploadMedia, uploadStates, type UploadLike } from '../lib/uploads';

type EditionRow = { festival: string; year: number; status: 'unknown' | 'held' | 'not_held'; note?: string | null };

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
    const dd = el('dd', undefined, value);
    const by = byLine(c);
    if (by) dd.append(' ', el('span', 'muted small', by));
    const fuente = sourceLine(c);
    if (fuente) dd.append(el('span', 'muted small fuente', fuente));
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
    li.append(el('blockquote', undefined, String(c.payload?.text ?? '')));
    const by = byLine(c);
    if (by) li.append(el('p', 'muted small', by));
    ul.append(li);
  }
  mount.append(ul);
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
  text.append(desc);
  const by = byLine(c);
  if (by) text.append(' ', el('span', 'muted small', by));
  if (pages.length > 1) {
    const p = el('p', 'aporte-paginas small');
    p.append(t('item.paginas', { n: pages.length }), ':');
    pages.forEach((u, i) => {
      const a = el('a', undefined, String(i + 1));
      a.href = u;
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
      const img = el('img');
      img.src = src;
      img.alt = v.text;
      img.loading = 'lazy';
      card.prepend(img);
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
  applyUploadStates(document, uploadStates(forEdition(all, festival, year, 'upload')));
  await renderDrafts(festival, year, { hechos, recuerdos, aportes });
}

/**
 * Raise grid cells, timeline rows, the edition badge and the "falta el
 * programa" slot to what approved uploads say (never downgrades).
 */
export function applyUploadStates(root: ParentNode, states: Map<string, EditionState>): void {
  if (!states.size) return;
  for (const node of root.querySelectorAll<HTMLElement>('[data-festival][data-year][data-state]')) {
    const { festival = '', year = '' } = node.dataset;
    const old = (node.dataset.state ?? 'none') as EditionState;
    const next = maxState(old, states.get(`${festival}:${year}`) ?? 'none');
    if (next === old || node.dataset.status === 'not_held') continue;
    node.dataset.state = next;
    revealDecade(node, next);
    const label = t(`estados.${next}`);
    if (node.matches('[data-cell]')) {
      node.classList.replace(`st-${old}`, `st-${next}`);
      node.setAttribute('aria-label', t('inicio.celda', { festival: t(`festivales.${festival}`), year, estado: label }));
      node.title = label;
    } else if (node.classList.contains('badge-state')) {
      node.classList.replace(`st-${old}`, `st-${next}`);
      node.textContent = label;
    } else {
      node.classList.replace(`tl-${old}`, `tl-${next}`);
      const first = node.querySelector('.st')?.firstChild;
      if (first?.nodeType === 3) first.textContent = label;
    }
    if (next === 'full') {
      for (const slot of root.querySelectorAll<HTMLElement>(`[data-falta-programa][data-festival="${festival}"][data-year="${year}"]`)) slot.hidden = true;
    }
  }
}

/** Mark editions that never happened (editions.status = not_held) on grids, timelines and the edition badge. */
export function applyEditionStatus(root: ParentNode, rows: EditionRow[]): void {
  const status = new Map<string, EditionRow['status']>();
  for (const r of rows) status.set(`${r.festival}:${r.year}`, r.status);
  const label = t('edicion.no_realizada');
  for (const node of root.querySelectorAll<HTMLElement>('[data-festival][data-year][data-state]')) {
    const { festival = '', year = '' } = node.dataset;
    if (status.get(`${festival}:${year}`) !== 'not_held' || node.dataset.status === 'not_held') continue;
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

/** Home and festival pages: live approved uploads raise the coverage the build baked from the export. */
async function overlayUploads(): Promise<void> {
  if (!document.querySelector('[data-cell], .timeline [data-state]')) return;
  const live = await liveQuery<UploadLike[]>(
    (c) => c.from('public_contributions').select('id, type, festival, year, payload').eq('type', 'upload').limit(5000),
    [],
  );
  applyUploadStates(document, uploadStates(live.data));
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
