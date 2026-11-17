import { describe, expect, it } from 'vitest';
import { correctionPayload, curationError, parseItems, type OverlayValues } from '../src/lib/curation';

const now: OverlayValues = { title: 'Tapa', category: 'programa', festival: 'chubut', year: 2022, rights: '', caption: 'Old', no_text: false, hidden: false };

describe('correctionPayload', () => {
  it('sends only what changed', () => {
    expect(correctionPayload(now, { ...now })).toEqual({});
    expect(correctionPayload(now, { ...now, category: 'programa-del-dia', no_text: true })).toEqual({ category: 'programa-del-dia', no_text: true });
  });
  it('trims, never sends an empty title or a missing year, and may clear rights and caption', () => {
    expect(correctionPayload(now, { ...now, title: '  ', year: null })).toEqual({});
    expect(correctionPayload(now, { ...now, title: ' Horarios ', caption: ' ' })).toEqual({ title: 'Horarios', caption: '' });
    expect(correctionPayload(now, { ...now, rights: '© X ' })).toEqual({ rights: '© X' });
  });
});

describe('parseItems', () => {
  it('reads ids separated by spaces, commas or lines, once each', () => {
    expect(parseItems('AAAAAAAAAAAA, bbbbbbbbbbbb\naaaaaaaaaaaa')).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(parseItems('')).toEqual([]);
    expect(parseItems('aaaaaaaaaaaa nope')).toBeNull();
  });
});

describe('curationError', () => {
  it('maps database errors to messages', () => {
    expect(curationError({ message: 'item_in_other_document' })).toEqual({ ok: false, key: 'admin_item.error_otro_documento' });
    expect(curationError({ message: 'new row violates check constraint "transcriptions_private_winners"', code: '23514' })).toEqual({ ok: false, key: 'admin_item.error_ganadores_privados' });
    expect(curationError({ message: 'not_admin' })).toEqual({ ok: false, key: 'admin.error.no_admin' });
    expect(curationError({ message: 'fetch failed' })).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });
});
