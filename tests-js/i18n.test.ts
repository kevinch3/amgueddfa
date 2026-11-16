import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, _setCldr, formatDate, formatList, formatNumber, formatRelative, localeFromTag, regionName, setLocale, t, type Cldr, type Locale } from '../src/lib/i18n';
import { build as buildCldr, relativeKeys } from '../scripts/cldr_fallback.mjs';
import cyCldr from '../src/i18n/cldr/cy.json';
import { relativa } from '../src/lib/dates';
import { alternates, localeFromPath, stripLocale, url } from '../src/lib/paths';
import { countryName } from '../src/lib/places';
import { fecha } from '../src/lib/dates';
import { longDate } from '../src/lib/contrib';
import messages from '../src/i18n/es-AR.json';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(astro|ts)$/.test(n) ? [p] : [];
  });
}

function lookup(key: string): unknown {
  return key.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), messages);
}

type Tree = { [k: string]: string | Tree };
/** Every key path → string, flattened ("nav.inicio" → "Inicio"). */
function flat(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flat(v, key)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const file = (l: Locale) => join(__dirname, '..', 'src', 'i18n', `${LOCALE_INFO[l].tag}.json`);
const spanish = flat(messages as Tree);

afterEach(() => setLocale(DEFAULT_LOCALE));

describe('i18n', () => {
  it("every t('…') key used under src exists in es-AR.json", () => {
    const re = /\bt\(['"]([\w.]+)['"]/g;
    const missing: string[] = [];
    for (const f of walk('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) {
        if (typeof lookup(m[1]) !== 'string') missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('vars interpolate {n}', () => {
    expect(t('comun.n_documentos', { n: 3 })).toBe('3 documentos');
  });

  it('missing key throws', () => {
    expect(() => t('no.such.key')).toThrow();
  });
});

describe('translations', () => {
  for (const l of LOCALES.filter((x) => x !== DEFAULT_LOCALE)) {
    describe(LOCALE_INFO[l].tag, () => {
      const path = file(l);
      it('has a messages file', () => expect(existsSync(path)).toBe(true));
      if (!existsSync(path)) return;
      const own = flat(JSON.parse(readFileSync(path, 'utf8')) as Tree);

      it('has exactly the Spanish keys', () => {
        expect([...spanish.keys()].filter((k) => !own.has(k)), 'missing').toEqual([]);
        expect([...own.keys()].filter((k) => !spanish.has(k)), 'extra').toEqual([]);
      });

      it('keeps every {placeholder} of each Spanish string, and no empty strings', () => {
        const bad = [...spanish].filter(([k, es]) => own.has(k) && placeholders(own.get(k)!).join() !== placeholders(es).join()).map(([k]) => k);
        expect(bad).toEqual([]);
        expect([...own].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
      });

      it('translates the interface (not a copy of the Spanish file)', () => {
        // Proper names stay as they are (the site's name, the Welsh festival names, Mimosa
        // Porth Madryn, the word Eisteddfod itself), and so do templates that are only
        // {placeholders}; words and short labels can be shared ("documento", "PDF", "No").
        const NAMES = /^(sitio\.nombre|festivales_cy\.|festivales\.mimosa$)/;
        const words = (s: string) => s.replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        const same = [...spanish].filter(([k, es]) => own.get(k) === es && !NAMES.test(k) && !/^https?:/.test(es)).map(([k, es]) => ({ k, n: words(es).length }));
        expect(same.filter((x) => x.n > 30).map((x) => x.k), 'untranslated sentences').toEqual([]);
      });

      it('names seven weekdays for the admin chart', () => {
        expect(own.get('admin.stats.dias_semana')!.split(',').map((d) => d.trim()).filter(Boolean)).toHaveLength(7);
      });

      it('keeps the legal links absolute and the shortcut letters usable', () => {
        for (const k of ['legal.enlaces.cc', 'legal.enlaces.dmca']) expect(own.get(k)).toMatch(/^https:\/\//);
        const si = own.get('tareas.tecla_si')!;
        const no = own.get('tareas.tecla_no')!;
        expect(si).toMatch(/^[a-z]$/);
        expect(no).toMatch(/^[a-z]$/);
        expect(si).not.toBe(no);
        // The button labels show the same letters the keyboard listens for.
        expect(own.get('tareas.si')!.toLowerCase()).toContain(`(${si})`);
        expect(own.get('tareas.no')!.toLowerCase()).toContain(`(${no})`);
      });

      it('never writes the contact address as text', () => {
        expect([...own.values()].filter((v) => /info@|info\s*(\(at\)|\[at\])/i.test(v))).toEqual([]);
      });
    });
  }

  it('t() follows the current language and keeps {vars}', () => {
    setLocale('en');
    expect(t('nav.inicio')).not.toBe('Inicio');
    expect(t('comun.n_documentos', { n: 3 })).toContain('3');
    setLocale('es');
    expect(t('nav.inicio')).toBe('Inicio');
  });
});

describe('language helpers', () => {
  it('maps tags to site languages, Spanish when unknown', () => {
    expect(localeFromTag('cy-AR')).toBe('cy');
    expect(localeFromTag('cy-GB')).toBe('cy');
    expect(localeFromTag('en-US')).toBe('en');
    expect(localeFromTag('zh-Hans')).toBe('zh');
    expect(localeFromTag('SV')).toBe('sv');
    expect(localeFromTag('de-DE')).toBe('es');
    expect(localeFromTag('')).toBe('es');
  });

  it('url() prefixes pages with the language, never files', () => {
    expect(url('/')).toBe('/');
    expect(url('item/abc/')).toBe('/item/abc/');
    expect(url('item/abc/', 'cy')).toBe('/cy/item/abc/');
    expect(url('/', 'fr')).toBe('/fr/');
    expect(url('contribuir?f=chubut&y=1937', 'sv')).toBe('/sv/contribuir?f=chubut&y=1937');
    expect(url('/#buscados', 'zh')).toBe('/zh/#buscados');
    for (const f of ['favicon.svg', 'contacto.png', 'datos/indice.json', 'media/abc/p01.webp']) expect(url(f, 'it')).toBe(`/${f}`);
    setLocale('en');
    expect(url('ranking')).toBe('/en/ranking');
  });

  it('reads and strips the language prefix of a path', () => {
    expect(localeFromPath('/cy/chubut/1937/')).toBe('cy');
    expect(localeFromPath('/chubut/1937/')).toBe('es');
    expect(localeFromPath('/es/chubut/')).toBe('es');
    expect(localeFromPath('/cymraeg/')).toBe('es');
    expect(stripLocale('/cy/chubut/1937/')).toBe('/chubut/1937/');
    expect(stripLocale('/fr/')).toBe('/');
    expect(stripLocale('/zh')).toBe('/');
    expect(stripLocale('/item/x/')).toBe('/item/x/');
  });

  it('alternates() lists the same page in every language', () => {
    const alts = alternates('/sv/item/x/');
    expect(alts.map((a) => a.locale)).toEqual([...LOCALES]);
    expect(alts.find((a) => a.locale === 'es')!.href).toBe('/item/x/');
    expect(alts.find((a) => a.locale === 'cy')!.href).toBe('/cy/item/x/');
  });

  it('joins lists the Welsh way: "ac" before a vowel, aspirate mutation after "a"', () => {
    setLocale('cy');
    expect(formatList(['rhaglen', 'canlyniadau'])).toBe('rhaglen a chanlyniadau');
    expect(formatList(['rhaglen', 'rhagbrofion', 'testunau'])).toBe('rhaglen, rhagbrofion a thestunau');
    expect(formatList(['rhaglen', 'papurau eraill'])).toBe('rhaglen a phapurau eraill');
    expect(formatList(['rhaglen', 'amodau'])).toBe('rhaglen ac amodau');
    expect(formatList(['rhaglen', 'beirniadaethau'])).toBe('rhaglen a beirniadaethau');
    expect(formatList(['rhaglen'])).toBe('rhaglen');
    setLocale('es');
    expect(formatList(['programa', 'bases', 'resultados'])).toBe('programa, bases y resultados');
    setLocale('en');
    expect(formatList(['programme', 'results'])).toBe('programme and results');
  });

  it('dates, numbers and country names follow the current language', () => {
    expect(longDate('1937-12-08')).toBe('8 de diciembre de 1937');
    setLocale('cy');
    expect(longDate('1937-12-08')).toBe('8 Rhagfyr 1937');
    expect(countryName('AR')).toBe('Yr Ariannin');
    setLocale('en');
    expect(longDate('1937-12-08')).toBe('8 December 1937');
    expect(fecha('2026-11-14T13:00:00Z', 'UTC')).toBe('14 November 2026');
    expect(formatNumber(12345)).toBe('12,345');
    setLocale('zh');
    expect(longDate('1937-12-08')).toBe('1937年12月8日');
    setLocale('es');
    expect(formatNumber(12345)).toBe('12.345');
    expect(countryName('AR')).toBe('Argentina');
  });
});

describe('locale data for browsers without Welsh (Chrome)', () => {
  afterEach(() => _setCldr('cy', null));

  it('src/i18n/cldr/cy.json is what this Node writes (rerun scripts/cldr_fallback.mjs if not)', () => {
    expect(cyCldr).toEqual(buildCldr('cy'));
  });

  it('formats Welsh dates, relative times and countries exactly as native Intl does', () => {
    setLocale('cy');
    const dates = ['2026-01-01T00:30:00Z', '2026-03-29T23:59:00Z', '1937-12-08T12:00:00Z', '2026-11-14T09:05:00Z', '2000-07-04T18:45:00Z'];
    const zones = ['UTC', 'America/Argentina/Buenos_Aires', 'Europe/London', 'Asia/Tokyo'];
    const native = dates.flatMap((iso) => zones.flatMap((z) => (['long', 'medium'] as const).map((st) => formatDate(new Date(iso), st, z))));
    const rel = relativeKeys().map(([u, n]: [string, number]) => formatRelative(n, u as 'second'));
    const regions = ['AR', 'GB', 'CL', 'US', 'ES', 'JP'].map((c) => regionName(c));
    _setCldr('cy', cyCldr as Cldr);
    expect(dates.flatMap((iso) => zones.flatMap((z) => (['long', 'medium'] as const).map((st) => formatDate(new Date(iso), st, z))))).toEqual(native);
    expect(relativeKeys().map(([u, n]: [string, number]) => formatRelative(n, u as 'second'))).toEqual(rel);
    expect(['AR', 'GB', 'CL', 'US', 'ES', 'JP'].map((c) => regionName(c))).toEqual(regions);
    expect(formatDate(new Date('2026-11-14T13:32:00Z'), 'long', 'UTC')).toBe('14 Tachwedd 2026');
    expect(formatRelative(-1, 'day')).toBe('ddoe');
  });

  it('says "rŵan", the word of the Wladfa, for now', () => {
    setLocale('cy');
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(relativa('2026-11-14T11:59:50Z', now, 'UTC')).toBe('rŵan');
    _setCldr('cy', cyCldr as Cldr);
    expect(relativa('2026-11-14T11:59:50Z', now, 'UTC')).toBe('rŵan');
    expect(relativa('2026-11-14T11:55:00Z', now, 'UTC')).toBe('5 munud yn ôl');
    setLocale('es');
    expect(relativa('2026-11-14T11:59:50Z', now, 'UTC')).toBe('ahora');
  });

  it('only Welsh needs it: every other language is in Intl everywhere', () => {
    for (const l of LOCALES.filter((x) => x !== 'cy')) expect(Intl.DateTimeFormat.supportedLocalesOf([LOCALE_INFO[l].tag.split('-')[0]]), l).not.toEqual([]);
  });
});
