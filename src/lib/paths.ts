import { DEFAULT_LOCALE, LOCALES, isLocale, locale, type Locale } from './i18n';

function siteBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
}

/** A file (favicon.svg, contacto.png, datos/indice.json, media/…): its last path segment has an extension. */
function isFile(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path.split(/[?#]/)[0]);
}

/**
 * Prefix an internal path with the site base (e.g. / on amgueddfa.kevinroberts.ar)
 * and, for a page, the language prefix (/cy/, /en/…; none for Spanish). Files keep
 * one address for every language.
 */
export function url(path: string, loc: Locale = locale()): string {
  const p = path.replace(/^\/+/, '');
  const prefix = loc === DEFAULT_LOCALE || isFile(p) ? '' : `${loc}/`;
  return `${siteBase()}/${prefix}${p}`;
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
  const page = stripLocale(pathname).slice(base.length);
  return LOCALES.map((l) => ({ locale: l, href: url(page, l) }));
}

/**
 * Where catalog page images and thumbnails are served from: the R2 bucket behind
 * this domain (they no longer ship with the site, which is capped at 100 MB).
 * PUBLIC_MEDIA_BASE overrides it; set it to "" to serve /media/ from the site.
 */
export const MEDIA_BASE = 'https://amgueddfa-media.kevinroberts.ar';

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
