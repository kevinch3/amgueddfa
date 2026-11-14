import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './supabase';

export type LiveResult<T> = { data: T; offline: boolean };

/**
 * Run a Supabase read and never throw. On a missing client, a network error, a
 * query error or a timeout, it resolves to `{ data: fallback, offline: true }`
 * so islands can show t('estado.sin_conexion') while static content stays.
 */
export async function liveQuery<T>(
  fn: (c: SupabaseClient) => PromiseLike<{ data: T | null; error: unknown }>,
  fallback: T,
  timeoutMs = 6000,
  client: SupabaseClient | null = getClient(),
): Promise<LiveResult<T>> {
  const offline: LiveResult<T> = { data: fallback, offline: true };
  if (!client) return offline;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const res = await Promise.race([Promise.resolve().then(() => fn(client)), timeout]);
    if (res === 'timeout' || !res || res.error) return offline;
    return { data: res.data ?? fallback, offline: false };
  } catch {
    return offline;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Select `base` plus `extra` columns; if the database does not have the extra
 * ones yet (PostgREST 42703, undefined column), select `base` alone. Lets the
 * site ship before a migration that adds columns reaches production.
 */
export async function withOptionalCols<T>(
  run: (cols: string) => PromiseLike<{ data: T | null; error: unknown }>,
  base: string,
  extra: string,
): Promise<{ data: T | null; error: unknown }> {
  const res = await run(`${base}, ${extra}`);
  return (res.error as { code?: string } | null)?.code === '42703' ? run(base) : res;
}
