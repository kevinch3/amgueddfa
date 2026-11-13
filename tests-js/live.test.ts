import { describe, expect, it } from 'vitest';
import { liveQuery } from '../src/lib/live';
import { clientFromEnv } from '../src/lib/supabase';

const fake = {} as any;

describe('liveQuery (Review Focus 2: Supabase paused or unreachable)', () => {
  it('returns fallback+offline on network error', async () => {
    const r = await liveQuery(() => Promise.reject(new TypeError('Failed to fetch')), ['fb'], 6000, fake);
    expect(r).toEqual({ data: ['fb'], offline: true });
  });

  it('returns fallback+offline when the query reports an error', async () => {
    const r = await liveQuery(async () => ({ data: null, error: { message: 'paused' } }), 0, 6000, fake);
    expect(r).toEqual({ data: 0, offline: true });
  });

  it('returns fallback+offline on timeout', async () => {
    const t0 = Date.now();
    const r = await liveQuery(() => new Promise(() => {}), [] as string[], 50, fake);
    expect(r).toEqual({ data: [], offline: true });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('returns fallback+offline when fn throws synchronously', async () => {
    const r = await liveQuery(() => { throw new Error('boom'); }, 'x', 6000, fake);
    expect(r).toEqual({ data: 'x', offline: true });
  });

  it('returns fallback+offline without calling fn when there is no client', async () => {
    let called = false;
    const r = await liveQuery(async () => { called = true; return { data: 1, error: null }; }, 0, 6000, null);
    expect(r).toEqual({ data: 0, offline: true });
    expect(called).toBe(false);
  });

  it('returns live data when the query succeeds', async () => {
    const r = await liveQuery(async () => ({ data: [1, 2], error: null }), [] as number[], 6000, fake);
    expect(r).toEqual({ data: [1, 2], offline: false });
  });
});

describe('getClient', () => {
  it('is null when the env vars are missing', () => {
    expect(clientFromEnv({})).toBeNull();
    expect(clientFromEnv({ PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(clientFromEnv({ PUBLIC_SUPABASE_ANON_KEY: 'k' })).toBeNull();
  });

  it('builds a client when both are set', () => {
    const c = clientFromEnv({ PUBLIC_SUPABASE_URL: 'https://x.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'k' });
    expect(c).not.toBeNull();
    expect(typeof c!.from).toBe('function');
  });
});
