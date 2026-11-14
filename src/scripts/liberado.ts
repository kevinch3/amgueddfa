import { restrictedPreview } from '../lib/admin';
import { currentProfile } from '../lib/auth';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { fetchReleasedText, releasedSource } from '../lib/released';
import { getClient } from '../lib/supabase';

/** File names listed in data-pages ("p01.webp p02.webp"); anything else is ignored. */
export function pageFiles(raw: string | undefined): string[] {
  return (raw ?? '').split(/\s+/).filter((f) => /^p\d{2,}\.webp$/.test(f));
}

/** Show a released restricted item from the public `media` bucket: its pages, or its text. */
export async function renderReleased(root: HTMLElement, id: string, files: string[], publicUrl: (path: string) => string, title: string): Promise<void> {
  const src = releasedSource(id, files, publicUrl);
  if (src.kind === 'pages') {
    root.closest('.restricted')?.classList.add('is-liberado');
    renderPages(root, src.urls, title, t('item.liberado'));
    return;
  }
  const text = await fetchReleasedText(src.url);
  if (text === null) return; // not there (yet): the static placeholder stays
  root.closest('.restricted')?.classList.add('is-liberado');
  renderText(root, text, t('item.liberado'));
}

/** Plain text with a note above it (textContent only, never parsed as HTML). */
function renderText(root: HTMLElement, text: string, noteText: string): void {
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = noteText;
  const pre = document.createElement('pre');
  pre.className = 'texto-restringido';
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', t('item.texto'));
  pre.textContent = text;
  root.replaceChildren(note, pre);
}

/** Page images with a note above them (released pages, or an admin's signed preview). */
function renderPages(root: HTMLElement, srcs: string[], title: string, noteText: string): void {
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = noteText;
  const ol = document.createElement('ol');
  ol.className = 'pages liberado-pages';
  ol.dataset.lbHash = '';
  ol.setAttribute('aria-label', t('item.visor'));
  srcs.forEach((src, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = src;
    a.dataset.lb = 'liberado';
    a.setAttribute('aria-label', t('item.ampliar', { n: i + 1 }));
    const img = document.createElement('img');
    img.src = src;
    img.alt = t('item.imagen_alt', { titulo: title, n: i + 1 });
    img.loading = i < 2 ? 'eager' : 'lazy';
    img.decoding = 'async';
    a.append(img);
    li.append(a);
    ol.append(li);
  });
  root.replaceChildren(note, ol);
}

async function hydrate(): Promise<void> {
  const root = document.getElementById('liberado');
  const id = root?.dataset.item ?? '';
  const files = pageFiles(root?.dataset.pages);
  if (!root || !id) return;
  const client = getClient();
  if (!client) return; // no live backend configured: the static placeholder stays
  const r = await liveQuery<{ item_id: string } | null>(
    (c) => c.from('released_items').select('item_id').eq('item_id', id).maybeSingle(),
    null,
    6000,
    client,
  );
  if (r.offline) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = t('estado.sin_conexion');
    root.replaceChildren(p);
    return;
  }
  const title = document.querySelector('h1')?.textContent?.trim() ?? '';
  if (!r.data) {
    // Not released yet: an admin sees it (signed URLs) to decide; everyone else keeps the placeholder.
    const profile = await currentProfile(client).catch(() => null);
    if (profile?.role !== 'admin') return;
    const pv = await restrictedPreview({ id, thumb: null, page_paths: files }, client);
    if (pv?.text) renderText(root, pv.text, t('item.vista_admin'));
    else if (pv?.pages.length) renderPages(root, pv.pages, title, t('item.vista_admin'));
    return;
  }
  await renderReleased(root, id, files, (p) => client.storage.from('media').getPublicUrl(p).data.publicUrl, title);
}

if (typeof document !== 'undefined') void hydrate();
