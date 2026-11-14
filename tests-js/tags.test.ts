import { describe, expect, it } from 'vitest';
import { applyTags, catalogState, latestTagAt } from '../src/lib/tags';
import type { Item } from '../src/lib/types';

const item = (over: Partial<Item>): Item => ({
  id: 'a', festival: 'chubut', year: 1996, undated: false, category: 'programa', title: 'Tapa', kind: 'image',
  src_path: '', alt_paths: [], source_url: null, source_label: '', retrieved: null, note_public: null,
  year_inferred: true, restricted: false, pages: 1, thumb: null, page_paths: [], text_excerpt: null, table: null, ...over,
} as Item);

describe('tags', () => {
  it('moves an item to the corrected year, festival and category and clears the estimate', () => {
    const [out] = applyTags([item({})], [{ type: 'tag', item_id: 'a', payload: { year: 1986, category: 'bases', festival: 'mimosa' }, reviewed_at: '2026-11-14T15:48:54Z' }]);
    expect(out).toMatchObject({ year: 1986, category: 'bases', festival: 'mimosa', year_inferred: false, undated: false });
  });

  it('never mutates its input and ignores other types, other items and empty fields', () => {
    const src = [item({})];
    const out = applyTags(src, [
      { type: 'fact', item_id: 'a', payload: { year: 2000 } },
      { type: 'tag', item_id: 'zzz', payload: { year: 2000 } },
      { type: 'tag', item_id: 'a', payload: { year: '', category: null } },
    ]);
    expect(src[0].year).toBe(1996);
    expect(out[0]).toMatchObject({ year: 1996, category: 'programa', year_inferred: true });
  });

  it('applies tags oldest first, so the latest approval wins', () => {
    const [out] = applyTags([item({})], [
      { type: 'tag', item_id: 'a', payload: { year: 1987 }, reviewed_at: '2026-11-14T16:00:00Z' },
      { type: 'tag', item_id: 'a', payload: { year: 1986 }, reviewed_at: '2026-11-14T15:00:00Z' },
    ]);
    expect(out.year).toBe(1987);
  });

  it('a year given as text is a number; a category of resultados restricts, nothing un-restricts', () => {
    const [a] = applyTags([item({})], [{ type: 'tag', item_id: 'a', payload: { year: '1986', category: 'resultados' } }]);
    expect(a).toMatchObject({ year: 1986, restricted: true });
    const [b] = applyTags([item({ restricted: true })], [{ type: 'tag', item_id: 'a', payload: { category: 'bases' } }]);
    expect(b.restricted).toBe(true);
  });

  it('catalogState: a programa PDF is full, anything else some, nothing none', () => {
    expect(catalogState([item({ kind: 'pdf' })])).toBe('full');
    expect(catalogState([item({})])).toBe('some');
    expect(catalogState([])).toBe('none');
  });

  it('latestTagAt is the newest approval time among tags, or null', () => {
    expect(latestTagAt([{ type: 'tag', reviewed_at: '2026-01-01T00:00:00Z' }, { type: 'tag', reviewed_at: '2026-11-14T15:48:54Z' }, { type: 'fact', reviewed_at: '2027-01-01T00:00:00Z' }])).toBe('2026-11-14T15:48:54Z');
    expect(latestTagAt([])).toBeNull();
  });
});
