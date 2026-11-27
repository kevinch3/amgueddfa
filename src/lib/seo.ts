/**
 * What search engines and bots read: absolute URLs, page descriptions,
 * schema.org JSON-LD and the sitemap. Pure functions, used at build time.
 */
import { factDisplay, forEdition, longDate, type Contribution } from './contrib';
import { localeTag, t } from './i18n';
import { rootUrl, url } from './paths';
import { docCount } from './site';
import type { EditionState } from './types';

/** The site's origin, from `site` in astro.config.mjs (the fallback is for unit tests). */
export const SITE = String(import.meta.env.SITE ?? 'https://amgueddfa.org').replace(/\/+$/, '');

/**
 * Who holds the rights of a scanned document, for open data. Items with no
 * credit line of their own stay with their original holders (the association
 * or whoever printed them, see LICENSE-DATA.md and /derechos/): said out loud,
 * never left empty.
 */
export function rightsText(rights: string | null | undefined): string {
  const r = (rights ?? '').trim();
  return r || `Titulares originales (la asociación organizadora u otros); no incluido en la licencia CC BY-SA 4.0 del sitio. Ver ${SITE}/derechos/`;
}

/** Licence of the site's transcriptions and community data (LICENSE-DATA.md). */
export const TRANSCRIPTION_LICENSE = 'CC BY-SA 4.0';

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

/**
 * What approved facts say about one edition. Per field, the most recently
 * approved fact wins (not file order: the export is sorted by random id).
 * `held` is true/false only when known: the editions table (what
 * approve_contribution keeps up to date) first, else the latest
 * "¿Se realizó?" fact; otherwise null.
 */
export type EditionFacts = { startDate?: string; endDate?: string; venue?: string; silla?: string; corona?: string; notHeld: boolean; held?: boolean | null };

export function editionFacts(
  approved: Contribution[],
  festival: string,
  year: number,
  status: 'held' | 'not_held' | 'unknown' | null = null,
): EditionFacts {
  const out: EditionFacts = { notHeld: false, held: null };
  const when = (c: Contribution) => String(c.reviewed_at ?? c.created_at ?? '');
  const facts = [...forEdition(approved, festival, year, 'fact')].sort((a, b) => when(a).localeCompare(when(b)));
  for (const c of facts) {
    const p = c.payload ?? {};
    const v = String(p.value ?? '').trim();
    if (p.field === 'start_date' && v) out.startDate = v;
    else if (p.field === 'end_date' && v) out.endDate = v;
    else if (p.field === 'venue' && v) out.venue = v;
    else if (p.field === 'ganador_silla' && v) out.silla = v;
    else if (p.field === 'ganador_corona' && v) out.corona = v;
    else if (p.field === 'edicion_realizada' && (v === 'si' || v === 'no')) out.held = v === 'si';
  }
  if (status === 'held') out.held = true;
  else if (status === 'not_held') out.held = false;
  out.notHeld = out.held === false;
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

/**
 * Whether the archive has evidence about this edition taking place: held or
 * not held is known, or an approved start date (a reviewed fact with its
 * fuente). Only then is it described as a schema.org Event; an edition with
 * no such record (e.g. only a venue, or nothing) is not asserted as an event.
 */
export function isConfirmedEdition(f: EditionFacts): boolean {
  return f.held === true || f.held === false || Boolean(f.startDate);
}

/**
 * Whether an edition's page is a schema.org Event: it is confirmed, and both its date and its
 * place are approved. Google treats an Event without `startDate` or `location` as broken
 * (Search Console, critical), so the others are described as the archive's page for that year (#16).
 */
export function isEventEdition(f: EditionFacts): boolean {
  return isConfirmedEdition(f) && Boolean(f.startDate) && Boolean(f.venue);
}

/**
 * schema.org for an edition's page; only the fields we actually know.
 * An Event (cancelled when not held) when the date and place are approved; otherwise a
 * CollectionPage: the archive's material for that year, nothing more.
 */
export function editionJsonLd(o: { name: string; year: number; url: string; image: string | null; facts: EditionFacts; description?: string }): Ld {
  if (!isEventEdition(o.facts)) {
    const page: Ld = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${o.name} ${o.year}`,
      url: o.url,
      isAccessibleForFree: true,
      temporalCoverage: String(o.year),
    };
    if (o.description) page.description = o.description;
    if (o.image) page.image = o.image;
    return page;
  }
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${o.url}#evento`,
    name: `${o.name} ${o.year}`,
    url: o.url,
    isAccessibleForFree: true,
    inLanguage: ['cy', 'es'],
    startDate: o.facts.startDate,
    // Every eisteddfod in the archive is in the province of Chubut, Argentina.
    location: { '@type': 'Place', name: o.facts.venue, address: { '@type': 'PostalAddress', addressRegion: 'Chubut', addressCountry: 'AR' } },
    eventStatus: o.facts.notHeld ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
  };
  if (o.description) ld.description = o.description;
  if (o.facts.endDate) ld.endDate = o.facts.endDate;
  if (o.image) ld.image = o.image;
  return ld;
}

/**
 * schema.org ArchiveComponent for a document. It is `about` its edition's
 * Event only when that edition is confirmed; otherwise it is part of the
 * edition's page.
 */
export function itemJsonLd(o: { name: string; url: string; image: string | null; editionUrl: string | null; editionName: string | null; year: number | null; editionEvent?: boolean; rights?: string }): Ld {
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
  // Only a credit line the archive actually has; never a guessed author or licence.
  if (o.rights?.trim()) ld.copyrightNotice = o.rights.trim();
  if (o.editionUrl && o.editionName) {
    // A reference to the year page's full Event (by @id), not a second, incomplete Event node.
    if (o.editionEvent) ld.about = { '@id': `${o.editionUrl}#evento` };
    else ld.isPartOf = { '@type': 'CollectionPage', name: o.editionName, url: o.editionUrl };
  }
  return ld;
}

/** schema.org BreadcrumbList matching the visible crumbs; the last (current page) has no link. */
export function breadcrumbJsonLd(crumbs: { name: string; url?: string }[]): Ld & { itemListElement: Ld[] } {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => {
      const el: Ld = { '@type': 'ListItem', position: i + 1, name: c.name };
      if (c.url) el.item = c.url;
      return el;
    }),
  };
}

/** Several JSON-LD blocks as one @graph under a single @context. */
export function ldGraph(...blocks: (Ld | null)[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@graph': blocks.filter((b): b is Ld => b !== null).map(({ '@context': _c, ...rest }) => rest),
  };
}

/** The site itself: a website run by a (digital) archive. */
export function siteJsonLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: t('sitio.nombre'), url: absUrl(rootUrl()), inLanguage: localeTag(), description: t('sitio.descripcion') },
      { '@type': 'ArchiveOrganization', name: t('sitio.nombre'), url: absUrl('/'), description: t('sitio.descripcion') },
    ],
  };
}

/** One approved fact as open data: field id, its label, readable value, fuente, contributor. */
export function factRecord(c: Contribution): Record<string, string> {
  const { label, value } = factDisplay(c);
  const field = String(c.payload?.field ?? 'other');
  const out: Record<string, string> = { campo: field, etiqueta: label, valor: value };
  // Dates also as ISO 8601, for machines.
  if ((field === 'start_date' || field === 'end_date') && /^\d{4}-\d{2}-\d{2}$/.test(String(c.payload?.value ?? ''))) out.fecha = String(c.payload?.value);
  const fuente = String(c.payload?.fuente ?? '').trim();
  if (fuente) out.fuente = fuente;
  if (c.display_name) out.aporto = c.display_name;
  return out;
}

