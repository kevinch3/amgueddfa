// Size budget of the built site (docs/reglas.md, rule 6). Run after the build:
//   node scripts/presupuesto.mjs          # prints size and file count per top-level folder
// tests-js/build.test.ts fails the build when the totals pass LIMITS.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** GitHub Pages serves at most 1 GB; these leave room to see a problem coming. */
// Cloudflare Pages takes at most 20,000 files, so staying under it keeps that host open.
// 2026-11-27: 149 MB and 13,321 files once deep pages were built once (345 MB and 30,470 before).
export const LIMITS = { bytes: 700 * 1024 * 1024, files: 20000 };

function walk(dir) {
  let bytes = 0;
  let files = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = walk(p);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      bytes += st.size;
      files += 1;
    }
  }
  return { bytes, files };
}

/** Totals and per top-level folder (files at the root grouped as "."). */
export function measure(dist) {
  const parts = new Map();
  for (const name of readdirSync(dist)) {
    const p = join(dist, name);
    const m = statSync(p).isDirectory() ? walk(p) : { bytes: statSync(p).size, files: 1 };
    const key = statSync(p).isDirectory() ? name : '.';
    const prev = parts.get(key) ?? { bytes: 0, files: 0 };
    parts.set(key, { bytes: prev.bytes + m.bytes, files: prev.files + m.files });
  }
  const total = [...parts.values()].reduce((a, b) => ({ bytes: a.bytes + b.bytes, files: a.files + b.files }), { bytes: 0, files: 0 });
  return { total, parts };
}

const mb = (b) => (b / 1024 / 1024).toFixed(1).padStart(7);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const { total, parts } = measure(dist);
  for (const [name, m] of [...parts].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`${mb(m.bytes)} MB ${String(m.files).padStart(7)} files  ${name}`);
  }
  console.log(`${mb(total.bytes)} MB ${String(total.files).padStart(7)} files  total (limits ${LIMITS.bytes / 1024 / 1024} MB, ${LIMITS.files} files)`);
  // Rights codes of the public documents (lib/derechos.ts), and how many rely on their collection's default.
  const docs = join(dist, 'eisteddfod', 'datos', 'documentos.json');
  if (existsSync(docs)) {
    const count = {};
    for (const d of JSON.parse(readFileSync(docs, 'utf8')).documentos) {
      const k = `${d.licencia}${d.licencia_origen === 'coleccion' ? ' (collection default)' : ''}`;
      count[k] = (count[k] ?? 0) + 1;
    }
    console.log('rights: ' + Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', '));
  }
}
