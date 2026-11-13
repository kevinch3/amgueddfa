/** Prefix an internal path with the site base (e.g. /amgueddfa-eisteddfod/). */
export function url(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
