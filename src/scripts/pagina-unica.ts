// A deep page (one document, one source) is built once, in Spanish (docs/reglas.md, rule 4).
// When Base's head script found another language for this visitor (?l=xx, or the last
// page they read), swap the page's labels from the dictionary the build wrote
// (scripts/paginas_unicas.mjs), following the rules in lib/pagina-unica.ts; the build
// checked that these rules turn this page into its translated render, page by page.
import { LOCALES, LOCALE_INFO, isLocale } from '../lib/i18n';
import { DICT_DIR, LABEL_ATTRS, localizeHref, translateText, type Dict } from '../lib/pagina-unica';

const root = document.documentElement;
const lang = root.dataset.idioma;

/** Archive or community content (inside an element with its own language), left as written. */
function isContent(el: Element): boolean {
  const marked = el.closest('[lang]');
  return marked !== null && marked !== root;
}

function apply(dict: Dict, l: string, base: string): void {
  const texts = new Map<string, number>();
  const labels = new Map<string, number>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || parent.closest('script, style') || isContent(parent)) continue;
    const v = translateText(n.nodeValue ?? '', dict, texts);
    if (v !== null) n.nodeValue = v;
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (isContent(el)) continue;
    for (const a of LABEL_ATTRS) {
      const old = el.getAttribute(a);
      const v = old === null ? null : translateText(old, dict, labels);
      if (v !== null) el.setAttribute(a, v);
    }
  }
  const title = translateText(document.title, dict, new Map());
  if (title !== null) document.title = title;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]:not([data-idioma])')) {
    a.setAttribute('href', localizeHref(a.getAttribute('href')!, l, base, LOCALES));
  }
  for (const p of document.querySelectorAll<HTMLElement>('[data-solo-traducida]')) p.hidden = false;
  for (const s of document.querySelectorAll<HTMLElement>('[data-idioma-actual]')) {
    s.lang = LOCALE_INFO[l as keyof typeof LOCALE_INFO].tag;
    s.textContent = LOCALE_INFO[l as keyof typeof LOCALE_INFO].name;
  }
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-idioma]')) {
    if (a.dataset.idioma === l) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}

if (lang && isLocale(lang)) {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/${DICT_DIR}/${lang}.json`);
    if (res.ok) apply(await res.json(), lang, base);
  } catch {
    // Offline or blocked: the page stays in Spanish, still whole.
  } finally {
    root.classList.remove('traduciendo');
  }
}
