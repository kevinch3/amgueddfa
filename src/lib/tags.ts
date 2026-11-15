/**
 * Approved "tag" contributions correct where a catalog item belongs (year,
 * festival, category). The same rule runs at build time (catalog.ts, from the
 * last export) and in the browser (scripts/live-catalog.ts, from approvals made
 * after the build), so a correction is public the moment it is approved.
 */
import type { EditionState } from './types';

/** What a tag can change: catalog items and the compact index (lib/placement.ts) both fit. */
export type Taggable = { id: string; year: number | null; category: string; festival: string; undated: boolean; year_inferred: boolean; restricted: boolean; hidden?: boolean };

export type TagLike = {
  type?: string;
  festival?: string | null;
  year?: number | null;
  item_id?: string | null;
  payload?: Record<string, any> | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

const FIELDS = ['year', 'category', 'festival'] as const;
export const when = (t: TagLike) => t.reviewed_at ?? t.created_at ?? '';
/** An approved report about a catalog document ("Informar un error"). */
const isDocReport = (t: TagLike) => t?.type === 'report' && t.payload?.objetivo === 'documento';
/** Rows that place documents: tags and document reports. */
const places = (t: TagLike) => t?.type === 'tag' || isDocReport(t);
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * New array of items with every approved tag and document report applied,
 * oldest approval first. A report "otra_edicion" moves like a tag (its
 * `arreglo`); "no_corresponde" hides the item; "otro" changes nothing.
 * Nothing un-hides an item.
 */
export function applyTags<T extends Taggable>(items: T[], tags: TagLike[]): T[] {
  const mine = tags.filter((t) => places(t) && t.item_id).sort((a, b) => when(a).localeCompare(when(b)));
  if (!mine.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const changed = new Map<string, T>();
  for (const t of mine) {
    const base = changed.get(t.item_id!) ?? byId.get(t.item_id!);
    if (!base) continue;
    const it = { ...base };
    let p: Record<string, any> = t.payload ?? {};
    if (t.type === 'report') {
      if (p.problema === 'no_corresponde') it.hidden = true;
      p = p.problema === 'otra_edicion' ? (p.arreglo ?? {}) : {};
    }
    for (const f of FIELDS) {
      if (!given(p[f])) continue;
      (it as any)[f] = f === 'year' ? Number(p[f]) : p[f];
    }
    if (given(p.year)) {
      it.undated = false;
      it.year_inferred = false;
    }
    if (it.category === 'resultados') it.restricted = true; // only ever restrict
    changed.set(it.id, it);
  }
  return items.map((i) => changed.get(i.id) ?? i);
}

/** Coverage from catalog items alone: a programa PDF is full, anything else some. */
export function catalogState(list: { category: string; kind: string }[]): EditionState {
  if (list.some((i) => i.category === 'programa' && i.kind === 'pdf')) return 'full';
  return list.length ? 'some' : 'none';
}

/** Newest approval time among tags and reports: what a static build already includes. */
export function latestTagAt(tags: TagLike[]): string | null {
  const times = tags.filter((t) => (t?.type === 'tag' || t?.type === 'report') && t.reviewed_at).map((t) => t.reviewed_at as string).sort();
  return times.length ? times[times.length - 1] : null;
}
