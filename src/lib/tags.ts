/**
 * Approved "tag" contributions correct where a catalog item belongs (year,
 * festival, category). The same rule runs at build time (catalog.ts, from the
 * last export) and in the browser (scripts/live-catalog.ts, from approvals made
 * after the build), so a correction is public the moment it is approved.
 */
import type { EditionState } from './types';

/** What a tag can change: catalog items and the compact index (lib/placement.ts) both fit. */
export type Taggable = { id: string; year: number | null; category: string; festival: string; undated: boolean; year_inferred: boolean; restricted: boolean };

export type TagLike = {
  type?: string;
  item_id?: string | null;
  payload?: Record<string, any> | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

const FIELDS = ['year', 'category', 'festival'] as const;
const when = (t: TagLike) => t.reviewed_at ?? t.created_at ?? '';
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

/** New array of items with every approved tag applied, oldest approval first. */
export function applyTags<T extends Taggable>(items: T[], tags: TagLike[]): T[] {
  const mine = tags.filter((t) => t?.type === 'tag' && t.item_id).sort((a, b) => when(a).localeCompare(when(b)));
  if (!mine.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const changed = new Map<string, T>();
  for (const t of mine) {
    const base = changed.get(t.item_id!) ?? byId.get(t.item_id!);
    if (!base) continue;
    const it = { ...base };
    const p = t.payload ?? {};
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

/** Newest approval time among tags: what a static build already includes. */
export function latestTagAt(tags: TagLike[]): string | null {
  const times = tags.filter((t) => t?.type === 'tag' && t.reviewed_at).map((t) => t.reviewed_at as string).sort();
  return times.length ? times[times.length - 1] : null;
}
