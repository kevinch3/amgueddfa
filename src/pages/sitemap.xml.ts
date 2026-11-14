import { festivals, items, yearRange } from '../lib/catalog';
import { absUrl, sitemapXml } from '../lib/seo';

/** Every public page: home, game pages, legal pages, festivals, years in range, public documents. */
export function GET(): Response {
  const urls = [absUrl('/'), absUrl('ranking/'), absUrl('tareas/')];
  for (const p of ['objetivos', 'derechos', 'privacidad', 'cookies']) urls.push(absUrl(`${p}/`));
  for (const f of festivals()) {
    urls.push(absUrl(`${f.slug}/`), absUrl(`general/${f.slug}/`));
    const [first, last] = yearRange(f.slug);
    for (let y = first; y <= last; y++) urls.push(absUrl(`${f.slug}/${y}/`));
  }
  for (const i of items()) if (!i.restricted) urls.push(absUrl(`item/${i.id}/`));
  return new Response(sitemapXml(urls), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
