// One lightbox for every image on the site.
//
// Markup: <a href="{full image}" data-lb="{group}"><img …></a>. Without JS the link
// opens the image; with JS a click opens it here, with every other link of the same
// group (in document order, one per distinct href) as prev/next. A container marked
// data-lb-hash keeps the open page in the URL (#p3) so a page can be linked to.
// Clicks are delegated from the document, so DOM rendered later works too.
import { t } from '../lib/i18n';

/** 0-based page index from "#p3" (1-based in the URL), or null if absent or out of range. */
export function parsePageHash(hash: string, total: number): number | null {
  const m = /^#p([1-9]\d{0,3})$/.exec(hash ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n <= total ? n - 1 : null;
}

/** Keep an index inside 0…total-1. */
export function clamp(i: number, total: number): number {
  return Math.max(0, Math.min(total - 1, i));
}

type Member = { anchor: HTMLAnchorElement; href: string; alt: string };

const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

/** The group's images in document order, one per distinct href (a thumb and its "1" link are one page). */
function membersOf(group: string): Member[] {
  const seen = new Map<string, Member>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>(`a[data-lb="${esc(group)}"]`)) {
    const href = a.href;
    const alt = a.dataset.lbAlt || a.querySelector('img')?.alt || '';
    const prev = seen.get(href);
    if (!prev) seen.set(href, { anchor: a, href, alt });
    else if (!prev.alt && alt) prev.alt = alt;
  }
  return [...seen.values()];
}

type Box = {
  dlg: HTMLDialogElement;
  stage: HTMLElement;
  big: HTMLImageElement;
  count: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  zoom: HTMLButtonElement;
};

let box: Box | null = null;
let members: Member[] = [];
let cur = 0;
let opener: HTMLElement | null = null;
let useHash = false;

function button(cls: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `lb-btn ${cls}`;
  b.textContent = text;
  return b;
}

function setZoom(on: boolean): void {
  if (!box) return;
  box.stage.classList.toggle('zoomed', on);
  box.zoom.setAttribute('aria-pressed', String(on));
  box.zoom.textContent = on ? t('item.ver_entera') : t('item.ver_grande');
  box.stage.scrollTo(0, 0);
}

function preload(i: number): void {
  const m = members[i];
  if (m) new Image().src = m.href;
}

function build(): Box {
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', t('item.visor'));

  const bar = document.createElement('div');
  bar.className = 'lb-bar';
  const count = document.createElement('span');
  count.className = 'lb-count';
  count.setAttribute('aria-live', 'polite');
  const tools = document.createElement('span');
  tools.className = 'lb-tools';
  const zoom = button('lb-zoom', t('item.ver_grande'));
  zoom.setAttribute('aria-pressed', 'false');
  const close = button('lb-close', t('item.cerrar'));
  tools.append(zoom, close);
  bar.append(count, tools);

  const stage = document.createElement('div');
  stage.className = 'lb-stage';
  const big = document.createElement('img');
  big.alt = '';
  stage.append(big);

  const nav = document.createElement('div');
  nav.className = 'lb-nav';
  const prev = button('lb-prev', t('item.pag_anterior'));
  const next = button('lb-next', t('item.pag_siguiente'));
  nav.append(prev, next);

  dlg.append(bar, stage, nav);
  document.body.append(dlg);

  const toggle = () => setZoom(!stage.classList.contains('zoomed'));
  zoom.addEventListener('click', toggle);
  big.addEventListener('click', toggle);
  close.addEventListener('click', () => dlg.close());
  prev.addEventListener('click', () => show(cur - 1));
  next.addEventListener('click', () => show(cur + 1));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'ArrowRight') show(cur + 1);
  });
  dlg.addEventListener('close', () => {
    if (useHash) history.replaceState(history.state, '', location.pathname + location.search);
    const back = members[cur]?.anchor;
    if (back?.isConnected) {
      back.scrollIntoView({ block: 'nearest' });
      back.focus();
    } else opener?.focus();
    big.removeAttribute('src');
  });

  // Swipe: a mostly horizontal single-finger move of 50 px or more turns the page.
  let x0 = 0;
  let y0 = 0;
  let multi = false;
  stage.addEventListener('touchstart', (e) => {
    multi = e.touches.length > 1;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (multi || stage.classList.contains('zoomed') || (window.visualViewport && window.visualViewport.scale > 1.05)) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(cur + (dx < 0 ? 1 : -1));
  });

  return { dlg, stage, big, count, prev, next, zoom };
}

function show(i: number): void {
  if (!box || !members.length) return;
  cur = clamp(i, members.length);
  const m = members[cur];
  const total = members.length;
  setZoom(false);
  box.big.src = m.href;
  box.big.alt = m.alt;
  box.count.textContent = total > 1 ? t('item.pagina', { n: cur + 1, total }) : '';
  box.prev.disabled = cur === 0;
  box.next.disabled = cur === total - 1;
  box.prev.hidden = box.next.hidden = total < 2;
  if (useHash) history.replaceState(history.state, '', `${location.pathname}${location.search}#p${cur + 1}`);
  preload(cur + 1);
  preload(cur - 1);
}

/** Open the lightbox on `a`'s group, at `a`'s image (or at `index`). */
export function openLightbox(a: HTMLAnchorElement, index?: number): void {
  const group = a.dataset.lb;
  if (!group) return;
  members = membersOf(group);
  if (!members.length) return;
  box ??= build();
  opener = a;
  useHash = Boolean(a.closest('[data-lb-hash]'));
  const at = index ?? members.findIndex((m) => m.href === a.href);
  show(at < 0 ? 0 : at);
  if (!box.dlg.open) box.dlg.showModal();
}

function onClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-lb]');
  if (!a || !a.href) return;
  e.preventDefault();
  openLightbox(a);
}

/** A "#p3" in the URL opens the first linkable group at that page. */
function openFromHash(): void {
  const first = document.querySelector<HTMLAnchorElement>('[data-lb-hash] a[data-lb]');
  if (!first?.dataset.lb) return;
  const i = parsePageHash(location.hash, membersOf(first.dataset.lb).length);
  if (i !== null) openLightbox(first, i);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', onClick);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openFromHash, { once: true });
  else openFromHash();
}
