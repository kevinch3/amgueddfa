// Deep pages built once (docs/reglas.md, rule 4; src/lib/pagina-unica.ts). Runs after
// `astro build`, which still renders every page in all 7 languages:
//
//   1. for each language, learn the label dictionary (Spanish text → translated text)
//      from the Spanish and translated renders of every deep page;
//   2. check, page by page, that the browser's rules (translateHtml below, the same as
//      src/scripts/pagina-unica.ts) turn the Spanish page into the translated render;
//      any difference fails the build;
//   3. write dist/i18n-paginas/<lang>.json and delete the translated copies.
//
// Old translated addresses (/cy/eisteddfod/item/x/) are forwarded by the 404 page.
//
//   node scripts/paginas_unicas.mjs [dist]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEEP_PREFIXES, DICT_DIR, LABEL_ATTRS, decodeEntities, localizeHref, translateText } from '../src/lib/pagina-unica.ts';

export const LANGS = ['cy', 'en', 'zh', 'it', 'fr', 'sv'];
const TAGS = { es: 'es-AR', cy: 'cy-AR', en: 'en-GB', zh: 'zh-Hans', it: 'it', fr: 'fr', sv: 'sv' };
const NAMES = { es: 'Español', cy: 'Cymraeg', en: 'English', zh: '简体中文', it: 'Italiano', fr: 'Français', sv: 'Svenska' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', '!doctype']);

/** Tags, comments, whole script/style elements, and text between them. */
export const tokens = (html) => html.match(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>|[^<]+/g) ?? [];
const tagName = (t) => (t.match(/^<\/?([a-zA-Z0-9!-]+)/)?.[1] ?? '').toLowerCase();
const isText = (t) => t[0] !== '<';
const isRaw = (t) => t.startsWith('<script') || t.startsWith('<style') || t.startsWith('<!--');
const attrRe = /\s([^\s=/>]+)(?:="([^"]*)")?/g;
const attrs = (t) => [...t.slice(1 + tagName(t).length).matchAll(attrRe)].map((m) => [m[1], m[2] ?? null]);
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Walk a page's tokens, telling for each whether it sits in content (inside an element
 * with its own lang other than <html>, or the language menu's current name) or in body.
 */
function* walk(toks) {
  const stack = [];
  let inBody = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const content = stack.some((s) => s.content);
    if (isText(t) || isRaw(t)) {
      yield { i, t, content, inBody, open: null };
      continue;
    }
    const name = tagName(t);
    if (t.startsWith('</')) {
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      yield { i, t, content, inBody, open: null };
      continue;
    }
    const a = attrs(t);
    const self = name !== 'html' && a.some(([k]) => k === 'lang' || k === 'data-idioma-actual');
    if (name === 'body') inBody = true;
    yield { i, t, content: content || self, inBody, open: { name, attrs: a } };
    if (!VOID.has(name) && !t.endsWith('/>')) stack.push({ name, content: self });
  }
}

/** The Spanish page as a visitor in `lang` gets it, by the browser's rules (src/scripts/pagina-unica.ts). */
export function translateHtml(html, dict, lang) {
  const toks = tokens(html);
  const out = [];
  let inTitle = false;
  const texts = new Map();
  const labels = new Map();
  const titles = new Map();
  for (const w of walk(toks)) {
    const { t, content, inBody, open } = w;
    if (isRaw(t)) out.push(t);
    else if (isText(t)) {
      const v = !content && (inBody || inTitle) ? translateText(decodeEntities(t), dict, inTitle ? titles : texts) : null;
      out.push(v === null ? t : escText(v));
    } else if (!open) {
      if (tagName(t) === 'title') inTitle = false;
      out.push(t);
    } else {
      if (open.name === 'title') inTitle = true;
      if (open.name === 'html') {
        out.push(t.replace(/\slang="[^"]*"/, ` lang="${TAGS[lang]}"`).replace(/>$/, ` data-idioma="${lang}">`));
        continue;
      }
      if (!inBody) {
        out.push(t);
        continue;
      }
      // Change attributes in place, so the tag keeps the build's own writing.
      const a = Object.fromEntries(open.attrs);
      let tag = t;
      const put = (k, v) => {
        const re = new RegExp(`\\s${k}="[^"]*"`);
        tag = re.test(tag) ? tag.replace(re, ` ${k}="${escAttr(v)}"`) : tag.replace(/\s*\/?>$/, (end) => ` ${k}="${escAttr(v)}"${end}`);
      };
      const drop = (k) => {
        tag = tag.replace(new RegExp(`\\s${k}(="[^"]*")?(?=[\\s/>])`), '');
      };
      if (!content) for (const k of LABEL_ATTRS) {
        const tr = a[k] == null ? null : translateText(decodeEntities(a[k]), dict, labels);
        if (tr !== null) put(k, tr);
      }
      if (open.name === 'a' && a.href != null && !('data-idioma' in a)) {
        const h = localizeHref(decodeEntities(a.href), lang, '', LANGS);
        if (h !== decodeEntities(a.href)) put('href', h);
      }
      if ('data-solo-traducida' in a) drop('hidden');
      if ('data-idioma-actual' in a) put('lang', TAGS[lang]);
      if (open.name === 'a' && 'data-idioma' in a) {
        if (a['data-idioma'] === lang) put('aria-current', 'true');
        else drop('aria-current');
      }
      out.push(tag);
    }
  }
  // The language menu's current name, inside a [data-idioma-actual] span.
  return out.join('').replace(/(<span [^>]*data-idioma-actual[^>]*>)[^<]*(<\/span>)/g, `$1${NAMES[lang]}$2`);
}

/**
 * Learn one language's dictionary from aligned Spanish and translated renders. Each
 * Spanish label's translations are kept in page order per channel (text, label
 * attributes, title): one translation everywhere gives a string; several give a list
 * by position, which every page must agree on.
 */
function learn(pairs) {
  const seqs = new Map(); // key → list of per-page sequences [{channel, values}]
  const problems = [];
  for (const { page, es, loc } of pairs) {
    const a = tokens(es);
    const b = tokens(loc);
    if (a.length !== b.length) {
      problems.push(`${page}: ${a.length} vs ${b.length} pieces`);
      continue;
    }
    const mine = new Map();
    const add = (channel, k, v) => {
      k = decodeEntities(k);
      v = decodeEntities(v);
      const pad = (s) => s.match(/^\s*/)[0] + '|' + s.match(/\s*$/)[0];
      // Same spacing: keyed by the label alone; different spacing: the whole text, as is.
      if (pad(k) === pad(v)) {
        k = k.trim();
        v = v.trim();
      }
      if (!k.trim()) return;
      const id = `${channel}\u0000${k}`;
      if (!mine.has(id)) mine.set(id, []);
      mine.get(id).push(v);
    };
    let inTitle = false;
    for (const w of walk(a)) {
      const { i, t, content, inBody, open } = w;
      if (!isText(t) && !isRaw(t) && tagName(t) !== tagName(b[i])) {
        problems.push(`${page}: <${tagName(t)}> vs <${tagName(b[i])}> at ${i}`);
        break;
      }
      if (open?.name === 'title') inTitle = true;
      else if (!open && !isText(t) && tagName(t) === 'title') inTitle = false;
      if (content || isRaw(t)) continue;
      if (isText(t) && (inBody || inTitle)) add(inTitle ? 'title' : 'text', t, b[i]);
      else if (open && inBody) {
        const bb = Object.fromEntries(attrs(b[i]));
        for (const k of LABEL_ATTRS) {
          const v = open.attrs.find(([n]) => n === k)?.[1];
          if (v != null && bb[k] != null) add('attr', v, bb[k]);
        }
      }
    }
    for (const [id, values] of mine) {
      const k = id.split('\u0000')[1];
      if (!seqs.has(k)) seqs.set(k, []);
      seqs.get(k).push({ page, channel: id.split('\u0000')[0], values });
    }
  }
  const dict = {};
  const ambiguous = [];
  for (const [k, list] of seqs) {
    const all = new Set(list.flatMap((s) => s.values));
    if (![...all].some((v) => v !== k)) continue; // never translated: not a label
    if (all.size === 1) {
      dict[k] = [...all][0];
      continue;
    }
    // By position: the same nth translation on every page (counted per channel, as the browser does).
    const byPos = [];
    let bad = null;
    for (const s of list) {
      s.values.forEach((v, n) => {
        if (byPos[n] === undefined) byPos[n] = v;
        else if (byPos[n] !== v && !bad) bad = `${JSON.stringify(k)}: #${n + 1} is ${JSON.stringify(byPos[n])} and ${JSON.stringify(v)} (${s.page})`;
      });
    }
    const channels = new Set(list.map((s) => s.channel));
    if (channels.size > 1 && !bad) bad = `${JSON.stringify(k)}: translated several ways, in ${[...channels].join(' and ')}`;
    if (bad) ambiguous.push(bad);
    dict[k] = byPos;
  }
  return { dict, ambiguous, problems };
}

/** Body and <title> only: the head (alternates, canonical, meta) is the Spanish page's by design. */
const comparable = (html) => {
  const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '';
  const body = html.slice(html.indexOf('<body'));
  // Search-index markup (Pagefind reads the Spanish page only) is not part of what a visitor reads.
  return decodeEntities(`${title}${body}`.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<meta data-pagefind-[^>]*>/g, '').replace(/ data-pagefind-body(="")?/g, ''));
};

export function deepPages(dist) {
  const out = [];
  for (const prefix of DEEP_PREFIXES) {
    const dir = join(dist, prefix);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) if (existsSync(join(dir, name, 'index.html'))) out.push(`${prefix}${name}/`);
  }
  return out;
}

/** Read one language's dictionary as the build wrote it. */
export function readDict(dist, lang) {
  return JSON.parse(readFileSync(join(dist, DICT_DIR, `${lang}.json`), 'utf8'));
}

function main(dist) {
  const pages = deepPages(dist);
  mkdirSync(join(dist, DICT_DIR), { recursive: true });
  let failed = 0;
  for (const lang of LANGS) {
    const pairs = pages
      .filter((p) => existsSync(join(dist, lang, p, 'index.html')))
      .map((p) => ({ page: p, es: readFileSync(join(dist, p, 'index.html'), 'utf8'), loc: readFileSync(join(dist, lang, p, 'index.html'), 'utf8') }));
    const { dict, ambiguous, problems } = learn(pairs);
    const wrong = [];
    for (const { page, es, loc } of pairs) {
      const got = comparable(translateHtml(es, dict, lang));
      const want = comparable(loc);
      if (got !== want) {
        let at = 0;
        while (at < got.length && got[at] === want[at]) at++;
        wrong.push(`${page}\n    got:  ${got.slice(Math.max(0, at - 60), at + 80)}\n    want: ${want.slice(Math.max(0, at - 60), at + 80)}`);
      }
    }
    writeFileSync(join(dist, DICT_DIR, `${lang}.json`), JSON.stringify(dict));
    console.log(`paginas_unicas: ${lang}: ${pairs.length} pages, ${Object.keys(dict).length} labels, ${ambiguous.length} ambiguous, ${problems.length} misaligned, ${wrong.length} not reproduced`);
    for (const x of [...problems, ...ambiguous, ...wrong].slice(0, 8)) console.log(`  ${x}`);
    if (problems.length || wrong.length) failed++;
  }
  if (failed) {
    console.error('paginas_unicas: the label swap does not reproduce every translated page; translated copies kept');
    process.exit(1);
  }
  let removed = 0;
  for (const lang of LANGS) {
    for (const p of pages) {
      const dir = join(dist, lang, p);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
        removed++;
      }
    }
  }
  console.log(`paginas_unicas: ${pages.length} deep pages built once; ${removed} translated copies removed`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? 'dist');
