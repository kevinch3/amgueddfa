import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Env = { PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

/** Build a client from env values, or null when either value is missing. */
export function clientFromEnv(env: Env): SupabaseClient | null {
  const url = env.PUBLIC_SUPABASE_URL?.trim();
  const key = env.PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      // PKCE + detectSessionInUrl: the email link (Supabase's default templates)
      // returns to /ingresar/?code=… and the client exchanges it on start.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  } catch {
    return null; // malformed URL: behave as offline rather than break the page
  }
}

let cached: SupabaseClient | null | undefined;

/** The shared browser client; null when PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are unset. */
export function getClient(): SupabaseClient | null {
  if (cached === undefined) {
    const env = (import.meta.env ?? {}) as Env;
    cached = clientFromEnv({
      PUBLIC_SUPABASE_URL: env.PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY: env.PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return cached;
}
