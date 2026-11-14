import { describe, expect, it } from 'vitest';
import { decades } from '../src/lib/timeline';

const none = (ys: number[]) => (y: number) => !ys.includes(y);

describe('decades', () => {
  it('groups by decade and clips to the range', () => {
    const d = decades(1975, 2001, () => false);
    expect(d.map((x) => [x.from, x.to])).toEqual([[1975, 1979], [1980, 1989], [1990, 1999], [2000, 2001]]);
    expect(d[0].years).toEqual([1975, 1976, 1977, 1978, 1979]);
  });

  it('marks only fully empty middle decades', () => {
    const d = decades(1930, 2026, none([1930, 1955, 2026]));
    expect(d.filter((x) => x.empty).map((x) => x.from)).toEqual([1940, 1960, 1970, 1980, 1990, 2000, 2010]);
  });

  it('never collapses the first or current decade', () => {
    const d = decades(1931, 2026, () => true);
    expect(d[0].empty).toBe(false);
    expect(d.at(-1)!.empty).toBe(false);
  });

  it('single-year range', () => {
    expect(decades(2026, 2026, () => true)).toEqual([{ from: 2026, to: 2026, years: [2026], empty: false }]);
  });
});
