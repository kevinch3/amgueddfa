// Profile fields shared by the sign-up step (ingresar) and "Editar perfil" (perfil):
// display name, public country, private timezone.
import { t } from '../lib/i18n';
import { browserTimeZone, countryName, countryOptions, flag, guessCountry, isCountry, timeZones } from '../lib/places';
import { el } from './ui';

export type Place = { country: string | null; timezone: string | null };

function campo(id: string, label: string, help: string, control: HTMLElement): HTMLDivElement {
  const box = el('div', { class: 'campo' });
  const helpId = `${id}-ayuda`;
  control.id = id;
  control.setAttribute('aria-describedby', helpId);
  box.append(el('label', { for: id }, label), control, el('p', { class: 'muted small', id: helpId }, help));
  return box;
}

function option(value: string, text: string, selected: boolean): HTMLOptionElement {
  const o = el('option', { value }, text);
  o.selected = selected;
  return o;
}

/** "Gales 🏴…" style label for a country code. */
export function countryLabel(code: string): string {
  return `${countryName(code)} ${flag(code)}`.trim();
}

/** Timezone label: "America/Argentina/Buenos Aires". */
const tzLabel = (tz: string) => tz.replace(/_/g, ' ');

/** Display-name input (3-30 characters), as in the sign-up step. */
export function nameField(id: string, value = ''): { root: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'text', name: 'nombre', autocomplete: 'nickname', minlength: '3', maxlength: '30', required: '' });
  input.value = value;
  return { root: campo(id, t('auth.nombre_label'), t('auth.nombre_ayuda'), input), input };
}

/**
 * Country and timezone selects. `saved` is what the profile already has; with
 * `guess`, empty values are prefilled from the browser (sign-up only: someone
 * who cleared their country on purpose must not get it guessed back).
 */
export function placeFields(prefix: string, saved: Partial<Place> = {}, guess = false): { root: HTMLElement; value(): Place } {
  const tzBrowser = browserTimeZone();
  let country = isCountry(saved.country) ? saved.country : null;
  let timezone = saved.timezone ?? null;
  if (guess) {
    timezone ??= tzBrowser;
    country ??= guessCountry(tzBrowser, typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  }

  const cSel = el('select', { name: 'pais', autocomplete: 'country' });
  cSel.append(option('', t('auth.pais_ninguno'), !country));
  const { common, rest } = countryOptions();
  const groups: [string, string[]][] = [[t('auth.pais_comunes'), common], [t('auth.pais_todos'), rest]];
  for (const [label, codes] of groups) {
    const g = el('optgroup', { label });
    for (const code of codes) g.append(option(code, countryLabel(code), code === country));
    cSel.append(g);
  }

  const zSel = el('select', { name: 'zona' });
  zSel.append(option('', t('auth.zona_ninguna'), !timezone));
  for (const tz of timeZones(timezone)) zSel.append(option(tz, tzLabel(tz), tz === timezone));

  const root = el('div', { class: 'lugar-campos' });
  root.append(
    campo(`${prefix}-pais`, t('auth.pais_label'), t('auth.pais_ayuda'), cSel),
    campo(`${prefix}-zona`, t('auth.zona_label'), t('auth.zona_ayuda'), zSel),
  );
  return { root, value: () => ({ country: cSel.value || null, timezone: zSel.value || null }) };
}
