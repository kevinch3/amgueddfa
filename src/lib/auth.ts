import type { SupabaseClient } from '@supabase/supabase-js';
import { liveQuery, withOptionalCols } from './live';
import { url } from './paths';
import { isCountry, isTimeZone } from './places';
import { getClient } from './supabase';

export type Result = { ok: true } | { ok: false; key: string };
export type Profile = {
  id: string;
  display_name: string | null;
  role: 'user' | 'admin';
  points: number;
  /** Public: ISO 3166-1 alpha-2 or a GB nation ("GB-WLS"). */
  country?: string | null;
  /** Private: IANA timezone used to show dates and times. */
  timezone?: string | null;
};

export const RESEND_MS = 60_000;
const OFFLINE: Result = { ok: false, key: 'estado.sin_conexion' };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

type ErrLike = { name?: string; code?: string; status?: number; message?: string } | null | undefined;

function isNetwork(e: ErrLike): boolean {
  return !e || e.name === 'AuthRetryableFetchError' || e.status === 0 || e.name === 'TypeError';
}

function isRateLimit(e: ErrLike): boolean {
  return e?.status === 429 || /^over_.*_limit$/.test(e?.code ?? '');
}

export function normaliseEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

/** True once 60 s have passed since the last send (or nothing was sent yet). */
export function canResend(lastSentAt: number, now: number): boolean {
  return !lastSentAt || now - lastSentAt >= RESEND_MS;
}

const inflight = new Map<string, Promise<Result>>();
/** Test hook: forget in-flight sends. */
export function _resetInflight(): void {
  inflight.clear();
}

type Loc = { origin: string; search: string };

/**
 * Absolute /ingresar/ URL on this origin for the email link to come back to,
 * carrying `volver` only when it is a safe path on this site.
 */
export function linkRedirect(loc: Loc): string {
  const volver = returnPath(new URLSearchParams(loc.search).get('volver'), url('/'));
  const to = `${loc.origin}${url('ingresar/')}`;
  return volver ? `${to}?volver=${encodeURIComponent(volver)}` : to;
}

/**
 * Email a sign-in code (and, with Supabase's default templates, a link back to
 * /ingresar/). Concurrent calls for the same address share one request.
 */
export function sendCode(
  email: string,
  client: SupabaseClient | null = getClient(),
  loc: Loc | undefined = (globalThis as { location?: Loc }).location,
): Promise<Result> {
  const addr = normaliseEmail(email);
  if (!EMAIL_RE.test(addr)) return Promise.resolve({ ok: false, key: 'auth.error.email' });
  if (!client) return Promise.resolve(OFFLINE);
  const running = inflight.get(addr);
  if (running) return running;
  const p = (async (): Promise<Result> => {
    try {
      const options: { shouldCreateUser: boolean; emailRedirectTo?: string } = { shouldCreateUser: true };
      if (loc?.origin) options.emailRedirectTo = linkRedirect(loc);
      const { error } = await client.auth.signInWithOtp({ email: addr, options });
      if (!error) return { ok: true };
      const e = error as ErrLike;
      if (isRateLimit(e)) return { ok: false, key: 'auth.error.demasiados' };
      if (e?.code === 'email_address_invalid' || e?.code === 'validation_failed') return { ok: false, key: 'auth.error.email' };
      return OFFLINE;
    } catch {
      return OFFLINE;
    } finally {
      inflight.delete(addr);
    }
  })();
  inflight.set(addr, p);
  return p;
}

/** Check the code from the email. Signs the user in on success. */
export async function verifyCode(email: string, code: string, client: SupabaseClient | null = getClient()): Promise<Result> {
  const addr = normaliseEmail(email);
  const token = (code ?? '').replace(/\s+/g, '');
  if (!EMAIL_RE.test(addr)) return { ok: false, key: 'auth.error.email' };
  if (!/^\d{6}$/.test(token)) return { ok: false, key: 'auth.error.codigo_invalido' };
  if (!client) return OFFLINE;
  try {
    const { error } = await client.auth.verifyOtp({ email: addr, token, type: 'email' });
    if (!error) return { ok: true };
    const e = error as ErrLike;
    if (e?.code === 'otp_expired') return { ok: false, key: 'auth.error.codigo_vencido' };
    if (isRateLimit(e)) return { ok: false, key: 'auth.error.demasiados' };
    if (isNetwork(e) || (e?.status ?? 0) >= 500) return OFFLINE;
    return { ok: false, key: 'auth.error.codigo_invalido' };
  } catch {
    return OFFLINE;
  }
}

/** Set the public display name (3-30 characters, unique ignoring case). */
export async function setDisplayName(name: string, client: SupabaseClient | null = getClient()): Promise<Result> {
  const clean = (name ?? '').trim();
  const len = [...clean].length;
  if (len < 3 || len > 30) return { ok: false, key: 'auth.error.nombre_largo' };
  if (!client) return OFFLINE;
  try {
    const { error } = await client.rpc('set_display_name', { name: clean });
    if (!error) return { ok: true };
    const msg = (error as ErrLike)?.message ?? '';
    if (msg.includes('display_name_taken')) return { ok: false, key: 'auth.error.nombre_usado' };
    if (msg.includes('invalid_display_name')) return { ok: false, key: 'auth.error.nombre_largo' };
    return OFFLINE;
  } catch {
    return OFFLINE;
  }
}

/** Set (or clear, with null / '') the caller's public country and private timezone. */
export async function setProfilePlace(
  country: string | null,
  timezone: string | null,
  client: SupabaseClient | null = getClient(),
): Promise<Result> {
  const c = (country ?? '').trim().toUpperCase() || null;
  const tz = (timezone ?? '').trim() || null;
  if (c && !isCountry(c)) return { ok: false, key: 'auth.error.pais' };
  if (tz && !isTimeZone(tz)) return { ok: false, key: 'auth.error.zona' };
  if (!client) return OFFLINE;
  try {
    const { error } = await client.rpc('set_profile_place', { country: c, timezone: tz });
    if (!error) return { ok: true };
    const msg = (error as ErrLike)?.message ?? '';
    if (msg.includes('invalid_country')) return { ok: false, key: 'auth.error.pais' };
    if (msg.includes('invalid_timezone')) return { ok: false, key: 'auth.error.zona' };
    return OFFLINE;
  } catch {
    return OFFLINE;
  }
}

const PROFILE_COLS = 'id, display_name, role, points';

/** The signed-in user's own profile row, or null (signed out, offline or no row). */
export async function currentProfile(client: SupabaseClient | null = getClient()): Promise<Profile | null> {
  if (!client) return null;
  const session = await liveQuery(async (c) => {
    const { data, error } = await c.auth.getSession();
    return { data: data?.session?.user?.id ?? null, error };
  }, null as string | null, 6000, client);
  const uid = session.data;
  if (!uid) return null;
  const { data } = await liveQuery<Profile | null>(
    // A database without the place columns yet must not sign people out.
    (c) => withOptionalCols((cols) => c.from('profiles').select(cols).eq('id', uid).maybeSingle(), PROFILE_COLS, 'country, timezone'),
    null,
    6000,
    client,
  );
  return data;
}

/**
 * Sign this device out. Uses scope 'local' so auth-js removes the stored
 * session before any network request: a shared computer must not stay signed
 * in just because the revoke request failed offline. If auth-js still reports
 * an error (or throws), we check whether a session is left on the device and
 * only report failure when it is.
 */
export async function signOut(client: SupabaseClient | null = getClient()): Promise<Result> {
  if (!client) return { ok: true };
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (!error) return { ok: true };
  } catch {
    /* fall through to the session check */
  }
  try {
    const { data } = await client.auth.getSession();
    return data?.session ? OFFLINE : { ok: true };
  } catch {
    return OFFLINE;
  }
}

/**
 * The page to go back to after signing in (`/ingresar?volver=…`): only a path on
 * this site under `base`, never another origin or a protocol-relative URL.
 */
export function returnPath(raw: string | null | undefined, base: string): string | null {
  const v = (raw ?? '').trim();
  const b = base.endsWith('/') ? base : `${base}/`;
  if (!v.startsWith(b) || v.startsWith('//') || /[\\\s]/.test(v) || v.includes('://')) return null;
  return v;
}

const CALLBACK_PARAMS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description'];

function linkErrorKey(error: string, code: string, description: string): string {
  if (/^over_.*_limit$/.test(code) || /^over_.*_limit$/.test(error) || /rate limit/i.test(description)) return 'auth.error.demasiados';
  // otp_expired, access_denied, "Email link is invalid or has expired" and anything else: ask for a new one.
  return 'auth.error.codigo_vencido';
}

/**
 * Read an email-link return URL: the PKCE `code`, or Supabase's error
 * (`error`, `error_code`, `error_description`, in the query or the hash).
 * `clean` is the same page without those parameters, or null when nothing
 * needs stripping.
 */
export function linkCallback(href: string): { code: string | null; key: string | null; clean: string | null } {
  const u = new URL(href);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const get = (k: string) => u.searchParams.get(k) ?? hash.get(k) ?? '';
  const error = get('error');
  const errorCode = get('error_code');
  const description = get('error_description');
  const code = u.searchParams.get('code');
  const hasError = Boolean(error || errorCode || description);
  if (!hasError && !code) return { code: null, key: null, clean: null };
  for (const k of CALLBACK_PARAMS) u.searchParams.delete(k);
  if (['error', 'error_code', 'error_description', 'access_token'].some((k) => hash.has(k))) u.hash = '';
  const clean = `${u.pathname}${u.search}${u.hash}`;
  if (hasError) return { code: null, key: linkErrorKey(error, errorCode, description), clean };
  return { code, key: null, clean };
}

type Hist = { state: unknown; replaceState: (state: unknown, unused: string, url: string) => void };

/**
 * On /ingresar/, finish an email-link sign-in. The client (detectSessionInUrl,
 * PKCE) normally exchanges `?code=` itself while it starts; if it has not, we
 * exchange it here. The link only works in the browser that asked for it,
 * because the PKCE code verifier lives in that browser's storage.
 */
export async function handleLinkCallback(
  href: string,
  hist: Hist,
  client: SupabaseClient | null = getClient(),
): Promise<{ handled: false } | { handled: true; result: Result }> {
  const cb = linkCallback(href);
  if (!cb.clean) return { handled: false };
  const strip = () => {
    try {
      hist.replaceState(hist.state, '', cb.clean as string);
    } catch {
      /* keep going: the sign-in matters more than a tidy URL */
    }
  };
  if (cb.key || !client) {
    strip();
    return { handled: true, result: cb.key ? { ok: false, key: cb.key } : OFFLINE };
  }
  // Strip only after the exchange: auth-js reads sb_flow_id from the live URL.
  const result = await exchangeLinkCode(cb.code as string, client);
  strip();
  return { handled: true, result };
}

function exchangeErrorKey(e: ErrLike): Result {
  if (e?.name === 'AuthPKCECodeVerifierMissingError' || e?.code === 'pkce_code_verifier_not_found') {
    return { ok: false, key: 'auth.error.otro_navegador' };
  }
  if (isRateLimit(e)) return { ok: false, key: 'auth.error.demasiados' };
  if (isNetwork(e) || (e?.status ?? 0) >= 500) return OFFLINE;
  return { ok: false, key: 'auth.error.codigo_vencido' };
}

async function exchangeLinkCode(code: string, client: SupabaseClient): Promise<Result> {
  try {
    // The client's own start-up exchange (it removes the verifier even when it
    // fails, so a second try would wrongly look like "another browser").
    const init = await client.auth.initialize();
    if (init?.error) return exchangeErrorKey(init.error as ErrLike);
    const { data } = await client.auth.getSession();
    if (data?.session) return { ok: true };
    // The client skipped the code: no verifier here (another browser) or no detection.
    const { error } = await client.auth.exchangeCodeForSession(code);
    return error ? exchangeErrorKey(error as ErrLike) : { ok: true };
  } catch {
    return OFFLINE;
  }
}
