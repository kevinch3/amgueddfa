// Source pages (/fuente/<slug>/, #185): one page per place the archive took
// something from — a Facebook post, a Wayback capture, a newspaper, a book, a
// person who contributed. Each page shows how the source looked when we kept it
// (the images and text we captured, as with programas and images), its metadata,
// and who contributed: the only place contributor names are shown (#184).
// Pure functions (no Astro, no DOM) so the build and tests-js share them.
import { splitFuente, type Contribution } from './contrib';
import { t } from './i18n';
import { url } from './paths';
import type { Item } from './types';

export type SourceKind =
  | 'facebook' | 'instagram' | 'wayback' | 'drive' | 'papurau' | 'casgliad' | 'commons'
  | 'web' | 'personal' | 'publicacion' | 'comunidad';

/** Contribution types shown on edition and item pages, whose source is their fuente or their contributor. */
export const SHOWN_TYPES = new Set(['fact', 'memory', 'note', 'transcription', 'upload']);

export type Source = {
  slug: string;
  key: string;
  kind: SourceKind;
  /** What the source is called: the catalog label, the cited text, or the contributor's name. */
  label: string;
  url: string | null;
  items: Item[];
  contributions: Contribution[];
  /** Public names of the people who contributed through this source, in first-seen order. */
  contributors: string[];
  retrieved: string[];
  rights: string[];
};

/** cyrb53: a small 53-bit string hash, the same in the build and in the browser. */
function cyrb53(s: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The page slug of a source key: 14 hex characters (item ids have 12, so the two never look alike). */
export function sourceSlug(key: string): string {
  return cyrb53(key).toString(16).padStart(14, '0');
}

/** Key of a catalog document's source: its URL, or its label when it has none. */
export function itemSourceKey(i: Pick<Item, 'source_url' | 'source_label'>): string {
  return i.source_url ? i.source_url.trim() : `label:${i.source_label.trim()}`;
}

/**
 * Key of a contribution's source: what it cites (its trailing URL, else the cited
 * text), or, when it cites nothing, the person who contributed it. Null for an
 * anonymous contribution that cites nothing.
 */
export function contributionSourceKey(c: Pick<Contribution, 'payload' | 'display_name'>): string | null {
  const f = String(c.payload?.fuente ?? '').trim();
  if (f) {
    const { label, href } = splitFuente(f);
    return href ? href : `label:${label}`;
  }
  const name = (c.display_name ?? '').trim();
  return name ? `persona:${name}` : null;
}

export function sourceKind(key: string): SourceKind {
  if (key.startsWith('persona:')) return 'comunidad';
  if (key.startsWith('label:')) return /^label:archivo personal/i.test(key) ? 'personal' : 'publicacion';
  let host = '';
  try {
    host = new URL(key).hostname.replace(/^www\./, '');
  } catch {
    return 'publicacion';
  }
  if (host.endsWith('facebook.com')) return 'facebook';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host === 'web.archive.org') return 'wayback';
  if (host === 'drive.google.com') return 'drive';
  if (host.endsWith('library.wales')) return 'papurau';
  if (host.endsWith('casgliadywerin.cymru')) return 'casgliad';
  if (host === 'commons.wikimedia.org') return 'commons';
  return 'web';
}

/** Where to look for archived copies of a live web source (none for archives and offline sources). */
export function waybackLookup(s: Pick<Source, 'url' | 'kind'>): string | null {
  return s.url && s.kind !== 'wayback' ? `https://web.archive.org/web/*/${s.url}` : null;
}

function push<T>(list: T[], v: T): void {
  if (!list.includes(v)) list.push(v);
}

/**
 * Every source, keyed by slug. Documents group by their source URL (or label);
 * contributions shown on the site group by what they cite, or by who contributed
 * them. A contribution citing a document's URL joins that document's page.
 */
export function buildSources(items: Item[], contributions: Contribution[]): Map<string, Source> {
  const out = new Map<string, Source>();
  const get = (key: string, label: string, url: string | null): Source => {
    const slug = sourceSlug(key);
    let s = out.get(slug);
    if (!s) {
      s = { slug, key, kind: sourceKind(key), label, url, items: [], contributions: [], contributors: [], retrieved: [], rights: [] };
      out.set(slug, s);
    }
    return s;
  };
  for (const i of items) {
    const s = get(itemSourceKey(i), i.source_label, i.source_url);
    s.items.push(i);
    if (i.retrieved) push(s.retrieved, i.retrieved);
    if (i.rights) push(s.rights, i.rights);
  }
  for (const c of contributions) {
    if (!SHOWN_TYPES.has(c.type)) continue;
    const key = contributionSourceKey(c);
    if (!key) continue;
    const f = String(c.payload?.fuente ?? '').trim();
    const name = (c.display_name ?? '').trim();
    const { label, href } = f ? splitFuente(f) : { label: name, href: undefined };
    const s = get(key, label, href ?? null);
    s.contributions.push(c);
    if (name) push(s.contributors, name);
  }
  for (const s of out.values()) s.retrieved.sort();
  return out;
}

/** Slug of the source page a contribution links to, when the build made one (`known`), else null. */
export function contributionSourceSlug(c: Pick<Contribution, 'payload' | 'display_name'>, known: ReadonlySet<string>): string | null {
  const key = contributionSourceKey(c);
  if (!key) return null;
  const slug = sourceSlug(key);
  return known.has(slug) ? slug : null;
}

/** How a block names where a contribution comes from: a label and, when there is one, a link. */
/** `original`: the URL the fuente cites, if any (the compact fact link opens it). */
export type SourceRef = { label: string; href: string | null; own: boolean; original?: string | null };

/**
 * The "Fuente: …" of a contribution shown on an edition or item page. What it cites
 * links to its source page when the build made one (else to the cited URL); a
 * contribution that cites nothing names the community and links to the page of the
 * person who contributed it. Names themselves only show on source pages (#184).
 * `own` is true when the label is the contributor's own text (keep its language).
 */
export function sourceRef(c: Pick<Contribution, 'payload' | 'display_name'>, known: ReadonlySet<string>): SourceRef | null {
  const slug = contributionSourceSlug(c, known);
  const page = slug ? url(`fuente/${slug}/`) : null;
  const f = String(c.payload?.fuente ?? '').trim();
  if (f) {
    const { label, href } = splitFuente(f);
    return { label, href: page ?? href ?? null, own: true, original: href ?? null };
  }
  return page ? { label: t('fuentes.comunidad'), href: page, own: false } : null;
}

/** Browser side: the source pages the build made for contributions (#fuentes-data), read once. */
let knownCache: Set<string> | null = null;
export function knownSources(doc: Pick<Document, 'getElementById'> = document): Set<string> {
  if (knownCache) return knownCache;
  try {
    const v = JSON.parse(doc.getElementById('fuentes-data')?.textContent ?? '[]');
    knownCache = new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    knownCache = new Set();
  }
  return knownCache;
}
