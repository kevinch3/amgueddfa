/**
 * Deep pages built once (docs/reglas.md, rule 4; design 2026-11-27, section 6).
 *
 * One document (/eisteddfod/item/<id>/) or one source (/fuente/<slug>/) is built
 * only at its Spanish address. A visitor in another language gets the same page
 * with its labels swapped in the browser (src/scripts/pagina-unica.ts) from a
 * dictionary the build writes after rendering every language once
 * (scripts/paginas_unicas.mjs), which also checks that the swap reproduces each
 * translated page before deleting it.
 *
 * Pure rules shared by the build script and the browser: no imports, so Node runs
 * this file as is.
 */

/** Site paths (no base, no language) of deep pages. */
export const DEEP_PREFIXES = ['eisteddfod/item/', 'fuente/'] as const;

/** Query parameter carrying the visitor's language to a deep page (?l=cy). */
export const LANG_PARAM = 'l';

/** localStorage key: the language of the last page the visitor read (listed on /cookies/). */
export const IDIOMA_KEY = 'amg:idioma';

/** Where the build writes each language's dictionary, under the site base. */
export const DICT_DIR = 'i18n-paginas';

/** Attributes whose text is a label to translate. */
export const LABEL_ATTRS = ['aria-label', 'title', 'alt', 'placeholder'] as const;

/** Whether a site path ("eisteddfod/item/x/", "/fuente/y/#a") is a deep page (files are not). */
export function isDeep(path: string): boolean {
  const p = path.replace(/^\/+/, '').split(/[?#]/)[0];
  if (/\.[a-z0-9]+$/i.test(p)) return false;
  return DEEP_PREFIXES.some((d) => p.startsWith(d) && p.length > d.length);
}

/** The deep page's address for a language: the Spanish path plus ?l=xx (Spanish needs none). */
export function withLang(href: string, lang: string, defaultLang = 'es'): string {
  const [beforeHash, ...hash] = href.split('#');
  const [path, query = ''] = beforeHash.split('?');
  const params = new URLSearchParams(query);
  params.delete(LANG_PARAM);
  if (lang !== defaultLang) params.set(LANG_PARAM, lang);
  const q = params.toString();
  return `${path}${q ? `?${q}` : ''}${hash.length ? `#${hash.join('#')}` : ''}`;
}

/**
 * Where an internal link of a deep page goes for a visitor in `lang`: a deep page
 * keeps its address and carries the language; any other page gets the language
 * prefix (/cy/…); files, outside links and same-page anchors stay as they are.
 */
export function localizeHref(href: string, lang: string, base = '', languages: readonly string[] = [], defaultLang = 'es'): string {
  if (lang === defaultLang || !href.startsWith('/') || href.startsWith('//')) return href;
  const b = base.replace(/\/+$/, '');
  if (b && !href.startsWith(`${b}/`)) return href;
  const rest = href.slice(b.length + 1);
  const first = rest.split(/[/?#]/)[0];
  if (languages.includes(first)) return href; // already in a language
  if (/\.[a-z0-9]+$/i.test(rest.split(/[?#]/)[0])) return href;
  if (isDeep(rest)) return withLang(href, lang, defaultLang);
  return `${b}/${lang}/${rest}`;
}

/**
 * One language's labels: Spanish text → its translation. A text translated in more
 * than one way on the same page ("Normal" → "Normal" / "Normale") maps to the list of
 * its translations in page order, counted separately for text, label attributes and
 * the title (the build checks that every page agrees on that order).
 */
export type Dict = Record<string, string | string[]>;
/** Which occurrence of each label this is, per channel: text nodes, label attributes, the title. */
export type Seen = Map<string, number>;

/** A label's translation, keeping the node's own leading and trailing space; null when the dictionary lacks it. */
export function translateText(text: string, dict: Dict, seen?: Seen): string | null {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  if (!m[2]) return null;
  // A translation that changes the label's own spacing ("Fuente: " → "来源：") is stored whole.
  const exact = dict[text];
  if (exact !== undefined) {
    if (!Array.isArray(exact)) return exact;
    const n = seen?.get(text) ?? 0;
    seen?.set(text, n + 1);
    return exact[Math.min(n, exact.length - 1)];
  }
  const v = dict[m[2]];
  if (v === undefined) return null;
  let tr = v as string;
  if (Array.isArray(v)) {
    const n = seen?.get(m[2]) ?? 0;
    seen?.set(m[2], n + 1);
    tr = v[Math.min(n, v.length - 1)];
  }
  return `${m[1]}${tr}${m[3]}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML text as the browser reads it (the entities Astro writes). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}
