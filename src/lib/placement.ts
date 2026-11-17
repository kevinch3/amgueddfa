/** Where catalog items sit, and what a live correction changes on a page (pure; scripts/live-catalog.ts does the DOM). */
import { catalogState } from './tags';
import type { EditionState } from './types';

export type IndexItem = {
  id: string; title: string; festival: string; year: number | null; undated: boolean; category: string;
  kind: string; restricted: boolean; year_inferred: boolean; thumb: string | null; hidden?: boolean;
};

/** What a card list shows: an edition's category, or a festival's undated / general items. */
export type Scope = { festival: string; year: number | 'none'; category?: string; undated?: boolean };

export function inScope(i: IndexItem, s: Scope): boolean {
  if (i.hidden || i.festival !== s.festival) return false;
  if (s.year === 'none') return i.year === null && (s.undated === undefined || i.undated === s.undated);
  return i.year === s.year && (s.category === undefined || i.category === s.category);
}

const KEYS: (keyof IndexItem)[] = ['title', 'festival', 'year', 'undated', 'category', 'restricted', 'year_inferred'];

/** Items whose title, placement or badges differ between two versions of the index. */
export function changedItems(before: IndexItem[], after: IndexItem[]): { before: IndexItem; after: IndexItem }[] {
  const old = new Map(before.map((i) => [i.id, i]));
  const out: { before: IndexItem; after: IndexItem }[] = [];
  for (const a of after) {
    const b = old.get(a.id);
    if (b && (KEYS.some((k) => b[k] !== a[k]) || Boolean(b.hidden) !== Boolean(a.hidden))) out.push({ before: b, after: a });
  }
  return out;
}

/** "festival:year" keys whose catalog coverage may have changed, with their new catalog-only state. */
export function affectedStates(changes: { before: IndexItem; after: IndexItem }[], after: IndexItem[]): Map<string, EditionState> {
  const keys = new Set<string>();
  for (const { before, after: a } of changes) {
    for (const i of [before, a]) if (i.year !== null) keys.add(`${i.festival}:${i.year}`);
  }
  const out = new Map<string, EditionState>();
  for (const k of keys) {
    const [f, y] = k.split(':');
    out.set(k, catalogState(after.filter((i) => i.festival === f && i.year === Number(y))));
  }
  return out;
}
