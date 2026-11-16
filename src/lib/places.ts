// Countries and timezones for the profile: codes, names in the reader's language, flags, browser guesses.
import { intlLocales, regionName, t } from './i18n';

/** ISO 3166-1 alpha-2 codes (assigned), in code order. */
const ISO =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

/** The four nations of the United Kingdom, so Welsh contributors can say Gales. */
export const GB_NATIONS = ['GB-WLS', 'GB-ENG', 'GB-SCT', 'GB-NIR'] as const;

/** Listed first in the picker: where most of the archive's contributors live. */
export const COMMON = ['AR', 'GB-WLS', 'CL', 'GB-ENG', 'US'] as const;

export const COUNTRIES: readonly string[] = [...ISO.split(' '), ...GB_NATIONS];

const CODE_RE = /^[A-Z]{2}(-[A-Z]{3})?$/;

/** True for a code the database accepts and we can name. */
export function isCountry(code: string | null | undefined): code is string {
  return typeof code === 'string' && CODE_RE.test(code) && COUNTRIES.includes(code);
}

/** The name of a country code in the current language ("AR" → "Argentina", "GB-WLS" → "Gales"); '' if unknown. */
export function countryName(code: string | null | undefined): string {
  if (!isCountry(code)) return '';
  if (code.includes('-')) return t(`paises.${code}`);
  return regionName(code) ?? code;
}

/** Flag emoji: regional indicators, or the tag sequence for Wales, England and Scotland. */
export function flag(code: string | null | undefined): string {
  if (!isCountry(code)) return '';
  const [cc, sub] = code.split('-');
  if (sub) {
    if (sub === 'NIR') return flag('GB'); // no flag emoji for Northern Ireland
    const tags = [...`${cc}${sub}`.toLowerCase()].map((ch) => String.fromCodePoint(0xe0000 + ch.charCodeAt(0)));
    return `\u{1F3F4}${tags.join('')}\u{E007F}`;
  }
  return [...cc].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join('');
}

/** Picker entries: the common ones first, then everything else by name, in the current language. */
export function countryOptions(): { common: string[]; rest: string[] } {
  const common = [...COMMON] as string[];
  const rest = COUNTRIES.filter((c) => !common.includes(c)).sort((a, b) =>
    countryName(a).localeCompare(countryName(b), intlLocales()),
  );
  return { common, rest };
}

/** True when the runtime knows this IANA timezone. */
export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The browser's IANA timezone, or null if it does not say. */
export function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/** Every IANA timezone the runtime lists (plus `extra`, e.g. a saved one it does not list). */
export function timeZones(extra?: string | null): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    list = [];
  }
  if (!list.includes('UTC')) list = [...list, 'UTC'];
  if (extra && isTimeZone(extra) && !list.includes(extra)) list = [...list, extra];
  return [...list].sort();
}

/**
 * Best guess at the contributor's country, to prefill the sign-up picker.
 * They can always change it or pick "Prefiero no decirlo", so a wrong guess is
 * cheap, but a confident wrong one (Wales for a Londoner) is annoying.
 *
 * @param timeZone   the browser's IANA timezone, e.g. "America/Argentina/Buenos_Aires"
 * @param languages  navigator.languages, e.g. ["cy-GB", "en-GB"] or ["es-AR", "es"]
 * @returns a code from COUNTRIES, or null to leave the picker empty
 */
export function guessCountry(timeZone: string | null, languages: readonly string[]): string | null {
  // TODO(you): decide which signal wins and when to guess nothing.
  void timeZone;
  void languages;
  return null;
}
