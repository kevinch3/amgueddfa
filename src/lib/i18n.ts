// Interface text in seven languages. Spanish (es-AR) is the site's own language,
// served without a prefix, and the fallback for any missing key; the others live
// under /cy/, /en/, /zh/, /it/, /fr/ and /sv/ (see astro.config.mjs).
//
// One language is "current" at a time. At build time src/middleware.ts sets it
// before each page renders (pages render one after another: build.concurrency 1);
// in the browser it is the page's own <html lang>. That is why t() needs no locale
// argument, even from helpers that never see Astro.
import es from '../i18n/es-AR.json';

export const LOCALES = ['es', 'cy', 'en', 'zh', 'it', 'fr', 'sv'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

type Info = {
  /** BCP 47 tag: <html lang>, hreflang, and the messages file name. */
  tag: string;
  /** Open Graph locale. */
  og: string;
  /** The language's name in itself, for the language menu. */
  name: string;
  /** What to ask Intl for, best first (a browser without Welsh data falls back to English). */
  intl: string[];
};

/** Welsh is tagged cy-AR: the Welsh of the Wladfa, as spoken and written in Chubut. */
export const LOCALE_INFO: Record<Locale, Info> = {
  es: { tag: 'es-AR', og: 'es_AR', name: 'Español', intl: ['es-AR', 'es'] },
  cy: { tag: 'cy-AR', og: 'cy_GB', name: 'Cymraeg', intl: ['cy-AR', 'cy', 'en-GB'] },
  en: { tag: 'en-GB', og: 'en_GB', name: 'English', intl: ['en-GB', 'en'] },
  zh: { tag: 'zh-Hans', og: 'zh_CN', name: '简体中文', intl: ['zh-Hans', 'zh-CN', 'zh'] },
  it: { tag: 'it', og: 'it_IT', name: 'Italiano', intl: ['it-IT', 'it'] },
  fr: { tag: 'fr', og: 'fr_FR', name: 'Français', intl: ['fr-FR', 'fr'] },
  sv: { tag: 'sv', og: 'sv_SE', name: 'Svenska', intl: ['sv-SE', 'sv'] },
};

type Tree = { [k: string]: string | Tree };

const MESSAGES: Partial<Record<Locale, Tree>> = { es: es as Tree };
// Lazy: a browser downloads only its page's language (one small chunk each).
const FILES = import.meta.glob<{ default: Tree }>(['../i18n/*.json', '!../i18n/es-AR.json']);

async function load(l: Locale): Promise<void> {
  const file = FILES[`../i18n/${LOCALE_INFO[l].tag}.json`];
  if (file && !MESSAGES[l]) MESSAGES[l] = (await file()).default;
}

/**
 * Locale data from scripts/cldr_fallback.mjs, for a browser whose Intl lacks the
 * page's language (Chrome has no Welsh): month names, date patterns, relative times
 * and country names, as Node's ICU writes them.
 */
export type Cldr = {
  long: string;
  medium: string;
  months: string[];
  monthsShort: string[];
  relative: Record<string, string>;
  regions: Record<string, string>;
};
const CLDR_FILES = import.meta.glob<{ default: Cldr }>('../i18n/cldr/*.json');
const CLDR: Partial<Record<Locale, Cldr>> = {};

/** True when this runtime's Intl has data for the language itself (not just a fallback). */
function intlHas(l: Locale): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([LOCALE_INFO[l].tag.split('-')[0]]).length > 0;
  } catch {
    return false;
  }
}

let current: Locale = DEFAULT_LOCALE;

if (typeof document === 'undefined') {
  // Build and tests: pages of every language render in this one process.
  await Promise.all(LOCALES.map(load));
} else {
  current = localeFromTag(document.documentElement.lang);
  try {
    await load(current);
    const data = intlHas(current) ? undefined : CLDR_FILES[`../i18n/cldr/${current}.json`];
    if (data) CLDR[current] = (await data()).default;
  } catch {
    // Offline or a failed chunk: links stay in the page's language, text falls back to Spanish.
  }
}

/** Test hook: format a language with this locale data, as a browser without it would (null: native Intl). */
export function _setCldr(l: Locale, data: Cldr | null): void {
  if (data) CLDR[l] = data;
  else delete CLDR[l];
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Set the language t(), url() and the formatters use (the build middleware and tests). */
export function setLocale(l: Locale): void {
  current = l;
}

/** The current language. */
export function locale(): Locale {
  return current;
}

/** BCP 47 tag of a language (the current one by default): "cy-AR", "en-GB"… */
export function localeTag(l: Locale = current): string {
  return LOCALE_INFO[l].tag;
}

/** Locales to hand to Intl for a language, best first. */
export function intlLocales(l: Locale = current): string[] {
  return LOCALE_INFO[l].intl;
}

/**
 * The site language a BCP 47 tag asks for: an exact tag first ("cy-AR"), then
 * the primary language ("cy-GB" → cy, "en-US" → en). Spanish when none matches.
 */
export function localeFromTag(tag: string | null | undefined): Locale {
  const lower = (tag ?? '').trim().toLowerCase();
  const exact = LOCALES.find((l) => LOCALE_INFO[l].tag.toLowerCase() === lower);
  if (exact) return exact;
  const primary = lower.split('-')[0];
  return isLocale(primary) ? primary : DEFAULT_LOCALE;
}

function lookup(tree: Tree | undefined, key: string): string | undefined {
  let cur: unknown = tree;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * `lang` for archive and community text (document titles and text, transcriptions,
 * facts, memories, notes): it is written in Spanish (with Welsh), whatever the page's
 * language. Undefined on Spanish pages, where it already matches (WCAG 3.1.2).
 */
export function contentLang(): string | undefined {
  return current === DEFAULT_LOCALE ? undefined : 'es';
}

/** The text for `key` in the current language (Spanish if that language lacks it), with {vars} filled in. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = lookup(MESSAGES[current], key) ?? lookup(MESSAGES[DEFAULT_LOCALE], key);
  if (s === undefined) {
    if (import.meta.env?.DEV) throw new Error(`Missing i18n key: ${key}`);
    return key;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * A date as the current language writes it, in `timeZone` (the browser's by default):
 * "long" is "14 de noviembre de 2026", "medium" is "14 nov 2026, 13:32" (24 h).
 */
export function formatDate(d: Date, style: 'long' | 'medium', timeZone?: string): string {
  const c = CLDR[current];
  if (c) {
    // Numbers in the right timezone from locales every browser has, words from the data:
    // en-US writes an unpadded day (en-GB's is "01"), en-GB a 24-hour "09:05".
    const parts = (l: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l, { ...o, timeZone }).formatToParts(d).map((x) => [x.type, x.value]);
    const p: Record<string, string> = Object.fromEntries([
      ...parts('en-US', { day: 'numeric', month: 'numeric', year: 'numeric' }),
      ...parts('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    ]);
    const month = (style === 'long' ? c.months : c.monthsShort)[Number(p.month) - 1];
    return (style === 'long' ? c.long : c.medium).replace(/\{(day|month|year|hour|minute)\}/g, (_, k: string) => (k === 'month' ? month : p[k]));
  }
  return style === 'long'
    ? d.toLocaleDateString(intlLocales(), { day: 'numeric', month: 'long', year: 'numeric', timeZone })
    : d.toLocaleString(intlLocales(), { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone });
}

/** Words of the Wladfa where ICU has the southern ones: "rŵan", not "nawr". */
const DIALECT: Partial<Record<Locale, Record<string, string>>> = { cy: { 'second:0': 'rŵan' } };

/** "ayer", "hace 5 minutos", "ddoe"…: n units from now (negative: in the past). */
export function formatRelative(n: number, unit: 'second' | 'minute' | 'hour' | 'day'): string {
  const key = `${unit}:${n}`;
  const own = DIALECT[current]?.[key] ?? CLDR[current]?.relative[key];
  return own ?? new Intl.RelativeTimeFormat(intlLocales(), { numeric: 'auto' }).format(n, unit);
}

const regionNames = new Map<Locale, Intl.DisplayNames | null>();

/** A region's name in the current language ("AR" → "Argentina", "Yr Ariannin"…); undefined if unknown. */
export function regionName(code: string): string | undefined {
  const c = CLDR[current];
  if (c) return c.regions[code];
  if (!regionNames.has(current)) {
    try {
      regionNames.set(current, new Intl.DisplayNames(intlLocales(), { type: 'region' }));
    } catch {
      regionNames.set(current, null);
    }
  }
  return regionNames.get(current)?.of(code);
}

/** 12.345 / 12,345 / 12 345, as the current language writes numbers. */
export function formatNumber(n: number): string {
  return n.toLocaleString(intlLocales());
}

// Welsh "and": "a" before a consonant, which takes the aspirate mutation
// (c → ch, p → ph, t → th), and "ac" before a vowel. ICU writes "a(c)" instead.
function welshAnd(word: string): string {
  if (/^[aeiouwyâêîôûŵŷ]/i.test(word)) return `ac ${word}`;
  const m = /^(c|p|t)(?!h)/i.exec(word);
  if (!m) return `a ${word}`;
  const h = m[1] === m[1].toUpperCase() ? 'H' : 'h';
  return `a ${m[1]}${h}${word.slice(1)}`;
}

/** "a, b y c" in the current language ("a, b a chanlyniadau" in Welsh). */
export function formatList(items: string[]): string {
  if (current === 'cy') {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${welshAnd(items[items.length - 1])}`;
  }
  return new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).format(items);
}
