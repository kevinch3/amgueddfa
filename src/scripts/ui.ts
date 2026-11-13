import { currentProfile, type Profile } from '../lib/auth';
import { CATEGORIES, FESTIVALS } from '../lib/contrib';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { url } from '../lib/paths';
import { getClient } from '../lib/supabase';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

/** `/ingresar?volver=<this page>`. */
export function loginHref(): string {
  return url(`ingresar?volver=${encodeURIComponent(location.pathname + location.search)}`);
}

export type Gate = { profile: Profile } | { profile: null; reason: 'offline' | 'signed_out' | 'no_name' };

/** Who is contributing: a profile with a display name, or why not. */
export async function gate(): Promise<Gate> {
  const client = getClient();
  if (!client) return { profile: null, reason: 'offline' };
  let p: Profile | null = null;
  try {
    p = await currentProfile(client);
  } catch {
    p = null;
  }
  if (p?.display_name) return { profile: p };
  if (p) return { profile: null, reason: 'no_name' };
  const s = await liveQuery(async (c) => {
    const { data, error } = await c.auth.getSession();
    return { data: Boolean(data?.session), error };
  }, false, 6000, client);
  // A stored session whose profile could not be read means the network failed.
  return { profile: null, reason: s.offline || s.data ? 'offline' : 'signed_out' };
}

/** The message and link shown instead of a form when the visitor cannot contribute yet. */
export function gateMessage(reason: 'offline' | 'signed_out' | 'no_name', signedOutKey: string): HTMLElement {
  const p = el('p', { class: 'contrib-gate' });
  if (reason === 'offline') p.textContent = t('estado.sin_conexion');
  else if (reason === 'no_name') {
    p.append(t('contrib.elegir_nombre'), ' ', el('a', { href: loginHref() }, t('sesion.sin_nombre')));
  } else p.append(el('a', { href: loginHref(), class: 'btn' }, t(signedOutKey)));
  return p;
}

export function select(id: string, options: [string, string][], blank: string | null): HTMLSelectElement {
  const s = el('select', { id, name: id });
  if (blank !== null) s.append(el('option', { value: '' }, blank));
  for (const [v, label] of options) s.append(el('option', { value: v }, label));
  return s;
}

export const categoryOptions = (): [string, string][] => CATEGORIES.map((c) => [c, t(`categorias.${c}`)]);
export const festivalOptions = (): [string, string][] => FESTIVALS.map((f) => [f, t(`festivales.${f}`)]);

/** Label + control in one block. */
export function field(labelText: string, control: HTMLElement): HTMLDivElement {
  const d = el('div', { class: 'campo' });
  d.append(el('label', { for: control.id }, labelText), control);
  return d;
}

/** Disable a submit button while `fn` runs, then show its result in `msg`. */
export async function busy<T>(btn: HTMLButtonElement, idle: string, fn: () => Promise<T>): Promise<T> {
  btn.disabled = true;
  btn.textContent = t('contrib.enviando');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = idle;
  }
}
