import raw from '../data/catalog.json';
import approvedRaw from '../../data/approved/contributions.json';
import { t } from './i18n';
import { url } from './paths';
import type { EditionState, FestivalSlug, Item } from './types';
import { maxState, uploadState, type UploadLike } from './uploads';

/** Approved uploads from the last export (data/approved/contributions.json). */
const APPROVED_UPLOADS: UploadLike[] = (approvedRaw as UploadLike[]).filter((c) => c?.type === 'upload');

const FESTIVAL_SLUGS: FestivalSlug[] = ['chubut', 'juventud', 'mimosa', 'trevelin'];

let current: Item[] = (raw as { items: Item[] }).items;

/** Test hook: replace the catalog contents. */
export function setItems(list: Item[]): void {
  current = list;
}

export function items(): Item[] {
  return current;
}

export function festivals(): { slug: FestivalSlug; name: string; nameCy: string }[] {
  return FESTIVAL_SLUGS.map((slug) => ({
    slug,
    name: t(`festivales.${slug}`),
    nameCy: t(`festivales_cy.${slug}`),
  }));
}

/** Items of one edition. Undated items (year null) never belong to an edition. */
export function editionItems(f: FestivalSlug, year: number): Item[] {
  return current.filter((i) => i.festival === f && i.year === year);
}

/**
 * Coverage of one edition: the static catalog (a programa PDF is full) raised
 * by approved uploads (a programa with pages is full, anything else some).
 */
export function editionState(f: FestivalSlug, year: number, uploads: UploadLike[] = APPROVED_UPLOADS): EditionState {
  const list = editionItems(f, year);
  const fromCatalog: EditionState = list.some((i) => i.category === 'programa' && i.kind === 'pdf')
    ? 'full'
    : list.length > 0 ? 'some' : 'none';
  return maxState(fromCatalog, uploadState(uploads, f, year));
}

/** [earliest year with material, current year]. */
export function yearRange(f: FestivalSlug): [number, number] {
  const years = current
    .filter((i) => i.festival === f && i.year !== null)
    .map((i) => i.year as number);
  const end = new Date().getFullYear();
  return [years.length ? Math.min(...years) : end, end];
}

/** Editions with some material but no programa PDF, newest first. */
export function mostWanted(limit: number, uploads: UploadLike[] = APPROVED_UPLOADS): { festival: FestivalSlug; year: number }[] {
  const out: { festival: FestivalSlug; year: number }[] = [];
  for (const festival of FESTIVAL_SLUGS) {
    const [first, last] = yearRange(festival);
    for (let year = first; year <= last; year++) {
      if (editionState(festival, year, uploads) === 'some') out.push({ festival, year });
    }
  }
  out.sort(
    (a, b) =>
      b.year - a.year || FESTIVAL_SLUGS.indexOf(a.festival) - FESTIVAL_SLUGS.indexOf(b.festival),
  );
  return out.slice(0, limit);
}

/** Public thumbnail URL; null for restricted items (their files are not published). */
export function thumbUrl(item: Item): string | null {
  if (item.restricted || !item.thumb) return null;
  return url(`media/${item.thumb}`);
}

/** Public page image URLs; empty for restricted items. */
export function pageUrls(item: Item): string[] {
  if (item.restricted) return [];
  return item.page_paths.map((p) => url(`media/${p}`));
}
