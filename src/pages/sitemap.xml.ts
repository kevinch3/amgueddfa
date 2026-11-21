import approvedRaw from '../../data/approved/contributions.json';
import { editionItems, festivals, items, yearRange } from '../lib/catalog';
import { forEdition, type Contribution } from '../lib/contrib';
import { LOCALES } from '../lib/i18n';
import { url } from '../lib/paths';
import { absUrl, sitemapXml } from '../lib/seo';

/**
 * Every public page, in every language: home, game pages, legal pages, festivals,
 * years in range that have something (a public document, an approved upload or
 * fact; empty years keep their page but would be thin results), public documents.
 * (Each page names its other languages itself, with hreflang.)
 */
export function GET(): Response {
  const approved = approvedRaw as Contribution[];
  const hasSomething = (f: string, y: number) =>
    editionItems(f, y).some((i) => !i.restricted) || forEdition(approved, f, y, 'upload').length > 0 || forEdition(approved, f, y, 'fact').length > 0;
  const pages = ['/', 'buscar/', 'ranking/', 'tareas/'];
  for (const p of ['objetivos', 'accesibilidad', 'derechos', 'privacidad', 'cookies', 'creditos']) pages.push(`${p}/`);
  for (const f of festivals()) {
    pages.push(`${f.slug}/`, `general/${f.slug}/`);
    const [first, last] = yearRange(f.slug);
    for (let y = first; y <= last; y++) if (hasSomething(f.slug, y)) pages.push(`${f.slug}/${y}/`);
  }
  for (const i of items()) if (!i.restricted) pages.push(`item/${i.id}/`);
  const urls = LOCALES.flatMap((l) => pages.map((p) => absUrl(url(p, l))));
  return new Response(sitemapXml(urls), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
