/** Prefix an internal path with the site base (e.g. / on amgueddfa.kevinroberts.ar). */
export function url(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}

/** Object path in the public `media` bucket of a released restricted item's file ("p01.webp"). */
export function releasedPath(id: string, file: string): string {
  return `released/${id}/${file.split('/').pop()}`;
}
