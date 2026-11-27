import type { Fecha } from '../src/lib/types';
import { describe, expect, it } from 'vitest';
import { applyTags, catalogState, latestTagAt } from '../src/lib/tags';
import type { Item } from '../src/lib/types';

const item = (over: Omit<Partial<Item>, 'fecha'> & { fecha?: Partial<Fecha> }): Item => ({
  id: 'a', coleccion: 'chubut', tipo: 'programa', title: 'Tapa', formato: 'image',
  src_path: '', alt_paths: [], source_url: null, source_label: '', retrieved: null, note_public: null,
  restricted: false, pages: 1, thumb: null, page_paths: [], text_excerpt: null, table: null, ...over,
  fecha: { year: 1996, inferred: true, undated: false, ...over.fecha },
} as Item);

describe('tags', () => {
  it('moves an item to the corrected year, coleccion and tipo and clears the estimate', () => {
    const [out] = applyTags([item({})], [{ type: 'tag', item_id: 'a', payload: { year: 1986, tipo: 'bases', coleccion: 'mimosa' }, reviewed_at: '2026-11-14T15:48:54Z' }]);
    expect(out).toMatchObject({ fecha: { inferred: false, undated: false, year: 1986 }, tipo: 'bases', coleccion: 'mimosa' });
  });

  it('never mutates its input and ignores other types, other items and empty fields', () => {
    const src = [item({})];
    const out = applyTags(src, [
      { type: 'fact', item_id: 'a', payload: { year: 2000 } },
      { type: 'tag', item_id: 'zzz', payload: { year: 2000 } },
      { type: 'tag', item_id: 'a', payload: { year: '', tipo: null } },
    ]);
    expect(src[0].fecha.year).toBe(1996);
    expect(out[0]).toMatchObject({ fecha: { inferred: true, year: 1996 }, tipo: 'programa' });
  });

  it('applies tags oldest first, so the latest approval wins', () => {
    const [out] = applyTags([item({})], [
      { type: 'tag', item_id: 'a', payload: { year: 1987 }, reviewed_at: '2026-11-14T16:00:00Z' },
      { type: 'tag', item_id: 'a', payload: { year: 1986 }, reviewed_at: '2026-11-14T15:00:00Z' },
    ]);
    expect(out.fecha.year).toBe(1987);
  });

  it('a year given as text is a number; a tipo of resultados restricts, nothing un-restricts', () => {
    const [a] = applyTags([item({})], [{ type: 'tag', item_id: 'a', payload: { year: '1986', tipo: 'resultados' } }]);
    expect(a).toMatchObject({ fecha: { year: 1986 }, restricted: true });
    const [b] = applyTags([item({ restricted: true })], [{ type: 'tag', item_id: 'a', payload: { tipo: 'bases' } }]);
    expect(b.restricted).toBe(true);
  });

  it('catalogState: a programa PDF is full, anything else some, nothing none', () => {
    expect(catalogState([item({ formato: 'pdf' })])).toBe('full');
    expect(catalogState([item({})])).toBe('some');
    expect(catalogState([])).toBe('none');
  });

  it('latestTagAt is the newest approval time among tags, or null', () => {
    expect(latestTagAt([{ type: 'tag', reviewed_at: '2026-01-01T00:00:00Z' }, { type: 'tag', reviewed_at: '2026-11-14T15:48:54Z' }, { type: 'fact', reviewed_at: '2027-01-01T00:00:00Z' }])).toBe('2026-11-14T15:48:54Z');
    expect(latestTagAt([])).toBeNull();
  });

  it('a document report moves like a tag, or hides; the latest approval wins', () => {
    const doc = (problema: string, arreglo: Record<string, unknown> | undefined, at: string) =>
      ({ type: 'report', item_id: 'a', payload: { objetivo: 'documento', problema, ...(arreglo ? { arreglo } : {}) }, reviewed_at: at });
    const [moved] = applyTags([item({})], [doc('otra_edicion', { year: 2014 }, '2026-11-15T10:00:00Z'), { type: 'tag', item_id: 'a', payload: { year: 2016 }, reviewed_at: '2026-11-15T11:00:00Z' }]);
    expect(moved).toMatchObject({ fecha: { inferred: false, year: 2016 } });
    const [later] = applyTags([item({})], [{ type: 'tag', item_id: 'a', payload: { year: 2016 }, reviewed_at: '2026-11-15T10:00:00Z' }, doc('otra_edicion', { year: 2014, tipo: 'bases' }, '2026-11-15T11:00:00Z')]);
    expect(later).toMatchObject({ fecha: { year: 2014 }, tipo: 'bases' });
    expect(applyTags([item({})], [doc('no_corresponde', undefined, '2026-11-15T10:00:00Z')])[0].hidden).toBe(true);
    expect(applyTags([item({})], [doc('otro', { year: 2000 }, '2026-11-15T10:00:00Z')])[0]).toMatchObject({ fecha: { year: 1996 } });
    expect(applyTags([item({})], [doc('otro', undefined, '2026-11-15T10:00:00Z')])[0].hidden).toBeFalsy();
    // a video report never touches catalog items, even with the same id
    const vid = { type: 'report', item_id: 'a', payload: { objetivo: 'video', problema: 'no_corresponde', video: { id: 'a' } }, reviewed_at: '2026-11-15T10:00:00Z' };
    expect(applyTags([item({})], [vid])[0].hidden).toBeFalsy();
  });

  it('latestTagAt also counts reports', () => {
    expect(latestTagAt([{ type: 'tag', reviewed_at: '2026-11-14T15:48:54Z' }, { type: 'report', reviewed_at: '2026-11-15T09:00:00Z' }])).toBe('2026-11-15T09:00:00Z');
  });
});
