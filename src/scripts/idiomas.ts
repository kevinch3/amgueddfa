// Language links go to the same page in the other language. The build only knows
// the path, so carry the query (perfil?u=…, contribuir?f=…&y=…) and the hash over,
// and use the address bar's path: on a 404 it is the page that was asked for.
import { alternates } from '../lib/paths';
import { LANG_PARAM } from '../lib/pagina-unica';

// A deep page's alternates carry ?l=xx (lib/pagina-unica.ts): keep the page's other parameters, not its own l.
const hrefs = new Map(alternates(location.pathname).map((a) => [a.locale as string, a.href]));
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-idioma]')) {
  const href = hrefs.get(a.dataset.idioma ?? '');
  if (!href) continue;
  const u = new URL(href, location.origin);
  for (const [k, v] of new URLSearchParams(location.search)) if (k !== LANG_PARAM && !u.searchParams.has(k)) u.searchParams.append(k, v);
  u.hash = location.hash;
  a.href = `${u.pathname}${u.search}${u.hash}`;
}

// Header fold-outs (language, reading settings): one open at a time; they fold back
// when you click or tab away, or press Escape.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')];
for (const menu of menus) {
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    for (const other of menus) if (other !== menu) other.open = false;
    // The panel hangs from the button's right edge; where that would push it off
    // screen (the header wraps on phones), slide it so it stays fully in view.
    const panel = menu.querySelector<HTMLElement>(':scope > ul, :scope > .menu-panel');
    if (!panel) return;
    panel.style.left = '';
    panel.style.right = '';
    const box = menu.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    const vw = document.documentElement.clientWidth;
    // From the button's right edge; else from its left edge; else as far in view as it fits.
    let left = box.right - width;
    if (left < 8) left = box.left;
    left = Math.min(Math.max(8, left), vw - 8 - width);
    if (Math.abs(left - (box.right - width)) > 0.5) {
      panel.style.left = `${left - box.left}px`;
      panel.style.right = 'auto';
    }
  });
  // Focus moving to something else (Tab); a click on the panel's own padding moves it nowhere.
  menu.addEventListener('focusout', (ev) => {
    const to = ev.relatedTarget as Node | null;
    if (menu.open && to && !menu.contains(to)) menu.open = false;
  });
  menu.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}
document.addEventListener('click', (ev) => {
  for (const menu of menus) if (menu.open && !menu.contains(ev.target as Node)) menu.open = false;
});
