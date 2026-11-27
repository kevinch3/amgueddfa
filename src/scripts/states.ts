/**
 * Edition coverage on grids, timelines and the edition badge, kept live:
 * final state = max(catalog-only state, live approved uploads). The catalog
 * part is baked as data-cat-state and live corrections (live-catalog.ts) may
 * lower or raise it; uploads only ever raise.
 */
import { liveQuery } from '../lib/live';
import { t } from '../lib/i18n';
import { stateLabel } from '../lib/site';
import { revealDecade } from '../lib/timeline';
import type { EditionState } from '../lib/types';
import { maxState, uploadStates, type UploadLike } from '../lib/uploads';

let uploads: Promise<{ states: Map<string, EditionState>; offline: boolean }> | null = null;

/** Approved uploads per edition, fetched once per page. */
export function liveUploadStates() {
  uploads ??= liveQuery<UploadLike[]>(
    (c) => c.from('public_contributions').select('id, type, coleccion, year, payload').eq('type', 'upload').limit(5000),
    [],
  ).then((r) => ({ states: uploadStates(r.data), offline: r.offline }));
  return uploads;
}

/** Show one state on a cell, timeline row or badge (and the "falta el programa" slot). */
export function setNodeState(root: ParentNode, node: HTMLElement, next: EditionState): void {
  const { coleccion = '', year = '' } = node.dataset;
  const old = (node.dataset.state ?? 'none') as EditionState;
  if (next === old || node.dataset.status === 'not_held') return;
  node.dataset.state = next;
  revealDecade(node, next);
  const label = stateLabel(next, node.dataset.status);
  if (node.matches('[data-cell]')) {
    node.classList.replace(`st-${old}`, `st-${next}`);
    node.setAttribute('aria-label', t('inicio.celda', { festival: t(`festivales.${coleccion}`), year, estado: label }));
    node.title = label;
  } else if (node.classList.contains('badge-state')) {
    node.classList.replace(`st-${old}`, `st-${next}`);
    node.textContent = label;
  } else {
    node.classList.replace(`tl-${old}`, `tl-${next}`);
    const first = node.querySelector('.st')?.firstChild;
    if (first?.nodeType === 3) first.textContent = label;
  }
  for (const slot of root.querySelectorAll<HTMLElement>(`[data-falta-programa][data-coleccion="${coleccion}"][data-year="${year}"]`)) {
    slot.hidden = next === 'full';
  }
}

/** Raise nodes to the given states (never lowers). */
export function raiseStates(root: ParentNode, states: Map<string, EditionState>): void {
  if (!states.size) return;
  for (const node of root.querySelectorAll<HTMLElement>('[data-coleccion][data-year][data-state]')) {
    const key = `${node.dataset.coleccion}:${node.dataset.year}`;
    setNodeState(root, node, maxState((node.dataset.state ?? 'none') as EditionState, states.get(key) ?? 'none'));
  }
}

/** Recompute every node from its catalog-only state and live uploads. Offline, it only raises. */
export async function refreshStates(root: ParentNode = document): Promise<void> {
  const nodes = root.querySelectorAll<HTMLElement>('[data-coleccion][data-year][data-state][data-cat-state]');
  if (!nodes.length) return;
  const { states, offline } = await liveUploadStates();
  for (const node of nodes) {
    const key = `${node.dataset.coleccion}:${node.dataset.year}`;
    let next = maxState(node.dataset.catState as EditionState, states.get(key) ?? 'none');
    if (offline) next = maxState(next, (node.dataset.state ?? 'none') as EditionState);
    setNodeState(root, node, next);
  }
}
