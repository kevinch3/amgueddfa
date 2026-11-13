import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { releasedPath } from '../lib/paths';
import { getClient } from '../lib/supabase';

/** File names listed in data-pages ("p01.webp p02.webp"); anything else is ignored. */
export function pageFiles(raw: string | undefined): string[] {
  return (raw ?? '').split(/\s+/).filter((f) => /^p\d{2,}\.webp$/.test(f));
}

/** Show a released restricted item's pages from the public `media` bucket. */
export function renderReleased(root: HTMLElement, id: string, files: string[], publicUrl: (path: string) => string, title: string): void {
  const box = root.closest('.restricted');
  box?.classList.add('is-liberado');
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = t('item.liberado');
  const ol = document.createElement('ol');
  ol.className = 'pages liberado-pages';
  ol.setAttribute('aria-label', t('item.visor'));
  files.forEach((f, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const src = publicUrl(releasedPath(id, f));
    a.href = src;
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
  if (!root || !id || !files.length) return;
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
  if (!r.data) return;
  const title = document.querySelector('h1')?.textContent?.trim() ?? '';
  renderReleased(root, id, files, (p) => client.storage.from('media').getPublicUrl(p).data.publicUrl, title);
}

if (typeof document !== 'undefined') void hydrate();
