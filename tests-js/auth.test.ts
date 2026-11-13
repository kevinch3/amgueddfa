import { beforeEach, describe, expect, it } from 'vitest';
import { canResend, currentProfile, sendCode, setDisplayName, verifyCode, _resetInflight } from '../src/lib/auth';

function apiErr(code: string | undefined, status: number, name = 'AuthApiError') {
  return Object.assign(new Error(code ?? 'err'), { __isAuthError: true, name, code, status });
}

function fakeClient(overrides: Record<string, any> = {}) {
  const calls: Record<string, any[]> = { signInWithOtp: [], verifyOtp: [], rpc: [] };
  const auth = {
    signInWithOtp: async (a: any) => { calls.signInWithOtp.push(a); return overrides.signInWithOtp?.(a) ?? { data: {}, error: null }; },
    verifyOtp: async (a: any) => { calls.verifyOtp.push(a); return overrides.verifyOtp?.(a) ?? { data: {}, error: null }; },
    getSession: async () => overrides.getSession?.() ?? { data: { session: null }, error: null },
  };
  const client: any = {
    auth,
    rpc: async (fn: string, args: any) => { calls.rpc.push([fn, args]); return overrides.rpc?.(fn, args) ?? { data: null, error: null }; },
    from: overrides.from,
  };
  return { client, calls };
}

beforeEach(() => _resetInflight());

describe('verifyCode (Review Focus 3: wrong, expired or re-requested code)', () => {
  it('maps otp_expired → codigo_vencido', async () => {
    const { client } = fakeClient({ verifyOtp: () => ({ data: {}, error: apiErr('otp_expired', 403) }) });
    expect(await verifyCode('a@b.com', '123456', client)).toEqual({ ok: false, key: 'auth.error.codigo_vencido' });
  });

  it('maps an invalid code → codigo_invalido', async () => {
    const { client } = fakeClient({ verifyOtp: () => ({ data: {}, error: apiErr('invalid_credentials', 400) }) });
    expect(await verifyCode('a@b.com', '123456', client)).toEqual({ ok: false, key: 'auth.error.codigo_invalido' });
  });

  it('rejects a malformed code without a network call', async () => {
    const { client, calls } = fakeClient();
    expect(await verifyCode('a@b.com', '12a45', client)).toEqual({ ok: false, key: 'auth.error.codigo_invalido' });
    expect(calls.verifyOtp).toHaveLength(0);
  });

  it('maps 429 → demasiados and a network failure → sin_conexion', async () => {
    let r = await verifyCode('a@b.com', '123456', fakeClient({ verifyOtp: () => ({ data: {}, error: apiErr('over_request_rate_limit', 429) }) }).client);
    expect(r).toEqual({ ok: false, key: 'auth.error.demasiados' });
    r = await verifyCode('a@b.com', '123456', fakeClient({ verifyOtp: () => ({ data: {}, error: apiErr(undefined, 0, 'AuthRetryableFetchError') }) }).client);
    expect(r).toEqual({ ok: false, key: 'estado.sin_conexion' });
    r = await verifyCode('a@b.com', '123456', fakeClient({ verifyOtp: () => { throw new TypeError('Failed to fetch'); } }).client);
    expect(r).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });

  it('succeeds with a 6-digit code, trimming spaces, as an email OTP', async () => {
    const { client, calls } = fakeClient();
    expect(await verifyCode(' A@B.com ', ' 123 456 ', client)).toEqual({ ok: true });
    expect(calls.verifyOtp[0]).toEqual({ email: 'a@b.com', token: '123456', type: 'email' });
  });

  it('is offline without a client', async () => {
    expect(await verifyCode('a@b.com', '123456', null)).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });
});

describe('canResend', () => {
  it('is false before 60 s', () => {
    expect(canResend(1_000_000, 1_000_000)).toBe(false);
    expect(canResend(1_000_000, 1_059_999)).toBe(false);
  });
  it('is true from 60 s on, and when nothing was sent yet', () => {
    expect(canResend(1_000_000, 1_060_000)).toBe(true);
    expect(canResend(0, Date.now())).toBe(true);
  });
});

describe('sendCode', () => {
  it('rejects malformed email without network call', async () => {
    const { client, calls } = fakeClient();
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '@c.com', 'a@.com']) {
      expect(await sendCode(bad, client)).toEqual({ ok: false, key: 'auth.error.email' });
    }
    expect(calls.signInWithOtp).toHaveLength(0);
  });

  it('sends a normalised email and creates the user if needed', async () => {
    const { client, calls } = fakeClient();
    expect(await sendCode('  Ana@Example.COM ', client)).toEqual({ ok: true });
    expect(calls.signInWithOtp[0]).toEqual({ email: 'ana@example.com', options: { shouldCreateUser: true } });
  });

  it('does not send twice while a send is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, calls } = fakeClient({ signInWithOtp: async () => { await gate; return { data: {}, error: null }; } });
    const a = sendCode('ana@example.com', client);
    const b = sendCode('ana@example.com', client);
    release();
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
    expect(calls.signInWithOtp).toHaveLength(1);
  });

  it('maps rate limits → demasiados, invalid address → email, network → sin_conexion', async () => {
    let r = await sendCode('a@b.com', fakeClient({ signInWithOtp: () => ({ data: {}, error: apiErr('over_email_send_rate_limit', 429) }) }).client);
    expect(r).toEqual({ ok: false, key: 'auth.error.demasiados' });
    r = await sendCode('a@b.com', fakeClient({ signInWithOtp: () => ({ data: {}, error: apiErr('email_address_invalid', 400) }) }).client);
    expect(r).toEqual({ ok: false, key: 'auth.error.email' });
    r = await sendCode('a@b.com', fakeClient({ signInWithOtp: () => { throw new TypeError('Failed to fetch'); } }).client);
    expect(r).toEqual({ ok: false, key: 'estado.sin_conexion' });
    expect(await sendCode('a@b.com', null)).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });
});

describe('setDisplayName', () => {
  it('validates length locally and maps a taken name', async () => {
    const { client, calls } = fakeClient({ rpc: () => ({ data: null, error: { message: 'display_name_taken', code: 'P0001' } }) });
    expect(await setDisplayName('ab', client)).toEqual({ ok: false, key: 'auth.error.nombre_largo' });
    expect(await setDisplayName('x'.repeat(31), client)).toEqual({ ok: false, key: 'auth.error.nombre_largo' });
    expect(calls.rpc).toHaveLength(0);
    expect(await setDisplayName(' Ana ', client)).toEqual({ ok: false, key: 'auth.error.nombre_usado' });
    expect(calls.rpc[0]).toEqual(['set_display_name', { name: 'Ana' }]);
  });
});

describe('currentProfile', () => {
  it('is null without a client or session', async () => {
    expect(await currentProfile(null)).toBeNull();
    expect(await currentProfile(fakeClient().client)).toBeNull();
  });

  it('reads the signed-in user profile', async () => {
    const row = { id: 'u1', display_name: 'Ana', role: 'user', points: 30 };
    let filter: any[] = [];
    const from = (table: string) => ({
      select: () => ({
        eq: (col: string, v: string) => { filter = [table, col, v]; return { maybeSingle: async () => ({ data: row, error: null }) }; },
      }),
    });
    const { client } = fakeClient({ getSession: () => ({ data: { session: { user: { id: 'u1' } } }, error: null }), from });
    expect(await currentProfile(client)).toEqual(row);
    expect(filter).toEqual(['profiles', 'id', 'u1']);
  });
});
