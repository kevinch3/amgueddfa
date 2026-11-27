import { isListed, isPublic } from './visibilidad';
import raw from '../data/catalog.json';
import approvedRaw from '../../data/approved/contributions.json';
import editionsRaw from '../../data/approved/editions.json';
import { t } from './i18n';
import { siteMedia } from './paths';
import { FESTIVAL_IDS } from './colecciones';
import type { EditionState, FestivalSlug, Item } from './types';
import { maxState, mediaUrl, uploadMedia, uploadState, type UploadLike } from './uploads';
import { applyTags, catalogState, latestTagAt, type TagLike } from './tags';

/** Approved uploads from the last export (data/approved/contributions.json). */
const APPROVED_UPLOADS: UploadLike[] = (approvedRaw as UploadLike[]).filter((c) => c?.type === 'upload');

const FESTIVAL_SLUGS: readonly FestivalSlug[] = FESTIVAL_IDS;

/** Approved tags and reports from the last export: applied here so every build places (or hides) items as corrected. */
const APPROVED_TAGS: TagLike[] = (approvedRaw as TagLike[]).filter((c) => c?.type === 'tag' || c?.type === 'report');
/** Newest tag approval this build includes; pages fetch only later ones (scripts/live-catalog.ts). */
export const TAGS_AT: string | null = latestTagAt(APPROVED_TAGS);

let current: Item[] = applyTags((raw as { items: Item[] }).items, APPROVED_TAGS);

/** Test hook: replace the catalog contents. */
export function setItems(list: Item[]): void {
  current = list;
}

/** Items listed on the site: everything but documents an approved report hid. */
export function items(): Item[] {
  return current.filter((i) => !i.hidden && isListed(i));
}

/** Every item, hidden ones included: each keeps its page (with a notice). */
export function allItems(): Item[] {
  return current.filter(isListed);
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
  return items().filter((i) => i.coleccion === f && i.fecha.year === year);
}

/**
 * Coverage of one edition: the static catalog (a programa PDF is full) raised
 * by approved uploads (a programa with pages is full, anything else some).
 */
export function editionState(f: FestivalSlug, year: number, uploads: UploadLike[] = APPROVED_UPLOADS): EditionState {
  return maxState(editionCatalogState(f, year), uploadState(uploads, f, year));
}

/** Coverage from catalog items alone (baked as data-cat-state so live overlays can lower it too). */
export function editionCatalogState(f: FestivalSlug, year: number): EditionState {
  return catalogState(editionItems(f, year));
}

/** Earliest year anyone may document: bounds the contribution form, not the timelines. */
export const YEAR_FLOOR = 1865;

/** Anything with an edition, as far as the start of a timeline needs it. */
export type DatedLike = { coleccion: string | null; year: number | null; type?: string; payload?: Record<string, any> | null };

/** Every approved contribution from the last export, any type. */
const APPROVED_DATED: DatedLike[] = approvedRaw as DatedLike[];

/** A "no se realizó" fact records an edition that never happened: it is not material. */
function isMaterial(c: DatedLike): boolean {
  return !(c.type === 'fact' && c.payload?.field === 'edicion_realizada' && c.payload?.value === 'no');
}

/** Earliest year with a dated catalog item or an approved contribution; null when none. */
export function firstMaterialYear(f: FestivalSlug, approved: DatedLike[] = APPROVED_DATED): number | null {
  const years = [...items().map((i) => ({ coleccion: i.coleccion, year: i.fecha.year })), ...approved.filter(isMaterial)]
    .filter((i) => i.coleccion === f && i.year !== null)
    .map((i) => i.year as number);
  return years.length ? Math.min(...years) : null;
}

/** [earliest documented year, current year]; a festival with nothing yet is just this year. */
export function yearRange(f: FestivalSlug, approved: DatedLike[] = APPROVED_DATED): [number, number] {
  const end = new Date().getFullYear();
  return [firstMaterialYear(f, approved) ?? end, end];
}

/**
 * Every year of the timeline plus documented not-held years outside it (#22): a
 * "no se realizó" before the first material is real data, not an empty year.
 */
export function editionYears(f: FestivalSlug, notHeld: number[] = [], approved: DatedLike[] = APPROVED_DATED): number[] {
  const [a, b] = yearRange(f, approved);
  const ys = new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k));
  for (const y of notHeld) ys.add(y);
  return [...ys].sort((x, y) => x - y);
}

/**
 * Nothing at all for this edition: no catalog item and no approved contribution
 * of any type (upload, fact or memory) other than a "no se realizó" fact. Empty decades collapse on this, not on
 * editionState, so a decade with only a memory stays open.
 */
export function undocumented(f: FestivalSlug, year: number, approved: DatedLike[] = APPROVED_DATED): boolean {
  return editionState(f, year) === 'none' && !approved.some((c) => c.coleccion === f && c.year === year && isMaterial(c));
}

/** Catalog titles that name the cover of a programa. */
const TAPA_TITLE = /\b(tapa|portada)\b/i;

/** An edition's cover: a large page image (year header) and a thumbnail (timeline). */
/** The edition cover's largest box in CSS px (global.css .tapa: max-width 16rem, max-height 22rem). */
const COVER_MAX = [256, 352] as const;

/** The size a cover of `size` pixels is shown at: inside COVER_MAX, proportions kept, never enlarged.
 *  Given as the img's width/height, the browser reserves exactly that box before the image loads (#5). */
export function coverBox(size: [number, number] | null | undefined): { width?: number; height?: number } {
  if (!size || !(size[0] > 0) || !(size[1] > 0)) return {};
  const k = Math.min(COVER_MAX[0] / size[0], COVER_MAX[1] / size[1], 1);
  return { width: Math.round(size[0] * k), height: Math.round(size[1] * k) };
}

/** width/height: the size the cover is shown at, when known (catalog covers), so the layout does not jump while it loads. */
export type Cover = { page: string; thumb: string; width?: number; height?: number };

/** Cover from an approved upload's derivatives in the media bucket; null without page images. */
function uploadCover(c: UploadLike, base: string | undefined): Cover | null {
  const m = uploadMedia(c);
  const page = m?.pages[0] ? mediaUrl(base, m.pages[0]) : null;
  if (!page) return null;
  return { page, thumb: (m?.thumb ? mediaUrl(base, m.thumb) : null) ?? page };
}

/**
 * The cover that identifies an edition: the latest approved upload an admin
 * marked as tapa; else a catalog item titled "Tapa…"/"Portada…"; else page 1 of
 * the catalog programa PDF (never a restricted item); else page 1 of an
 * approved upload confirmed complete; else null.
 */
export function editionCover(
  f: FestivalSlug,
  year: number,
  uploads: UploadLike[] = APPROVED_UPLOADS,
  mediaBase: string | undefined = import.meta.env.PUBLIC_SUPABASE_URL,
): Cover | null {
  const mine = uploads.filter((c) => c.type === 'upload' && c.coleccion === f && c.year === year && c.payload?.tipo === 'programa');
  const tapas = mine
    .filter((c) => c.payload?.tapa === true)
    .sort((a, b) => String(b.reviewed_at ?? '').localeCompare(String(a.reviewed_at ?? '')));
  for (const c of tapas) {
    const cover = uploadCover(c, mediaBase);
    if (cover) return cover;
  }
  // Catalog: a programa item curated as the cover ("Tapa…", "Portada…") first, then page 1 of the programa PDF.
  // Only programa: e.g. the rules of a cover-design contest ("concurso-tapa-programa", bases) are not the cover.
  const list = editionItems(f, year).filter((i) => isPublic(i) && pageUrls(i).length > 0);
  const fromCatalog = list.find((i) => i.tipo === 'programa' && TAPA_TITLE.test(i.title))
    ?? list.find((i) => i.tipo === 'programa' && i.formato === 'pdf');
  if (fromCatalog) {
    const page = pageUrls(fromCatalog)[0];
    return { page, thumb: thumbUrl(fromCatalog) ?? page, ...coverBox(fromCatalog.page_size) };
  }
  for (const c of mine.filter((x) => x.payload?.complete === true)) {
    const cover = uploadCover(c, mediaBase);
    if (cover) return cover;
  }
  return null;
}

/** Editions with some material but no programa PDF, newest first. */
export function mostWanted(limit: number, uploads: UploadLike[] = APPROVED_UPLOADS): { coleccion: FestivalSlug; year: number }[] {
  const out: { coleccion: FestivalSlug; year: number }[] = [];
  for (const coleccion of FESTIVAL_SLUGS) {
    // Same uploads for the range as for the state: only uploads (or catalog items) can make an edition "some".
    const [first, last] = yearRange(coleccion, uploads);
    for (let year = first; year <= last; year++) {
      if (editionState(coleccion, year, uploads) === 'some') out.push({ coleccion, year });
    }
  }
  out.sort(
    (a, b) =>
      b.year - a.year || FESTIVAL_SLUGS.indexOf(a.coleccion) - FESTIVAL_SLUGS.indexOf(b.coleccion),
  );
  return out.slice(0, limit);
}

/** Public thumbnail URL; null for restricted items (their files are not published). */
export function thumbUrl(item: Item): string | null {
  if (!isPublic(item) || !item.thumb) return null;
  return siteMedia(item.thumb);
}

/** Public page image URLs; empty for restricted items. */
export function pageUrls(item: Item): string[] {
  if (!isPublic(item)) return [];
  return item.page_paths.map((p) => siteMedia(p));
}

const EDITION_STATUS = new Map((editionsRaw as { coleccion: string; year: number; status: string }[]).map((e) => [`${e.coleccion}:${e.year}`, e.status]));

/** Whether an edition took place, from the last export (live pages refresh it in edicion.ts). */
export function editionStatus(f: FestivalSlug, year: number): 'held' | 'not_held' | 'unknown' {
  const s = EDITION_STATUS.get(`${f}:${year}`);
  return s === 'held' || s === 'not_held' ? s : 'unknown';
}
