// Locale data that some browsers lack, taken from Node's full ICU: Chrome ships no
// Welsh at all, so dates, "ddoe" and country names would come out in English on the
// Welsh pages. Writes src/i18n/cldr/<lang>.json; src/lib/i18n.ts loads it only in a
// browser whose Intl does not know the page's language.
//
//   node scripts/cldr_fallback.mjs        (rerun after a Node upgrade; tests check it is current)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGS = ['cy'];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'cldr');

/** The same date options src/lib/i18n.ts formatDate() uses natively. */
export const STYLES = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  medium: { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' },
};

/** Every relative value src/lib/dates.ts relativa() can ask for. */
export function relativeKeys() {
  const keys = [['second', 0]];
  for (let n = 45; n <= 60; n++) keys.push(['second', -n], ['second', n]);
  for (let n = 1; n <= 60; n++) keys.push(['minute', -n]);
  for (let n = 1; n <= 24; n++) keys.push(['hour', -n]);
  for (let n = 1; n <= 7; n++) keys.push(['day', -n]);
  return keys;
}

/** A date pattern with {day} {month} {year} {hour} {minute} slots, from a sample format. */
function pattern(lang, opts) {
  const d = new Date(Date.UTC(2026, 10, 14, 9, 5));
  return new Intl.DateTimeFormat(lang, { ...opts, timeZone: 'UTC' })
    .formatToParts(d)
    .map((p) => (['day', 'month', 'year', 'hour', 'minute'].includes(p.type) ? `{${p.type}}` : p.value))
    .join('');
}

function monthNames(lang, opts) {
  const f = new Intl.DateTimeFormat(lang, { ...opts, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.formatToParts(new Date(Date.UTC(2026, i, 14, 9, 5))).find((p) => p.type === 'month').value);
}

export function build(lang) {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const relative = Object.fromEntries(relativeKeys().map(([u, n]) => [`${u}:${n}`, rtf.format(n, u)]));
  const names = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
  const regions = {};
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name) regions[code] = name;
    }
  }
  return {
    long: pattern(lang, STYLES.long),
    medium: pattern(lang, STYLES.medium),
    months: monthNames(lang, STYLES.long),
    monthsShort: monthNames(lang, STYLES.medium),
    relative,
    regions,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const lang of LANGS) {
    if (!Intl.DateTimeFormat.supportedLocalesOf([lang]).length) throw new Error(`This Node has no ${lang} locale data (needs full ICU).`);
    writeFileSync(join(OUT, `${lang}.json`), `${JSON.stringify(build(lang), null, 2)}\n`);
    console.log(`wrote src/i18n/cldr/${lang}.json`);
  }
}
