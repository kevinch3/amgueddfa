/** Where catalog items sit, and what a live correction changes on a page (pure; scripts/live-catalog.ts does the DOM). */
import { catalogState } from './tags';
import type { EditionState, Fecha } from './types';

export type IndexItem = {
  id: string; title: string; coleccion: string; fecha: Fecha; tipo: string;
  formato: string; restricted: boolean; thumb: string | null; hidden?: boolean;
};

/** What a card list shows: an edition's category, or a festival's undated / general items. */
export type Scope = { coleccion: string; year: number | 'none'; tipo?: string; undated?: boolean };

export function inScope(i: IndexItem, s: Scope): boolean {
  if (i.hidden || i.coleccion !== s.coleccion) return false;
  if (s.year === 'none') return i.fecha.year === null && (s.undated === undefined || i.fecha.undated === s.undated);
  return i.fecha.year === s.year && (s.tipo === undefined || i.tipo === s.tipo);
}

const KEYS: (keyof IndexItem)[] = ['title', 'coleccion', 'tipo', 'restricted'];
const sameFecha = (a: Fecha, b: Fecha) => a.year === b.year && a.inferred === b.inferred && a.undated === b.undated;

/** Items whose title, placement or badges differ between two versions of the index. */
export function changedItems(before: IndexItem[], after: IndexItem[]): { before: IndexItem; after: IndexItem }[] {
  const old = new Map(before.map((i) => [i.id, i]));
  const out: { before: IndexItem; after: IndexItem }[] = [];
  for (const a of after) {
    const b = old.get(a.id);
    if (b && (KEYS.some((k) => b[k] !== a[k]) || !sameFecha(b.fecha, a.fecha) || Boolean(b.hidden) !== Boolean(a.hidden))) out.push({ before: b, after: a });
  }
  return out;
}

/** "festival:year" keys whose catalog coverage may have changed, with their new catalog-only state. */
export function affectedStates(changes: { before: IndexItem; after: IndexItem }[], after: IndexItem[]): Map<string, EditionState> {
  const keys = new Set<string>();
  for (const { before, after: a } of changes) {
    for (const i of [before, a]) if (i.fecha.year !== null) keys.add(`${i.coleccion}:${i.fecha.year}`);
  }
  const out = new Map<string, EditionState>();
  for (const k of keys) {
    const [f, y] = k.split(':');
    out.set(k, catalogState(after.filter((i) => i.coleccion === f && i.fecha.year === Number(y))));
  }
  return out;
}
