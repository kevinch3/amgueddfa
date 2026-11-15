import { describe, expect, it } from 'vitest';
import { affectedStates, changedItems, inScope, type IndexItem } from '../src/lib/placement';

const it0 = (over: Partial<IndexItem>): IndexItem => ({
  id: 'a', title: 'Tapa', festival: 'chubut', year: 1996, undated: false, category: 'programa', kind: 'image',
  restricted: false, year_inferred: true, thumb: null, ...over,
});

describe('placement', () => {
  it('inScope matches an edition category or a festival\'s general / undated list', () => {
    expect(inScope(it0({}), { festival: 'chubut', year: 1996, category: 'programa' })).toBe(true);
    expect(inScope(it0({}), { festival: 'chubut', year: 1986, category: 'programa' })).toBe(false);
    expect(inScope(it0({}), { festival: 'chubut', year: 1996, category: 'bases' })).toBe(false);
    expect(inScope(it0({ year: null, undated: true }), { festival: 'chubut', year: 'none', undated: true })).toBe(true);
    expect(inScope(it0({ year: null, undated: true }), { festival: 'chubut', year: 'none', undated: false })).toBe(false);
  });

  it('changedItems lists only items whose placement or badges moved', () => {
    const before = [it0({}), it0({ id: 'b' })];
    const after = [it0({ year: 1986, year_inferred: false }), it0({ id: 'b' })];
    expect(changedItems(before, after).map((c) => c.after.id)).toEqual(['a']);
  });

  it('affectedStates recomputes the old and the new edition', () => {
    const before = [it0({}), it0({ id: 'p', kind: 'pdf', year: 1986 })];
    const after = [it0({ year: 1986 }), it0({ id: 'p', kind: 'pdf', year: 1986 })];
    const s = affectedStates(changedItems(before, after), after);
    expect(s.get('chubut:1996')).toBe('none');
    expect(s.get('chubut:1986')).toBe('full');
  });

  it('hidden items are out of every scope and count as a change', () => {
    expect(inScope(it0({ hidden: true }), { festival: 'chubut', year: 1996, category: 'programa' })).toBe(false);
    expect(inScope(it0({ year: null, undated: true, hidden: true }), { festival: 'chubut', year: 'none' })).toBe(false);
    expect(changedItems([it0({})], [it0({ hidden: true })]).map((c) => c.after.id)).toEqual(['a']);
  });
});
