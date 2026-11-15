/**
 * Live corrections: tags approved after this page was built move documents at
 * once, without a rebuild. One small query (tags newer than the build's
 * <meta name="amg-tags-at">); only when there are any is the compact catalog
 * (/datos/indice.json) loaded and the page updated: card lists, the item page
 * header and edition coverage.
 */
import { liveQuery } from '../lib/live';
import { t } from '../lib/i18n';
import { url } from '../lib/paths';
import { affectedStates, changedItems, inScope, type IndexItem, type Scope } from '../lib/placement';
import { applyTags, type TagLike } from '../lib/tags';
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
    frame.append(el('span', 'ph', i.restricted ? t('comun.restringido_corto') : t(`item.tipos.${i.kind}`)));
  }
  a.append(frame, el('span', 't', i.title));
  li.append(a);
  if (i.year_inferred || i.restricted) {
    const b = el('span', 'badges');
    if (i.year_inferred) b.append(el('span', 'badge', t('comun.ano_estimado')));
    if (i.restricted) b.append(el('span', 'badge badge-restricted', t('comun.restringido_corto')));
    li.append(b);
  }
  return li;
}

function scopeOf(ul: HTMLElement): Scope {
  const d = ul.dataset;
  return {
    festival: d.scopeFestival ?? '',
    year: d.scopeYear === 'none' ? 'none' : Number(d.scopeYear),
    category: d.scopeCategory,
    undated: d.scopeUndated === undefined ? undefined : d.scopeUndated === 'true',
  };
}

/** Move cards in and out of every scoped list; show or hide lists and their sections. */
export function updateLists(root: ParentNode, changes: { before: IndexItem; after: IndexItem }[]): void {
  for (const ul of root.querySelectorAll<HTMLElement>('ul.cards[data-scope-festival]')) {
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
  for (const n of root.querySelectorAll<HTMLElement>('[data-live="category"]')) n.textContent = t(`categorias.${i.category}`);
  const fest = root.querySelector<HTMLAnchorElement>('a[data-live="festival"]');
  if (fest) {
    fest.href = url(`${i.festival}/`);
    fest.textContent = t(`festivales.${i.festival}`);
  }
  const yr = root.querySelector<HTMLAnchorElement>('a[data-live="year"]');
  if (yr) {
    yr.href = i.year ? url(`${i.festival}/${i.year}/`) : url(`general/${i.festival}/`);
    yr.textContent = i.year ? String(i.year) : i.undated ? t('item.sin_fecha') : t('item.general');
  }
  if (!i.year_inferred) root.querySelector('[data-live="inferred"]')?.remove();
  const gone = root.querySelector<HTMLElement>('[data-retirado]');
  if (gone && i.hidden) gone.hidden = false;
}

/** Cards and edition coverage after corrections; returns how many items moved. */
export function applyChanges(root: ParentNode, before: IndexItem[], after: IndexItem[]): number {
  const changes = changedItems(before, after);
  if (!changes.length) return 0;
  updateLists(root, changes);
  updateItemPage(root, changes);
  for (const [key, state] of affectedStates(changes, after)) {
    const [f, y] = key.split(':');
    for (const n of root.querySelectorAll<HTMLElement>(`[data-festival="${f}"][data-year="${y}"][data-cat-state]`)) n.dataset.catState = state;
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
