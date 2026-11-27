import type { Fecha } from '../src/lib/types';
import { describe, expect, it } from 'vitest';
import { affectedStates, changedItems, inScope, type IndexItem } from '../src/lib/placement';

const it0 = (over: Omit<Partial<IndexItem>, 'fecha'> & { fecha?: Partial<Fecha> }): IndexItem => ({
  id: 'a', title: 'Tapa', coleccion: 'chubut', tipo: 'programa', formato: 'image',
  restricted: false, thumb: null, ...over, fecha: { year: 1996, inferred: true, undated: false, ...over.fecha },
});

describe('placement', () => {
  it('inScope matches an edition tipo or a coleccion\'s general / undated list', () => {
    expect(inScope(it0({}), { coleccion: 'chubut', year: 1996, tipo: 'programa' })).toBe(true);
    expect(inScope(it0({}), { coleccion: 'chubut', year: 1986, tipo: 'programa' })).toBe(false);
    expect(inScope(it0({}), { coleccion: 'chubut', year: 1996, tipo: 'bases' })).toBe(false);
    expect(inScope(it0({ fecha: { undated: true, year: null } }), { coleccion: 'chubut', year: 'none', undated: true })).toBe(true);
    expect(inScope(it0({ fecha: { undated: true, year: null } }), { coleccion: 'chubut', year: 'none', undated: false })).toBe(false);
  });

  it('changedItems lists only items whose placement or badges moved', () => {
    const before = [it0({}), it0({ id: 'b' })];
    const after = [it0({ fecha: { inferred: false, year: 1986 } }), it0({ id: 'b' })];
    expect(changedItems(before, after).map((c) => c.after.id)).toEqual(['a']);
  });

  it('affectedStates recomputes the old and the new edition', () => {
    const before = [it0({}), it0({ id: 'p', formato: 'pdf', fecha: { year: 1986 } })];
    const after = [it0({ fecha: { year: 1986 } }), it0({ id: 'p', formato: 'pdf', fecha: { year: 1986 } })];
    const s = affectedStates(changedItems(before, after), after);
    expect(s.get('chubut:1996')).toBe('none');
    expect(s.get('chubut:1986')).toBe('full');
  });

  it('hidden items are out of every scope and count as a change', () => {
    expect(inScope(it0({ hidden: true }), { coleccion: 'chubut', year: 1996, tipo: 'programa' })).toBe(false);
    expect(inScope(it0({ fecha: { undated: true, year: null }, hidden: true }), { coleccion: 'chubut', year: 'none' })).toBe(false);
    expect(changedItems([it0({})], [it0({ hidden: true })]).map((c) => c.after.id)).toEqual(['a']);
  });
});
