import type { SupabaseClient } from '@supabase/supabase-js';
import { liveQuery } from './live';
import { getClient } from './supabase';

export type Result = { ok: true } | { ok: false; key: string };
export type Profile = { id: string; display_name: string | null; role: 'user' | 'admin'; points: number };

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

/** Email a 6-digit code. Concurrent calls for the same address share one request. */
export function sendCode(email: string, client: SupabaseClient | null = getClient()): Promise<Result> {
  const addr = normaliseEmail(email);
  if (!EMAIL_RE.test(addr)) return Promise.resolve({ ok: false, key: 'auth.error.email' });
  if (!client) return Promise.resolve(OFFLINE);
  const running = inflight.get(addr);
  if (running) return running;
  const p = (async (): Promise<Result> => {
    try {
      const { error } = await client.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
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
    (c) => c.from('profiles').select('id, display_name, role, points').eq('id', uid).maybeSingle(),
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
