/** Prefix an internal path with the site base (e.g. / on amgueddfa.kevinroberts.ar). */
export function url(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
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
