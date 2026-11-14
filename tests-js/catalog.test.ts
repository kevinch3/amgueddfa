import { beforeEach, describe, expect, it } from 'vitest';
import {
  editionState, mostWanted, pageUrls, setItems, thumbUrl, yearRange, editionItems, festivals,
  firstMaterialYear, YEAR_FLOOR,
} from '../src/lib/catalog';
import type { Item } from '../src/lib/types';

function mk(over: Partial<Item>): Item {
  return {
    id: 'aaaaaaaaaaaa', festival: 'chubut', year: 1990, undated: false, category: 'otros',
    title: 't', kind: 'image', src_path: 'x', alt_paths: [], source_url: null,
    source_label: 'l', retrieved: '2026-01-01', note_public: '', year_inferred: false,
    restricted: false, pages: 1, thumb: 'aaaaaaaaaaaa/thumb.webp',
    page_paths: ['aaaaaaaaaaaa/p01.webp'], text_excerpt: null, table: null, ...over,
  };
}

const fixture: Item[] = [
  mk({ id: '000000000001', year: 1990, category: 'programa', kind: 'pdf' }),
  mk({ id: '000000000002', year: 1991, category: 'programa', kind: 'image' }),
  mk({ id: '000000000003', year: 1992, category: 'bases', kind: 'pdf' }),
  mk({ id: '000000000004', year: 1980, festival: 'mimosa', category: 'otros' }),
  mk({ id: '000000000005', year: null, undated: true, festival: 'chubut' }),
];

beforeEach(() => setItems(fixture));

describe('catalog', () => {
  it('editionState full only with programa pdf', () => {
    expect(editionState('chubut', 1990)).toBe('full');
    expect(editionState('chubut', 1991)).toBe('some');
    expect(editionState('chubut', 1992)).toBe('some');
    expect(editionState('chubut', 1993)).toBe('none');
    expect(editionItems('chubut', 1990)).toHaveLength(1);
  });

  it('yearRange starts at earliest catalog or approved year', () => {
    const now = new Date().getFullYear();
    expect(yearRange('chubut', [])).toEqual([1990, now]);
    expect(yearRange('chubut', [{ festival: 'chubut', year: 1930 }])).toEqual([1930, now]);
    expect(yearRange('trevelin', [])).toEqual([now, now]);
  });

  it('firstMaterialYear ignores undated or unassigned contributions', () => {
    const noise = [{ festival: 'chubut', year: null }, { festival: null, year: 1900 }, { festival: 'mimosa', year: 1950 }];
    expect(firstMaterialYear('chubut', noise)).toBe(1990);
    expect(firstMaterialYear('mimosa', noise)).toBe(1950);
    expect(firstMaterialYear('trevelin', [])).toBeNull();
    expect(YEAR_FLOOR).toBe(1865);
  });

  it('mostWanted excludes full editions', () => {
    const w = mostWanted(10);
    expect(w.map((e) => [e.festival, e.year])).toEqual([
      ['chubut', 1992], ['chubut', 1991], ['mimosa', 1980],
    ]);
    expect(mostWanted(1)).toHaveLength(1);
  });

  it('festivals are ordered', () => {
    expect(festivals().map((f) => f.slug)).toEqual(['chubut', 'juventud', 'mimosa', 'trevelin']);
  });

  it('never exposes media urls for restricted items', () => {
    const r = mk({ restricted: true });
    expect(thumbUrl(r)).toBeNull();
    expect(pageUrls(r)).toEqual([]);
    const ok = mk({});
    expect(thumbUrl(ok)).toBe('/media/aaaaaaaaaaaa/thumb.webp');
    expect(pageUrls(ok)).toEqual(['/media/aaaaaaaaaaaa/p01.webp']);
  });
});
