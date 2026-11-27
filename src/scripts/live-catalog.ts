/**
 * Live corrections: tags approved after this page was built move documents at
 * once, without a rebuild. One small query (tags newer than the build's
 * <meta name="amg-tags-at">); only when there are any is the compact catalog
 * (/datos/indice.json) loaded and the page updated: card lists, the item page
 * header and edition coverage. On an item page, title, credit, caption and the
 * no-text note follow the same corrections (from the baked #item-overlay).
 */
import { liveQuery } from '../lib/live';
import { t } from '../lib/i18n';
import { url } from '../lib/paths';
import { affectedStates, changedItems, inScope, type IndexItem, type Scope } from '../lib/placement';
import { applyTags, type Taggable, type TagLike } from '../lib/tags';
import { refreshStates } from './states';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Same markup as components/ItemCard.astro. */
export function cardFor(i: IndexItem): HTMLLIElement {
  const li = el('li', 'card');
  li.dataset.item = i.id;
  const a = el('a');
  a.href = url(`item/${i.id}/`);
  const frame = el('span', 'frame');
  if (i.thumb) {
    const img = el('img');
    img.src = i.thumb;
    img.alt = t('item.miniatura_alt', { titulo: i.title });
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 240;
    img.height = 320;
    frame.append(img);
  } else {
    frame.append(el('span', 'ph', i.restricted ? t('comun.restringido_corto') : t(`item.tipos.${i.formato}`)));
  }
  a.append(frame, el('span', 't', i.title));
  li.append(a);
  if (i.fecha.inferred || i.restricted) {
    const b = el('span', 'badges');
    if (i.fecha.inferred) b.append(el('span', 'badge', t('comun.ano_estimado')));
    if (i.restricted) b.append(el('span', 'badge badge-restricted', t('comun.restringido_corto')));
    li.append(b);
  }
  return li;
}

function scopeOf(ul: HTMLElement): Scope {
  const d = ul.dataset;
  return {
    coleccion: d.scopeFestival ?? '',
    year: d.scopeYear === 'none' ? 'none' : Number(d.scopeYear),
    tipo: d.scopeCategory,
    undated: d.scopeUndated === undefined ? undefined : d.scopeUndated === 'true',
  };
}

/** Move cards in and out of every scoped list; show or hide lists and their sections. */
export function updateLists(root: ParentNode, changes: { before: IndexItem; after: IndexItem }[]): void {
  for (const ul of root.querySelectorAll<HTMLElement>('ul.cards[data-scope-coleccion]')) {
    const scope = scopeOf(ul);
    for (const { after } of changes) {
      const card = ul.querySelector<HTMLElement>(`li[data-item="${after.id}"]`);
      const belongs = inScope(after, scope);
      if (card && !belongs) card.remove();
      else if (card && belongs) card.replaceWith(cardFor(after));
      else if (!card && belongs) ul.append(cardFor(after));
    }
    const empty = !ul.querySelector('li[data-item]');
    ul.hidden = empty;
    const section = ul.closest<HTMLElement>('[data-cat-section]');
    if (section && section.dataset.catSection !== 'programa') section.hidden = empty;
    const note = ul.parentElement?.querySelector<HTMLElement>('[data-scope-empty]');
    if (note) note.hidden = !empty;
  }
}

/** Item page: year, festival, category and the estimated-year badge. */
export function updateItemPage(root: ParentNode, changes: { before: IndexItem; after: IndexItem }[]): void {
  const head = root.querySelector<HTMLElement>('[data-item-page]');
  const ch = head && changes.find((c) => c.after.id === head.dataset.itemPage);
  if (!ch) return;
  const i = ch.after;
  for (const n of root.querySelectorAll<HTMLElement>('[data-live="tipo"]')) n.textContent = t(`categorias.${i.tipo}`);
  const fest = root.querySelector<HTMLAnchorElement>('a[data-live="coleccion"]');
  if (fest) {
    fest.href = url(`${i.coleccion}/`);
    fest.textContent = t(`festivales.${i.coleccion}`);
  }
  const yr = root.querySelector<HTMLAnchorElement>('a[data-live="year"]');
  if (yr) {
    yr.href = i.fecha.year ? url(`${i.coleccion}/${i.fecha.year}/`) : url(`general/${i.coleccion}/`);
    yr.textContent = i.fecha.year ? String(i.fecha.year) : i.fecha.undated ? t('item.sin_fecha') : t('item.general');
  }
  if (!i.fecha.inferred) root.querySelector('[data-live="inferred"]')?.remove();
  const gone = root.querySelector<HTMLElement>('[data-retirado]');
  if (gone && i.hidden) gone.hidden = false;
}

/** What an item page shows of the overlay (src/lib/tags.ts) beyond its place. */
export type ItemOverlay = Taggable & { title: string; rights: string; note_public: string; no_text: boolean };

/** Item page: title, rights, caption, no-text note and the hidden notice, from the corrected item. */
export function updateItemOverlay(root: Document, i: ItemOverlay): void {
  const h1 = root.querySelector<HTMLElement>('[data-item-page] h1');
  if (h1 && h1.textContent !== i.title) {
    h1.textContent = i.title;
    root.title = root.title.replace(/^.*?( · | \| |$)/, `${i.title}$1`);
  }
  for (const [key, value] of [['rights', i.rights], ['caption', i.note_public]] as const) {
    const box = root.querySelector<HTMLElement>(`[data-live="${key}"]`);
    const p = box?.querySelector('p');
    if (!box || !p) continue;
    p.textContent = value;
    box.hidden = !value;
  }
  const nt = root.querySelector<HTMLElement>('[data-live="no_text"]');
  if (nt) nt.hidden = !i.no_text;
  const gone = root.querySelector<HTMLElement>('[data-retirado]');
  if (gone) gone.hidden = !i.hidden;
}

/** The item page's baked overlay values, or null on other pages. */
export function readOverlay(root: Document): ItemOverlay | null {
  try {
    const v = JSON.parse(root.getElementById('item-overlay')?.textContent ?? 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** Cards and edition coverage after corrections; returns how many items moved. */
export function applyChanges(root: ParentNode, before: IndexItem[], after: IndexItem[]): number {
  const changes = changedItems(before, after);
  if (!changes.length) return 0;
  updateLists(root, changes);
  updateItemPage(root, changes);
  for (const [key, state] of affectedStates(changes, after)) {
    const [f, y] = key.split(':');
    for (const n of root.querySelectorAll<HTMLElement>(`[data-coleccion="${f}"][data-year="${y}"][data-cat-state]`)) n.dataset.catState = state;
  }
  return changes.length;
}

async function run(): Promise<void> {
  const since = document.querySelector<HTMLMetaElement>('meta[name="amg-tags-at"]')?.content || '';
  const live = await liveQuery<TagLike[]>(
    (c) => {
      let q = c.from('public_contributions').select('type, item_id, payload, reviewed_at, created_at').in('type', ['tag', 'report']);
      if (since) q = q.gt('reviewed_at', since);
      return q.order('reviewed_at', { ascending: true }).limit(2000);
    },
    [],
  );
  if (live.offline || !live.data.length) return;
  const base = readOverlay(document);
  if (base) updateItemOverlay(document, applyTags([base], live.data)[0]);
  let index: IndexItem[];
  try {
    const res = await fetch(url('datos/indice.json'));
    if (!res.ok) return;
    index = await res.json();
  } catch {
    return;
  }
  if (applyChanges(document, index, applyTags(index, live.data))) await refreshStates(document);
}

if (typeof document !== 'undefined') void run();
