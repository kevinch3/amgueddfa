// What the published data looks like, in three numbers per table: how many rows
// and the latest change. The export writes it to data/approved/stamp.json; the
// export workflow's 15-minute check compares a fresh one with the committed one
// and only runs the export (and the deploy after it) when they differ.
//
//   node scripts/export_stamp.mjs                      print the stamp
//   node scripts/export_stamp.mjs --check FILE         print changed=true|false
//
// Reads PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
// No dependencies (plain fetch against PostgREST), so CI runs it before `npm ci`.
// Changes that bump neither count nor time (an approved row edited in place)
// wait for the weekly full export.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** [table, timestamp column] */
export const STAMP_TABLES = [
  ['public_contributions', 'reviewed_at'],
  ['editions', 'updated_at'],
  ['transcriptions', 'updated_at'],
];

/** One table: {count, latest}; null when the table does not exist (yet). */
async function tableStamp(base, key, table, col, fetchImpl) {
  const res = await fetchImpl(`${base}/rest/v1/${table}?select=${col}&order=${col}.desc.nullslast&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stamp: ${table}: HTTP ${res.status}`);
  const rows = await res.json();
  const count = Number((res.headers.get('content-range') ?? '').split('/')[1]);
  return { count: Number.isFinite(count) ? count : rows.length, latest: rows[0]?.[col] ?? null };
}

export async function stamp(base, key, fetchImpl = fetch) {
  const out = {};
  for (const [table, col] of STAMP_TABLES) out[table] = await tableStamp(base, key, table, col, fetchImpl);
  return out;
}

export const stampJson = (s) => JSON.stringify(s, null, 2) + '\n';

async function main() {
  const base = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) {
    console.error('stamp: set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const now = stampJson(await stamp(base, key));
  const i = process.argv.indexOf('--check');
  if (i < 0) {
    process.stdout.write(now);
    return;
  }
  let old = '';
  try {
    old = readFileSync(process.argv[i + 1], 'utf8');
  } catch {}
  console.log(`changed=${old !== now}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
