import { describe, expect, it } from 'vitest';
import { decades, editionFromPath, hasEditionPage, revealDecade } from '../src/lib/timeline';

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

describe('revealDecade', () => {
  const stub = () => {
    const details = { open: false };
    const calls: string[] = [];
    return { details, calls, node: { closest: (sel: string) => (calls.push(sel), details) } };
  };

  it('opens the collapsed decade holding a cell that gained material', () => {
    const s = stub();
    revealDecade(s.node, 'some');
    expect(s.details.open).toBe(true);
    expect(s.calls).toEqual(['details[data-decada-vacia]']);
  });

  it('leaves it closed when the cell is still empty', () => {
    const s = stub();
    revealDecade(s.node, 'none');
    expect(s.details.open).toBe(false);
  });

  it('does nothing outside a collapsed decade', () => {
    expect(() => revealDecade({ closest: () => null }, 'full')).not.toThrow();
  });
});

describe('edition pages outside the built range', () => {
  const firsts = { chubut: 1975, juventud: 1985 };

  it('hasEditionPage: only years from the coleccion start to now', () => {
    expect(hasEditionPage('chubut', 1975, firsts, 2026)).toBe(true);
    expect(hasEditionPage('chubut', 2026, firsts, 2026)).toBe(true);
    expect(hasEditionPage('chubut', 1930, firsts, 2026)).toBe(false);
    expect(hasEditionPage('chubut', 2027, firsts, 2026)).toBe(false);
    expect(hasEditionPage('trevelin', 2020, firsts, 2026)).toBe(false);
  });

  it('editionFromPath reads /<coleccion>/<year>/ under the site base', () => {
    expect(editionFromPath('/chubut/1930/', '/')).toEqual({ coleccion: 'chubut', year: 1930 });
    expect(editionFromPath('/museo/mimosa/1950', '/museo/')).toEqual({ coleccion: 'mimosa', year: 1950 });
    expect(editionFromPath('/nada/1930/', '/')).toBeNull();
    expect(editionFromPath('/chubut/', '/')).toBeNull();
    expect(editionFromPath('/item/abc/', '/')).toBeNull();
  });
});
