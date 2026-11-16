import { festivals, items, yearRange } from '../lib/catalog';
import { LOCALES } from '../lib/i18n';
import { url } from '../lib/paths';
import { absUrl, sitemapXml } from '../lib/seo';

/**
 * Every public page, in every language: home, game pages, legal pages, festivals,
 * years in range, public documents. (Each page names its other languages itself,
 * with hreflang.)
 */
export function GET(): Response {
  const pages = ['/', 'ranking/', 'tareas/'];
  for (const p of ['objetivos', 'accesibilidad', 'derechos', 'privacidad', 'cookies']) pages.push(`${p}/`);
  for (const f of festivals()) {
    pages.push(`${f.slug}/`, `general/${f.slug}/`);
    const [first, last] = yearRange(f.slug);
    for (let y = first; y <= last; y++) pages.push(`${f.slug}/${y}/`);
  }
  for (const i of items()) if (!i.restricted) pages.push(`item/${i.id}/`);
  const urls = LOCALES.flatMap((l) => pages.map((p) => absUrl(url(p, l))));
  return new Response(sitemapXml(urls), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
