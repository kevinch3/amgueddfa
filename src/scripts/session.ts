import { currentProfile, rememberLanguage, signOut, type Profile } from '../lib/auth';
import { setUserTimeZone } from '../lib/dates';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { url } from '../lib/paths';
import { getClient } from '../lib/supabase';

function link(href: string, text: string, cls = 'sesion-link'): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.className = cls;
  a.textContent = text;
  return a;
}

function points(n: number): string {
  return n === 1 ? t('sesion.un_punto') : t('sesion.puntos', { n });
}

/** A "Salir" button: ends the session on this device and goes back to the home page. */
function salir(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sesion-salir';
  b.textContent = t('auth.salir');
  b.addEventListener('click', async () => {
    b.disabled = true;
    await signOut(); // local scope: always clears this browser's session
    window.location.href = url('/');
  });
  return b;
}

/** Render #sesion: the signed-in user's name, points and a "Salir" button, or an "Ingresar" link. */
export function renderSession(el: HTMLElement, profile: Profile | null, offline: boolean): void {
  el.replaceChildren();
  if (profile?.display_name) {
    const a = link(url(`perfil?u=${encodeURIComponent(profile.display_name)}`), profile.display_name);
    a.setAttribute('aria-label', t('sesion.perfil', { nombre: profile.display_name, puntos: points(profile.points) }));
    const pts = document.createElement('span');
    pts.className = 'sesion-puntos';
    pts.textContent = points(profile.points);
    a.append(' ', pts);
    el.append(a);
    if (profile.role === 'admin') el.append(' ', link(url('admin'), t('sesion.admin'), 'sesion-link sesion-admin'));
    el.append(' ', salir());
  } else if (profile) {
    el.append(link(url('ingresar'), t('sesion.sin_nombre')), ' ', salir());
  } else {
    el.append(link(url('ingresar'), t('sesion.ingresar')));
    if (offline) {
      const s = document.createElement('span');
      s.className = 'sesion-offline muted';
      s.title = t('estado.sin_conexion');
      s.textContent = t('sesion.sin_conexion');
      el.append(' ', s);
    }
  }
}

/**
 * The archive's contact address, assembled here so it never appears as text in
 * the built HTML (public pages show it only as public/contacto.png).
 */
function contactAddress(): string {
  const parts = ['ar', 'kevinroberts', 'info'];
  return `${parts[2]}${String.fromCharCode(64)}${parts[1]}.${parts[0]}`;
}

/** Footer: signed-in people also get a mailto link next to the address image. */
export function renderContact(el: HTMLElement | null, profile: Profile | null): void {
  if (!el) return;
  el.replaceChildren();
  if (!profile) return;
  el.append(link(`mailto:${contactAddress()}`, t('pie.contacto_escribinos'), 'contacto-link'));
}

async function hydrate(): Promise<void> {
  const el = document.getElementById('sesion');
  if (!el) return;
  const client = getClient();
  let profile: Profile | null = null;
  try {
    profile = await currentProfile(client);
  } catch {
    profile = null;
  }
  // Signed in (session in local storage) but the profile read failed: say so.
  let offline = !client;
  if (client && !profile) {
    const s = await liveQuery(async (c) => {
      const { data, error } = await c.auth.getSession();
      return { data: Boolean(data?.session), error };
    }, false, 6000, client);
    offline = s.offline || s.data;
  }
  // Dates on every page follow the saved timezone; signing out forgets it.
  if (profile) setUserTimeZone(profile.timezone ?? null);
  else if (!offline) setUserTimeZone(null);
  if (profile) void rememberLanguage(client);
  renderSession(el, profile, offline);
  renderContact(document.getElementById('contacto-mail'), profile);
}

hydrate();
document.addEventListener('amg:sesion', () => void hydrate());
