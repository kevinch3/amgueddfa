// One-time seed of the transcriptions table from the committed snapshot
// (src/data/transcripciones, src/data/ganadores). Documents already in the table
// are left alone, so a re-run never overwrites an edit made on the site.
//
//   node --env-file=.env scripts/seed_transcriptions.mjs [--dry-run]
//   node --env-file=.env scripts/seed_transcriptions.mjs --private ../.transcripciones/ganadores
//
// --private DIR also loads that folder's winners lists as private (public =
// false: readable by admins only). Lists of Mimosa and Juventud name children;
// whether to keep them in the database at all is the archive's decision, so
// they are only loaded when asked.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Same reading as src/lib/docmd.ts readDoc. */
export function readDoc(id, raw) {
  const m = raw.match(FRONT);
  if (!m) return { id, items: [id], text: raw };
  const line = m[1].split(/\r?\n/).find((l) => /^items:/.test(l.trim())) ?? '';
  const listed = line.replace(/^\s*items:/, '').split(/[\s,]+/).filter(Boolean);
  return { id, items: [id, ...listed.filter((x) => x !== id)], text: raw.slice(m[0].length) };
}

/** Rows for one folder: {id, items, kind, festival, text, public}. */
export function rowsFrom(dir, kind, isPublic, festivalOf) {
  return readdirSync(dir)
    .filter((f) => /^[0-9a-f]{12}\.md$/.test(f))
    .sort()
    .map((f) => {
      const d = readDoc(f.slice(0, -3), readFileSync(join(dir, f), 'utf8'));
      return { ...d, kind, coleccion: festivalOf(d.id), public: isPublic };
    });
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const pi = args.indexOf('--private');
  const catalog = JSON.parse(readFileSync(join(REPO, 'src', 'data', 'catalog.json'), 'utf8')).items;
  const fest = new Map(catalog.map((i) => [i.id, i.coleccion]));
  const festivalOf = (id) => fest.get(id) ?? null;
  const rows = [
    ...rowsFrom(join(REPO, 'src', 'data', 'transcripciones'), 'programa', true, festivalOf),
    ...rowsFrom(join(REPO, 'src', 'data', 'ganadores'), 'ganadores', true, festivalOf),
  ];
  if (pi >= 0) {
    const have = new Set(rows.map((r) => r.id));
    rows.push(...rowsFrom(args[pi + 1], 'ganadores', false, festivalOf).filter((r) => !have.has(r.id)));
  }
  console.log(`seed: ${rows.length} documents (${rows.filter((r) => !r.public).length} private)`);
  if (dry) return;
  const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('seed: set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('transcriptions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`seed: ${error.message}`);
  console.log(`seed: ${data.length} inserted, ${rows.length - data.length} already there`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
