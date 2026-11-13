// Export approved contributions and edition states to data/approved/*.json.
//
// Run locally:  node --env-file=.env scripts/export_approved.mjs
// In CI it runs from .github/workflows/export.yml.
// Reads PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
// The output is stable (rows sorted, keys sorted) so a re-run with no news writes
// identical bytes and the workflow commits nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAGE = 1000; // supabase max_rows
const CONTRIB_KEYS = ['id', 'type', 'festival', 'year', 'item_id', 'payload', 'created_at', 'reviewed_at', 'display_name'];
const EDITION_KEYS = ['festival', 'year', 'status', 'note'];
// Never published, at any depth, even if a view or payload ever carried them.
const PRIVATE_KEYS = new Set(['user_id', 'email', 'storage_path', 'reviewed_by']);

/** Recursively drop private keys and sort object keys so the JSON is byte-stable. */
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (!PRIVATE_KEYS.has(k)) out[k] = clean(v[k]);
    return out;
  }
  return v;
}

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Rows of public_contributions -> whitelisted fields, sorted by id. */
export function shapeContributions(rows) {
  return rows
    .map((r) => ({ ...pick(r, CONTRIB_KEYS), payload: clean(r.payload ?? {}) }))
    .sort((a, b) => cmp(a.id, b.id));
}

/** Rows of editions -> {festival, year, status, note}, sorted by festival then year. */
export function shapeEditions(rows) {
  return rows.map((r) => pick(r, EDITION_KEYS)).sort((a, b) => cmp(a.festival, b.festival) || a.year - b.year);
}

async function fetchAll(client, table, columns, orderBy) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(columns);
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`export: ${table}: ${error.message ?? error}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

const json = (v) => JSON.stringify(v, null, 2) + '\n';

/** Fetch both tables, then write both files; nothing is written if either query fails. */
export async function exportApproved(client, outDir) {
  const contributions = shapeContributions(
    await fetchAll(client, 'public_contributions', CONTRIB_KEYS.join(', '), ['id']),
  );
  const editions = shapeEditions(await fetchAll(client, 'editions', EDITION_KEYS.join(', '), ['festival', 'year']));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'contributions.json'), json(contributions));
  writeFileSync(join(outDir, 'editions.json'), json(editions));
  return { contributions: contributions.length, editions: editions.length };
}

async function main() {
  const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('export: set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'approved');
  const n = await exportApproved(client, outDir);
  console.log(`export: ${n.contributions} contributions, ${n.editions} editions -> data/approved/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
