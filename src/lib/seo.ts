/**
 * What search engines and bots read: absolute URLs, page descriptions,
 * schema.org JSON-LD and the sitemap. Pure functions, used at build time.
 */
import { forEdition, longDate, type Contribution } from './contrib';
import { t } from './i18n';
import { docCount } from './site';
import type { EditionState } from './types';

export const SITE = 'https://amgueddfa.kevinroberts.ar';

/** Site-absolute URL for a path on this site; absolute URLs pass through. */
export function absUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE}/${path.replace(/^\/+/, '')}`;
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function sitemapXml(urls: string[]): string {
  const body = urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** What approved facts say about one edition (the latest value wins per field). */
export type EditionFacts = { startDate?: string; endDate?: string; venue?: string; silla?: string; corona?: string; notHeld: boolean };

export function editionFacts(approved: Contribution[], festival: string, year: number): EditionFacts {
  const out: EditionFacts = { notHeld: false };
  for (const c of forEdition(approved, festival, year, 'fact')) {
    const p = c.payload ?? {};
    const v = String(p.value ?? '').trim();
    if (p.field === 'start_date' && v) out.startDate = v;
    else if (p.field === 'end_date' && v) out.endDate = v;
    else if (p.field === 'venue' && v) out.venue = v;
    else if (p.field === 'ganador_silla' && v) out.silla = v;
    else if (p.field === 'ganador_corona' && v) out.corona = v;
    else if (p.field === 'edicion_realizada') out.notHeld = v === 'no';
  }
  return out;
}

/** One-paragraph summary of an edition for <meta name="description">. */
export function editionDescription(name: string, year: number, state: EditionState, f: EditionFacts, docs: number): string {
  const parts = [`${name} ${year}.`];
  if (f.notHeld) parts.push(t('seo.no_realizada'));
  if (f.startDate) parts.push(t('seo.fecha', { fecha: longDate(f.startDate) }));
  if (f.venue) parts.push(t('seo.lugar', { lugar: f.venue }));
  if (f.silla) parts.push(t('seo.silla', { nombre: f.silla }));
  if (f.corona) parts.push(t('seo.corona', { nombre: f.corona }));
  parts.push(docs > 0 ? t('seo.documentos', { docs: docCount(docs), estado: t(`estados.${state}`).toLowerCase() }) : t('seo.sin_documentos'));
  return parts.join(' ');
}

type Ld = Record<string, unknown>;

/** schema.org Event for an edition; only the fields we actually know. */
export function editionJsonLd(o: { name: string; year: number; url: string; image: string | null; facts: EditionFacts }): Ld {
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${o.name} ${o.year}`,
    url: o.url,
    isAccessibleForFree: true,
    inLanguage: ['cy', 'es'],
  };
  if (o.facts.startDate) ld.startDate = o.facts.startDate;
  if (o.facts.endDate) ld.endDate = o.facts.endDate;
  if (o.facts.venue) ld.location = { '@type': 'Place', name: o.facts.venue };
  if (o.image) ld.image = o.image;
  if (o.facts.notHeld) ld.eventStatus = 'https://schema.org/EventCancelled';
  return ld;
}

/** schema.org ArchiveComponent for a document, about its edition. */
export function itemJsonLd(o: { name: string; url: string; image: string | null; editionUrl: string | null; editionName: string | null; year: number | null }): Ld {
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'ArchiveComponent',
    name: o.name,
    url: o.url,
    holdingArchive: { '@type': 'ArchiveOrganization', name: t('sitio.nombre'), url: absUrl('/') },
    isAccessibleForFree: true,
  };
  if (o.image) ld.image = o.image;
  if (o.year !== null) ld.temporalCoverage = String(o.year);
  if (o.editionUrl && o.editionName) ld.about = { '@type': 'Event', name: o.editionName, url: o.editionUrl };
  return ld;
}

/** The site itself: a website run by a (digital) archive. */
export function siteJsonLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: t('sitio.nombre'), url: absUrl('/'), inLanguage: 'es-AR', description: t('sitio.descripcion') },
      { '@type': 'ArchiveOrganization', name: t('sitio.nombre'), url: absUrl('/'), description: t('sitio.descripcion') },
    ],
  };
}
