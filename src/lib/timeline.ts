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
