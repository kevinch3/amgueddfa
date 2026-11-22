import { beforeEach, describe, expect, it } from 'vitest';
import {
  editionState, mostWanted, pageUrls, setItems, thumbUrl, yearRange, editionItems, festivals,
  firstMaterialYear, editionYears, YEAR_FLOOR, undocumented, editionCover, coverBox, items, allItems,
} from '../src/lib/catalog';
import type { Item } from '../src/lib/types';
import { MEDIA_BASE, siteMedia } from '../src/lib/paths';

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
  it('hidden items are left out of listings but keep their page', () => {
    setItems([mk({ id: '000000000001', year: 1990, category: 'programa', kind: 'pdf', hidden: true }), mk({ id: '000000000002', year: 1990 })]);
    expect(items().map((i) => i.id)).toEqual(['000000000002']);
    expect(allItems().map((i) => i.id)).toEqual(['000000000001', '000000000002']);
    expect(editionItems('chubut', 1990).map((i) => i.id)).toEqual(['000000000002']);
    // the hidden programa PDF no longer makes 1990 full
    expect(editionState('chubut', 1990, [])).toBe('some');
  });

  it('editionState full only with programa pdf', () => {
    expect(editionState('chubut', 1990, [])).toBe('full');
    expect(editionState('chubut', 1991, [])).toBe('some');
    expect(editionState('chubut', 1992, [])).toBe('some');
    expect(editionState('chubut', 1993, [])).toBe('none');
    expect(editionItems('chubut', 1990)).toHaveLength(1);
  });

  it('editionYears adds documented not-held years outside the range (#22)', () => {
    const now = new Date().getFullYear();
    const ys = editionYears('chubut', [1890, 1995], [{ festival: 'chubut', year: 1990 }]);
    expect(ys[0]).toBe(1890);
    expect(ys[1]).toBe(1990);
    expect(ys.filter((y) => y === 1995)).toHaveLength(1);
    expect(ys.at(-1)).toBe(now);
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

  it('undocumented: no catalog item and no approved contribution of any type', () => {
    expect(undocumented('chubut', 1993, [])).toBe(true);
    expect(undocumented('chubut', 1990, [])).toBe(false);
    expect(undocumented('chubut', 1993, [{ festival: 'chubut', year: 1993 }])).toBe(false);
    expect(undocumented('chubut', 1993, [{ festival: 'mimosa', year: 1993 }])).toBe(true);
  });

  it('a "no se realizó" fact is not material: no start year, decade stays empty', () => {
    const notHeld = { type: 'fact', festival: 'chubut', year: 1930, payload: { field: 'edicion_realizada', value: 'no' } };
    const held = { type: 'fact', festival: 'chubut', year: 1931, payload: { field: 'edicion_realizada', value: 'si' } };
    expect(firstMaterialYear('chubut', [notHeld])).toBe(1990);
    expect(undocumented('chubut', 1930, [notHeld])).toBe(true);
    expect(firstMaterialYear('chubut', [notHeld, held])).toBe(1931);
    expect(undocumented('chubut', 1931, [held])).toBe(false);
  });

  it('mostWanted excludes full editions', () => {
    // Explicit data: the real export (data/approved) must never leak into unit tests.
    const w = mostWanted(10, []);
    expect(w.map((e) => [e.festival, e.year])).toEqual([
      ['chubut', 1992], ['chubut', 1991], ['mimosa', 1980],
    ]);
    expect(mostWanted(1, [])).toHaveLength(1);
  });

  it('mostWanted takes its year range from the uploads it is given', () => {
    const early = { type: 'upload', festival: 'chubut', year: 1920, payload: { category: 'otros' } };
    expect(mostWanted(10, [early]).map((e) => [e.festival, e.year])).toContainEqual(['chubut', 1920]);
  });

  it('festivals are ordered', () => {
    expect(festivals().map((f) => f.slug)).toEqual(['chubut', 'juventud', 'mimosa', 'trevelin']);
  });

  it('never exposes media urls for restricted items', () => {
    const r = mk({ restricted: true });
    expect(thumbUrl(r)).toBeNull();
    expect(pageUrls(r)).toEqual([]);
    const ok = mk({});
    expect(thumbUrl(ok)).toBe(`${MEDIA_BASE}/media/aaaaaaaaaaaa/thumb.webp`);
    expect(pageUrls(ok)).toEqual([`${MEDIA_BASE}/media/aaaaaaaaaaaa/p01.webp`]);
  });

  it('serves catalog media from the bucket domain, or from the site when the base is empty', () => {
    expect(MEDIA_BASE).toBe('https://media.amgueddfa.org');
    expect(siteMedia('x/thumb.webp', undefined)).toBe('https://media.amgueddfa.org/media/x/thumb.webp');
    expect(siteMedia('/x/p01.webp', 'https://cdn.example/')).toBe('https://cdn.example/media/x/p01.webp');
    expect(siteMedia('x/p01.webp', '')).toBe('/media/x/p01.webp');
  });

  describe('coverBox (#5)', () => {
    it('fits the cover inside the 16rem × 22rem box, keeping its proportions', () => {
      expect(coverBox([675, 1200])).toEqual({ width: 198, height: 352 }); // tall: the height limits it
      expect(coverBox([720, 960])).toEqual({ width: 256, height: 341 });
      expect(coverBox([960, 720])).toEqual({ width: 256, height: 192 });
      expect(coverBox([100, 120])).toEqual({ width: 100, height: 120 }); // never enlarged
      expect(coverBox(null)).toEqual({});
    });
  });

  describe('editionCover', () => {
    const B = 'https://x.supabase.co';
    const U1 = '11111111-1111-1111-1111-111111111111';
    const U2 = '22222222-2222-2222-2222-222222222222';
    const upl = (id: string, payload: any, reviewed_at = '2026-01-01', year = 1990) => ({
      id, type: 'upload', festival: 'chubut', year, reviewed_at,
      payload: { category: 'programa', media: { thumb: `uploads/${id}/thumb.webp`, pages: [`uploads/${id}/p01.webp`] }, ...payload },
    });

    it('the latest approved tapa wins over the catalog programa', () => {
      const c = editionCover('chubut', 1990, [upl(U1, { tapa: true }, '2026-01-01'), upl(U2, { tapa: true }, '2026-03-01')], B);
      expect(c).toEqual({
        page: `${B}/storage/v1/object/public/media/uploads/${U2}/p01.webp`,
        thumb: `${B}/storage/v1/object/public/media/uploads/${U2}/thumb.webp`,
      });
    });

    it('falls back to page 1 of the catalog programa, then a complete upload', () => {
      const c = editionCover('chubut', 1990, [], B);
      expect(c?.page).toMatch(/\/media\/aaaaaaaaaaaa\/p01\.webp$/);
      expect(c?.thumb).toMatch(/\/media\/aaaaaaaaaaaa\/thumb\.webp$/);
      expect(editionCover('chubut', 1993, [upl(U1, { complete: true }, '2026-01-01', 1993)], B)?.page).toContain(`uploads/${U1}/p01.webp`);
      expect(editionCover('chubut', 1993, [upl(U1, {}, '2026-01-01', 1993)], B)).toBeNull();
    });

    it('a catalog item titled tapa or portada beats page 1 of the programa PDF', () => {
      setItems([
        mk({ id: '000000000001', year: 1990, category: 'programa', kind: 'pdf', title: 'Listado competencias', page_paths: ['a/p01.webp'], thumb: 'a/thumb.webp' }),
        mk({ id: '000000000002', year: 1990, category: 'programa', kind: 'image', title: 'Tapa programa 1990 foto 3', page_paths: ['b/p01.webp'], thumb: 'b/thumb.webp' }),
        mk({ id: '000000000003', year: 1991, category: 'otros', kind: 'image', title: 'Portada', page_paths: ['c/p01.webp'], thumb: 'c/thumb.webp', restricted: true }),
      ]);
      expect(editionCover('chubut', 1990, [], B)?.page).toMatch(/\/media\/b\/p01\.webp$/);
      expect(editionCover('chubut', 1991, [], B)).toBeNull();
    });

    it('only programa items titled tapa count (not e.g. the cover-design contest rules)', () => {
      setItems([
        mk({ id: '000000000004', year: 1990, category: 'bases', kind: 'image', title: 'concurso-tapa-programa', page_paths: ['d/p01.webp'], thumb: 'd/thumb.webp' }),
        mk({ id: '000000000005', year: 1990, category: 'programa', kind: 'image', title: 'Tapa programa 1990 foto', page_paths: ['e/p01.webp'], thumb: 'e/thumb.webp' }),
      ]);
      expect(editionCover('chubut', 1990, [], B)?.page).toMatch(/\/media\/e\/p01\.webp$/);
    });

    it('a restricted catalog programa never supplies a cover', () => {
      setItems([mk({ id: '000000000009', year: 1990, category: 'programa', kind: 'pdf', restricted: true })]);
      expect(editionCover('chubut', 1990, [], B)).toBeNull();
    });
  });
});
