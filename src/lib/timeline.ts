import type { EditionState, FestivalSlug } from './types';
import { FESTIVALS } from './contrib';

/** One decade of a festival's timeline, clipped to the range. */
export type Decade = { from: number; to: number; years: number[]; empty: boolean };

/**
 * Split [first, last] into decades, oldest first. A decade is `empty` (shown
 * collapsed) when every year in it has no material, unless it holds the first
 * year or the last (current) one.
 */
export function decades(first: number, last: number, isEmpty: (y: number) => boolean): Decade[] {
  const out: Decade[] = [];
  for (let start = first - (first % 10); start <= last; start += 10) {
    const from = Math.max(start, first);
    const to = Math.min(start + 9, last);
    const years = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const edge = from === first || to === last;
    out.push({ from, to, years, empty: !edge && years.every(isEmpty) });
  }
  return out;
}

/** A collapsed decade opens by itself once one of its years gains material live. */
export function revealDecade(node: { closest(sel: string): { open: boolean } | null }, state: EditionState): void {
  if (state === 'none') return;
  const d = node.closest('details[data-decada-vacia]');
  if (d) d.open = true;
}

/** Whether the build made a page for this edition: years from the festival's start to now. */
export function hasEditionPage(coleccion: string, year: number, firsts: Record<string, number>, now = new Date().getFullYear()): boolean {
  const first = firsts[coleccion];
  return first !== undefined && year >= first && year <= now;
}

/** The edition a "/<base>/eisteddfod/<festival>/<year>/" path points to (or the pre-#189 "/<base>/<festival>/<year>/"), or null. */
export function editionFromPath(path: string, base: string): { coleccion: FestivalSlug; year: number } | null {
  const b = base.replace(/\/+$/, '');
  if (!path.startsWith(`${b}/`)) return null;
  const m = /^(?:eisteddfod\/)?([a-z]+)\/(\d{4})\/?$/.exec(path.slice(b.length + 1));
  if (!m || !(FESTIVALS as readonly string[]).includes(m[1])) return null;
  return { coleccion: m[1] as FestivalSlug, year: Number(m[2]) };
}
