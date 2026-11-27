// Old addresses keep working after the Eisteddfod archive moved to /eisteddfod/ (#189).
// GitHub Pages cannot send a 301, so after `astro build` this writes, at every old
// address of a built archive page, a tiny page that forwards to the new one (keeping
// ?query and #hash) and names it as canonical. Files a browser cannot be forwarded
// from (open data JSON, Markdown twins) are copied to their old address instead, to
// be dropped after the deprecation period (2027-06). Never overwrites a real page.
//
//   node scripts/redirect_stubs.mjs [dist] [site]
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const SITE = (process.argv[3] ?? 'https://amgueddfa.org').replace(/\/+$/, '');
const COLLECTION = 'eisteddfod';
const LOCALES = ['cy', 'en', 'zh', 'it', 'fr', 'sv'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function stub(to, lang) {
  const href = esc(to);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Amgueddfa</title>
<link rel="canonical" href="${esc(SITE + to)}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0;url=${href}">
</head>
<body><p><a href="${href}">${href}</a></p></body>
</html>
`;
}

/** Old path of a file under …/eisteddfod/…, as a dist-relative path, or null for the collection home. */
export function oldPath(rel) {
  const parts = rel.split(sep);
  const i = parts[0] === COLLECTION ? 0 : LOCALES.includes(parts[0]) && parts[1] === COLLECTION ? 1 : -1;
  if (i < 0) return null;
  const rest = parts.slice(i + 1);
  // The collection home moved off the root, which is now the museum's front door.
  if (rest.length === 1 && rest[0] === 'index.html') return null;
  return [...parts.slice(0, i), ...rest].join(sep);
}

let stubs = 0;
let copies = 0;
const roots = [join(DIST, COLLECTION), ...LOCALES.map((l) => join(DIST, l, COLLECTION))].filter(existsSync);
for (const root of roots) {
  for (const file of walk(root)) {
    const rel = relative(DIST, file);
    const old = oldPath(rel);
    if (!old) continue;
    const dest = join(DIST, old);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    if (file.endsWith('.html')) {
      const to = `/${rel.split(sep).join('/').replace(/index\.html$/, '')}`;
      const first = rel.split(sep)[0];
      const lang = first === 'zh' ? 'zh-Hans' : LOCALES.includes(first) ? first : 'es';
      writeFileSync(dest, stub(to, lang));
      stubs++;
    } else {
      copyFileSync(file, dest);
      copies++;
    }
  }
}
console.log(`redirect_stubs: ${stubs} forwarding pages, ${copies} files copied to their old address`);
