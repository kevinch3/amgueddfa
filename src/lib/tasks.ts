import { isPublic } from './visibilidad';
import type { Item } from './types';

/** The fields taskQueue looks at; the /tareas page passes slimmed catalog rows. */
export type TaskCandidate = Pick<Item, 'id' | 'formato' | 'restricted' | 'fecha'>;

/** How far back the present reaches: Quick tasks leave out these last years (#187). */
export const PRESENT_YEARS = 20;

/**
 * Whether a document is history, the part Quick tasks ask people to fill in: its
 * year (guessed or not) is more than PRESENT_YEARS back, or unknown (dating it is
 * history work too). The cutoff moves on by itself each year.
 */
export function isHistory(year: number | null, now = new Date().getFullYear()): boolean {
  return year === null || year <= now - PRESENT_YEARS;
}

/** An item can be a quick task: a public image of history whose year or category we guessed. */
export function isTaskCandidate(i: TaskCandidate, now?: number): boolean {
  return i.fecha.inferred && isPublic(i) && i.formato === 'image' && isHistory(i.fecha.year, now);
}

/** 32-bit FNV-1a of a string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The quick-task feed for one person: year_inferred, non-restricted images the
 * user has not submitted yet, shuffled deterministically by `seed` (the user id),
 * so each person sees a different but stable order. Input order does not matter.
 */
export function taskQueue<T extends TaskCandidate>(items: T[], doneIds: Set<string>, seed: string, now?: number): T[] {
  const out = items
    .filter((i) => isTaskCandidate(i, now) && !doneIds.has(i.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const next = rng(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
