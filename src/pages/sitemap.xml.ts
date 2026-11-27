import { isPublic } from '../lib/visibilidad';
import approvedRaw from '../../data/approved/contributions.json';
import { editionItems, festivals, items, yearRange } from '../lib/catalog';
import { forEdition, type Contribution } from '../lib/contrib';
import { siteSources } from '../lib/fuentes-site';
import { LOCALES } from '../lib/i18n';
import { isDeepPage, rootUrl, url } from '../lib/paths';
import { absUrl, sitemapXml } from '../lib/seo';

/**
 * Every public page, in every language (deep pages once, at their single address): home, game pages, legal pages, festivals,
 * years in range that have something (a public document, an approved upload or
 * fact; empty years keep their page but would be thin results), public documents,
 * source pages.
 * (Each page names its other languages itself, with hreflang.)
 */
export function GET(): Response {
  const approved = approvedRaw as Contribution[];
  const hasSomething = (f: string, y: number) =>
    editionItems(f, y).some((i) => isPublic(i)) || forEdition(approved, f, y, 'upload').length > 0 || forEdition(approved, f, y, 'fact').length > 0;
  const pages = ['/', 'buscar/', 'ranking/', 'tareas/'];
  for (const p of ['objetivos', 'accesibilidad', 'derechos', 'privacidad', 'cookies', 'creditos']) pages.push(`${p}/`);
  for (const f of festivals()) {
    pages.push(`${f.slug}/`, `general/${f.slug}/`);
    const [first, last] = yearRange(f.slug);
    for (let y = first; y <= last; y++) if (hasSomething(f.slug, y)) pages.push(`${f.slug}/${y}/`);
  }
  for (const i of items()) if (isPublic(i)) pages.push(`item/${i.id}/`);
  for (const slug of siteSources().keys()) pages.push(`fuente/${slug}/`);
  // The museum's front door (/) and every page of the Eisteddfod collection (/eisteddfod/…, #189).
  // A deep page (one document, one source) has one address for every language (docs/reglas.md, rule 4).
  const deep = (p: string) => isDeepPage(url(p, 'es'));
  const urls = [
    ...LOCALES.flatMap((l) => [absUrl(rootUrl(l)), ...pages.filter((p) => !deep(p)).map((p) => absUrl(url(p, l)))]),
    ...pages.filter(deep).map((p) => absUrl(url(p, 'es'))),
  ];
  return new Response(sitemapXml(urls), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
