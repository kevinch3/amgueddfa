import { beforeEach, describe, expect, it } from 'vitest';
import { canResend, currentProfile, handleLinkCallback, linkCallback, sendCode, setDisplayName, setProfilePlace, signOut, verifyCode, _resetInflight } from '../src/lib/auth';

function apiErr(code: string | undefined, status: number, name = 'AuthApiError') {
  return Object.assign(new Error(code ?? 'err'), { __isAuthError: true, name, code, status });
}

function fakeClient(overrides: Record<string, any> = {}) {
  const calls: Record<string, any[]> = { signInWithOtp: [], verifyOtp: [], rpc: [], signOut: [] };
  const auth = {
    signInWithOtp: async (a: any) => { calls.signInWithOtp.push(a); return overrides.signInWithOtp?.(a) ?? { data: {}, error: null }; },
    verifyOtp: async (a: any) => { calls.verifyOtp.push(a); return overrides.verifyOtp?.(a) ?? { data: {}, error: null }; },
    initialize: async () => overrides.initialize?.() ?? { error: null },
    getSession: async () => overrides.getSession?.() ?? { data: { session: null }, error: null },
    signOut: async (a: any) => { calls.signOut.push(a); return overrides.signOut?.(a) ?? { error: null }; },
    exchangeCodeForSession: async (c: string) => { (calls.exchange ??= []).push(c); return overrides.exchangeCodeForSession?.(c) ?? { data: {}, error: null }; },
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

  it('asks for the email link to come back to /ingresar/ on this origin, keeping a safe volver', async () => {
    const { client, calls } = fakeClient();
    const loc = { origin: 'https://amgueddfa.kevinroberts.ar', search: '?volver=%2Fcontribuir%2F%3Ff%3Dchubut%26y%3D1975' };
    expect(await sendCode('ana@example.com', client, loc)).toEqual({ ok: true });
    const to = new URL(calls.signInWithOtp[0].options.emailRedirectTo);
    expect(calls.signInWithOtp[0].options.shouldCreateUser).toBe(true);
    expect(to.origin).toBe('https://amgueddfa.kevinroberts.ar');
    expect(to.pathname).toBe('/ingresar/');
    expect(to.searchParams.get('volver')).toBe('/contribuir/?f=chubut&y=1975');
  });

  it('drops a volver that points off the site', async () => {
    for (const bad of ['//evil.example/', 'http://evil.example/', 'https://evil.example/x', '/\\evil.example']) {
      _resetInflight();
      const { client, calls } = fakeClient();
      await sendCode('ana@example.com', client, { origin: 'http://localhost:4321', search: `?volver=${encodeURIComponent(bad)}` });
      expect(calls.signInWithOtp[0].options.emailRedirectTo).toBe('http://localhost:4321/ingresar/');
    }
  });
});

describe('linkCallback / handleLinkCallback (email link sign-in)', () => {
  const O = 'https://amgueddfa.kevinroberts.ar/ingresar/';

  it('ignores a plain page load', () => {
    expect(linkCallback(O)).toEqual({ code: null, key: null, clean: null });
    expect(linkCallback(`${O}?volver=%2F`)).toEqual({ code: null, key: null, clean: null });
  });

  it('maps error_description values to i18n keys and strips them, keeping volver', () => {
    const cases: [string, string][] = [
      [`${O}?volver=%2Fx%2F#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, 'auth.error.codigo_vencido'],
      [`${O}?error=access_denied&error_description=Email+link+is+invalid+or+has+expired`, 'auth.error.codigo_vencido'],
      [`${O}?error_description=Token+has+expired`, 'auth.error.codigo_vencido'],
      [`${O}?error=over_email_send_rate_limit&error_description=Email+rate+limit+exceeded`, 'auth.error.demasiados'],
      [`${O}?error=server_error&error_description=Something`, 'auth.error.codigo_vencido'],
    ];
    for (const [href, key] of cases) {
      const r = linkCallback(href);
      expect(r.key).toBe(key);
      expect(r.code).toBeNull();
      expect(r.clean).not.toMatch(/error|code=/);
    }
    expect(linkCallback(cases[0][0]).clean).toBe('/ingresar/?volver=%2Fx%2F');
  });

  it('returns the PKCE code and a clean URL', () => {
    expect(linkCallback(`${O}?volver=%2Fx%2F&code=abc-123&sb_flow_id=f1`)).toEqual({ code: 'abc-123', key: null, clean: '/ingresar/?volver=%2Fx%2F' });
  });

  it('signs in from the code (session already exchanged by the client) and strips the query', async () => {
    const replaced: string[] = [];
    const hist = { state: null, replaceState: (_s: any, _t: string, u: string) => replaced.push(u) };
    const { client, calls } = fakeClient({ getSession: () => ({ data: { session: { user: { id: 'u' } } }, error: null }) });
    expect(await handleLinkCallback(`${O}?code=abc`, hist, client)).toEqual({ handled: true, result: { ok: true } });
    expect(calls.exchange).toBeUndefined();
    expect(replaced).toEqual(['/ingresar/']);
  });

  it('exchanges the code itself when the client did not', async () => {
    const hist = { state: null, replaceState: () => {} };
    const { client, calls } = fakeClient();
    expect(await handleLinkCallback(`${O}?code=abc`, hist, client)).toEqual({ handled: true, result: { ok: true } });
    expect(calls.exchange).toEqual(['abc']);
  });

  it('explains a link opened in another browser (no PKCE verifier)', async () => {
    const hist = { state: null, replaceState: () => {} };
    const { client } = fakeClient({
      exchangeCodeForSession: () => ({ data: {}, error: Object.assign(new Error('x'), { name: 'AuthPKCECodeVerifierMissingError', code: 'pkce_code_verifier_not_found', status: 400 }) }),
    });
    expect(await handleLinkCallback(`${O}?code=abc`, hist, client)).toEqual({ handled: true, result: { ok: false, key: 'auth.error.otro_navegador' } });
  });

  it('reports the client\'s own failed exchange (expired link) without a second try', async () => {
    const order: string[] = [];
    const hist = { state: null, replaceState: () => order.push('strip') };
    const { client, calls } = fakeClient({
      initialize: () => { order.push('init'); return { error: Object.assign(new Error('x'), { name: 'AuthApiError', code: 'flow_state_expired', status: 400 }) }; },
    });
    expect(await handleLinkCallback(`${O}?code=abc&sb_flow_id=f1`, hist, client)).toEqual({ handled: true, result: { ok: false, key: 'auth.error.codigo_vencido' } });
    expect(calls.exchange).toBeUndefined();
    expect(order).toEqual(['init', 'strip']);
  });

  it('reports a URL error and strips it', async () => {
    const replaced: string[] = [];
    const hist = { state: null, replaceState: (_s: any, _t: string, u: string) => replaced.push(u) };
    const { client } = fakeClient();
    const r = await handleLinkCallback(`${O}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, hist, client);
    expect(r).toEqual({ handled: true, result: { ok: false, key: 'auth.error.codigo_vencido' } });
    expect(replaced).toEqual(['/ingresar/']);
  });

  it('does nothing on a plain load', async () => {
    const { client } = fakeClient();
    expect(await handleLinkCallback(O, { state: null, replaceState: () => { throw new Error('no'); } }, client)).toEqual({ handled: false });
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

describe('setProfilePlace', () => {
  it('validates locally, normalises, and clears with null', async () => {
    const { client, calls } = fakeClient();
    expect(await setProfilePlace('XX', null, client)).toEqual({ ok: false, key: 'auth.error.pais' });
    expect(await setProfilePlace(null, 'Patagonia/Gaiman', client)).toEqual({ ok: false, key: 'auth.error.zona' });
    expect(calls.rpc).toHaveLength(0);
    expect(await setProfilePlace(' gb-wls ', 'Europe/London', client)).toEqual({ ok: true });
    expect(await setProfilePlace('', '', client)).toEqual({ ok: true });
    expect(calls.rpc).toEqual([
      ['set_profile_place', { country: 'GB-WLS', timezone: 'Europe/London' }],
      ['set_profile_place', { country: null, timezone: null }],
    ]);
  });

  it('maps server errors and is offline without a client', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: null, error: { message: 'invalid_timezone', code: 'P0001' } }) });
    expect(await setProfilePlace('AR', 'UTC', client)).toEqual({ ok: false, key: 'auth.error.zona' });
    expect(await setProfilePlace('AR', null, null)).toEqual({ ok: false, key: 'estado.sin_conexion' });
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

  it('still reads the profile from a database without the place columns', async () => {
    const row = { id: 'u1', display_name: 'Ana', role: 'user', points: 30 };
    const asked: string[] = [];
    const from = () => ({
      select: (cols: string) => {
        asked.push(cols);
        const res = cols.includes('country') ? { data: null, error: { code: '42703', message: 'column does not exist' } } : { data: row, error: null };
        return { eq: () => ({ maybeSingle: async () => res }) };
      },
    });
    const { client } = fakeClient({ getSession: () => ({ data: { session: { user: { id: 'u1' } } }, error: null }), from });
    expect(await currentProfile(client)).toEqual(row);
    expect(asked).toEqual(['id, display_name, role, points, country, timezone', 'id, display_name, role, points']);
  });
});

describe('signOut (shared computers must not stay signed in)', () => {
  const offlineErr = () => apiErr(undefined, 0, 'AuthRetryableFetchError');

  it('signs out this device only (scope local), never depending on a global revoke', async () => {
    const { client, calls } = fakeClient();
    expect(await signOut(client)).toEqual({ ok: true });
    expect(calls.signOut).toEqual([{ scope: 'local' }]);
  });

  it('reports success when signOut resolves {error} but the local session is gone', async () => {
    const { client } = fakeClient({ signOut: () => ({ error: offlineErr() }) });
    expect(await signOut(client)).toEqual({ ok: true });
  });

  it('reports sin_conexion when signOut resolves {error} and a session is still stored', async () => {
    const { client } = fakeClient({
      signOut: () => ({ error: offlineErr() }),
      getSession: () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    });
    expect(await signOut(client)).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });

  it('reports sin_conexion when signOut throws and a session is still stored', async () => {
    const { client } = fakeClient({
      signOut: () => { throw new TypeError('Failed to fetch'); },
      getSession: () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    });
    expect(await signOut(client)).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });
});
