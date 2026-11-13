import staticEditions from '../../data/approved/editions.json';
import { byLine, factDisplay, forEdition, mergeApproved, sortFacts, type Contribution } from '../lib/contrib';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';

type EditionRow = { festival: string; year: number; status: 'unknown' | 'held' | 'not_held'; note?: string | null };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Same markup as the static build renders into #hechos. */
export function renderFacts(mount: HTMLElement, facts: Contribution[]): void {
  mount.replaceChildren();
  if (!facts.length) return;
  const dl = el('dl', 'hechos');
  for (const c of sortFacts(facts)) {
    const { label, value } = factDisplay(c);
    const row = el('div');
    const dd = el('dd', undefined, value);
    const by = byLine(c);
    if (by) dd.append(' ', el('span', 'muted small', by));
    row.append(el('dt', undefined, label), dd);
    dl.append(row);
  }
  mount.append(dl);
}

/** Same markup as the static build renders into #recuerdos. */
export function renderMemories(mount: HTMLElement, memories: Contribution[]): void {
  mount.replaceChildren();
  if (!memories.length) return;
  const ul = el('ul', 'recuerdos');
  for (const c of memories) {
    const li = el('li');
    li.append(el('blockquote', undefined, String(c.payload?.text ?? '')));
    const by = byLine(c);
    if (by) li.append(el('p', 'muted small', by));
    ul.append(li);
  }
  mount.append(ul);
}

/** Approved uploads, listed under the contribution links in #aportes. */
function renderUploads(mount: HTMLElement, uploads: Contribution[], offline: boolean): void {
  mount.querySelector('.aportes-live')?.remove();
  const box = el('div', 'aportes-live');
  if (uploads.length) {
    box.append(el('h3', 'small', t('edicion.aportes_aprobados')));
    const ul = el('ul', 'aportes-lista');
    for (const c of uploads) {
      const li = el('li');
      const cat = String(c.payload?.category ?? '');
      if (cat) li.append(el('span', 'badge', t(`categorias.${cat}`)), ' ');
      li.append(String(c.payload?.description ?? '') || t('edicion.aporte_sin_descripcion'));
      const by = byLine(c);
      if (by) li.append(' ', el('span', 'muted small', by));
      ul.append(li);
    }
    box.append(ul);
  }
  if (offline) box.append(el('p', 'muted small', t('estado.sin_conexion')));
  if (box.childNodes.length) mount.append(box);
}

function readStatic(): Contribution[] {
  const s = document.getElementById('aprobados-data');
  if (!s?.textContent) return [];
  try {
    const v = JSON.parse(s.textContent);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function hydrateEdition(): Promise<void> {
  const hechos = document.getElementById('hechos');
  const recuerdos = document.getElementById('recuerdos');
  const aportes = document.getElementById('aportes');
  const ref = hechos ?? recuerdos ?? aportes;
  if (!ref) return;
  const festival = ref.dataset.festival ?? '';
  const year = Number(ref.dataset.year);
  if (!festival || !Number.isInteger(year)) return;

  const live = await liveQuery<Contribution[]>(
    (c) =>
      c.from('public_contributions')
        .select('id, type, festival, year, item_id, payload, created_at, reviewed_at, display_name')
        .eq('festival', festival)
        .eq('year', year)
        .in('type', ['fact', 'memory', 'upload'])
        .order('created_at', { ascending: true })
        .limit(500),
    [],
  );
  if (live.offline) {
    // Keep what the static build rendered; only say we could not check for news.
    if (aportes) renderUploads(aportes, forEdition(readStatic(), festival, year, 'upload'), true);
    return;
  }
  const all = mergeApproved(readStatic(), live.data);
  if (hechos) renderFacts(hechos, forEdition(all, festival, year, 'fact'));
  if (recuerdos) renderMemories(recuerdos, forEdition(all, festival, year, 'memory'));
  if (aportes) renderUploads(aportes, forEdition(all, festival, year, 'upload'), false);
}

/** Mark editions that never happened (editions.status = not_held) on grids, timelines and the edition badge. */
export function applyEditionStatus(root: ParentNode, rows: EditionRow[]): void {
  const status = new Map<string, EditionRow['status']>();
  for (const r of rows) status.set(`${r.festival}:${r.year}`, r.status);
  const label = t('edicion.no_realizada');
  for (const node of root.querySelectorAll<HTMLElement>('[data-festival][data-year][data-state]')) {
    const { festival = '', year = '' } = node.dataset;
    if (status.get(`${festival}:${year}`) !== 'not_held' || node.dataset.status === 'not_held') continue;
    node.dataset.status = 'not_held';
    if (node.matches('[data-cell]')) {
      node.setAttribute('aria-label', t('inicio.celda', { festival: t(`festivales.${festival}`), year, estado: label }));
      node.title = label;
    } else if (node.classList.contains('badge-state')) {
      node.classList.add('st-not_held');
      node.textContent = label;
    } else {
      node.classList.add('tl-not_held');
      const st = node.querySelector('.st');
      if (st) st.textContent = label;
    }
  }
}

async function overlayEditions(): Promise<void> {
  if (!document.querySelector('[data-festival][data-year][data-state]')) return;
  const live = await liveQuery<EditionRow[]>((c) => c.from('editions').select('festival, year, status'), []);
  // Live rows win over the last export for the same edition; offline, the export alone.
  const merged = new Map<string, EditionRow>();
  for (const r of [...(staticEditions as EditionRow[]), ...live.data]) merged.set(`${r.festival}:${r.year}`, r);
  applyEditionStatus(document, [...merged.values()]);
}

if (typeof document !== 'undefined') {
  void hydrateEdition();
  void overlayEditions();
}
