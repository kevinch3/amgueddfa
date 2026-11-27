import { DEFAULT_LOCALE, LOCALES, isLocale, locale, type Locale } from './i18n';
import { idsDe } from './colecciones';

function siteBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
}

/** A file (favicon.svg, contacto.png, datos/indice.json, media/…): its last path segment has an extension. */
function isFile(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path.split(/[?#]/)[0]);
}

/**
 * The site is a museum of collections; the Eisteddfod archive is the first (#189).
 * Its pages live under /eisteddfod/: the home ('' or '#…'), festivals, years, items,
 * undated documents, search, quick tasks, ranking, contribute and the open data.
 * Site-wide pages (sign-in, profile, admin, legal, sources at /fuente/, sitemap,
 * llms.txt) and static files stay at the root. Callers keep writing collection
 * paths ("chubut/1937/"); url() adds the collection.
 */
export const EISTEDDFOD = 'eisteddfod';
/** The archive's own pages besides its festivals. */
const EISTEDDFOD_PAGES = ['', 'item', 'general', 'buscar', 'tareas', 'ranking', 'contribuir', 'datos'];
export const EISTEDDFOD_SEGMENTS: ReadonlySet<string> = new Set([...EISTEDDFOD_PAGES, ...idsDe(EISTEDDFOD)]);

/** The collection prefix a path needs ("chubut/1937/" → "eisteddfod/"), or '' for a site-wide path. */
export function collectionPrefix(path: string): string {
  const first = path.replace(/^\/+/, '').split(/[/?#]/)[0];
  if (first.includes('.') && first !== '') return ''; // a root file: llms.txt, sitemap.xml, favicon.svg
  return EISTEDDFOD_SEGMENTS.has(first) ? `${EISTEDDFOD}/` : '';
}

/** Whether a path (no base, no language) is one the move to /eisteddfod/ took away (#189). */
export function isOldEisteddfodPath(path: string): boolean {
  const p = path.replace(/^\/+/, '');
  return p !== '' && collectionPrefix(p) !== '';
}

/**
 * Prefix an internal path with the site base (e.g. / on amgueddfa.org), the
 * language prefix for a page (/cy/, /en/…; none for Spanish; files keep one address
 * for every language) and, for an Eisteddfod archive path, its collection.
 */
export function url(path: string, loc: Locale = locale()): string {
  const p = path.replace(/^\/+/, '');
  const prefix = loc === DEFAULT_LOCALE || isFile(p) ? '' : `${loc}/`;
  return `${siteBase()}/${prefix}${collectionPrefix(p)}${p}`;
}

/** The site root (the museum's hub page), in a language. */
export function rootUrl(loc: Locale = locale()): string {
  return `${siteBase()}/${loc === DEFAULT_LOCALE ? '' : `${loc}/`}`;
}

/** The language a site path is in: its language prefix ("/cy/chubut/" → cy), else Spanish. */
export function localeFromPath(pathname: string): Locale {
  const base = siteBase();
  const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : pathname.replace(/^\/+/, '');
  const first = rest.split('/')[0];
  return isLocale(first) && first !== DEFAULT_LOCALE ? first : DEFAULT_LOCALE;
}

/** A site path without its language prefix ("/cy/chubut/1937/" → "/chubut/1937/"). */
export function stripLocale(pathname: string): string {
  const loc = localeFromPath(pathname);
  if (loc === DEFAULT_LOCALE) return pathname;
  const base = siteBase();
  return `${base}/${pathname.slice(base.length + 1 + loc.length).replace(/^\/+/, '')}`;
}

/** The same page in every language, for hreflang and the language menu. */
export function alternates(pathname: string): { locale: Locale; href: string }[] {
  const base = siteBase();
  // A built page's path is already final (collection included): only the language changes.
  const page = stripLocale(pathname).slice(base.length).replace(/^\/+/, '');
  return LOCALES.map((l) => ({ locale: l, href: `${base}/${l === DEFAULT_LOCALE ? '' : `${l}/`}${page}` }));
}

/**
 * Where catalog page images and thumbnails are served from: the R2 bucket behind
 * this domain (they no longer ship with the site, which is capped at 100 MB).
 * PUBLIC_MEDIA_BASE overrides it; set it to "" to serve /media/ from the site.
 */
export const MEDIA_BASE = 'https://media.amgueddfa.org';

/** Public URL of a catalog derivative ("<id>/thumb.webp"). */
export function siteMedia(path: string, base: string | undefined = import.meta.env.PUBLIC_MEDIA_BASE): string {
  const b = (base ?? MEDIA_BASE).replace(/\/+$/, '');
  const p = `media/${path.replace(/^\/+/, '')}`;
  return b ? `${b}/${p}` : url(p);
}

/** Object path in the public `media` bucket of a released restricted item's file ("p01.webp"). */
export function releasedPath(id: string, file: string): string {
  return `released/${id}/${file.split('/').pop()}`;
}
