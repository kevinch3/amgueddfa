import { describe, expect, it } from 'vitest';
import { approveVideoText, orFallback } from '../src/lib/admin';
import { changeHeadText, isCambio, keptCambios, timeLink, unreadable, videoCardRows } from '../src/lib/admin-video-card';
import { lineIdioma } from '../src/lib/transcript-draft';
import type { Cambio } from '../src/lib/video-corrections';
import { asTranscript } from '../src/lib/video-transcript';

const seg: [number, string][] = [[10, 'Benedicto de la competencia'], [20, 'hola mundo'], [30, 'adios']];
const cambios: Cambio[] = [
  { t: 10, antes: 'Benedicto de la competencia', texto: 'Veredicto de la competencia' },
  { t: 20.4, antes: 'hola mundo', quitar: true },
  { t: 25, texto: 'linea nueva', idioma: 'es' },
  { t: 30, antes: 'adios', idioma: 'cy' },
];

describe('videoCardRows', () => {
  it('one row per change with its kind, link and diff', () => {
    const rows = videoCardRows('abcdef12345', cambios, seg);
    expect(rows.map((r) => r.kind)).toEqual(['corregir', 'quitar', 'agregar', 'idioma']);
    expect(rows[0].link).toBe('https://www.youtube.com/watch?v=abcdef12345&t=10s');
    expect(rows[1].link).toBe('https://www.youtube.com/watch?v=abcdef12345&t=20s');
    expect(rows[0].diff.map((d) => d.op)).toEqual(['del', 'ins', 'same']);
    expect(rows.every((r) => !r.stale)).toBe(true);
  });
  it('warns when the line no longer reads antes, showing antes itself', () => {
    const rows = videoCardRows('abcdef12345', [cambios[0]], [[10, 'Veredicto de la competencia']]);
    expect(rows[0].stale).toBe(true);
    expect(rows[0].antes).toBe('Benedicto de la competencia');
  });
  it('shows the current line text, matching folded and within 2 s', () => {
    const rows = videoCardRows('abcdef12345', [{ t: 11.5, antes: 'benedicto, de la competencia', texto: 'x' }], seg);
    expect(rows[0].stale).toBe(false);
    expect(rows[0].antes).toBe('Benedicto de la competencia');
    expect(videoCardRows('abcdef12345', [{ t: 14, antes: 'benedicto de la competencia', texto: 'x' }], seg)[0].stale).toBe(true);
  });
  it('no file: no warning', () => {
    expect(videoCardRows('abcdef12345', [cambios[0]], null)[0].stale).toBe(false);
  });
  it('timeLink floors', () => expect(timeLink('abcdef12345', 61.9)).toContain('&t=61s'));
});

describe('the head of a change (after its time)', () => {
  // The line «hola mundo» is Welsh (the Welsh model heard it); the others Spanish.
  const tr = asTranscript({ src: 'reconstruida', lang: 'es', seg, fuentes: [['whisper_es'], ['cy'], ['whisper_es']] })!;
  const idiomaDe = (i: number) => lineIdioma(tr, i);
  it("says the kind once, and a language by name, from the line's own to the new one («Idioma · Idioma: es» before)", () => {
    const more: Cambio[] = [...cambios, { t: 20, antes: 'hola mundo', texto: 'Hola, mundo', idioma: 'es' }];
    expect(videoCardRows('abcdef12345', more, seg, idiomaDe).map(changeHeadText)).toEqual([
      'Corregir', 'Quitar', 'Agregar · Idioma: castellano', 'Idioma: castellano → galés', 'Corregir · Idioma: galés → castellano',
    ]);
  });
  it("names only the new language when the line's own is unknown (no file, or the line changed since)", () => {
    expect(changeHeadText(videoCardRows('abcdef12345', [cambios[3]], null)[0])).toBe('Idioma: galés');
    expect(changeHeadText(videoCardRows('abcdef12345', [cambios[3]], [[30, 'otra cosa']], () => 'es')[0])).toBe('Idioma: galés');
  });
});

describe('keptCambios', () => {
  it('keeps the ticked ones in order', () => {
    expect(keptCambios(cambios, [true, false, true, false])).toEqual([cambios[0], cambios[2]]);
    expect(keptCambios(cambios, [false, false, false, false])).toEqual([]);
  });
});

describe('approveVideoText', () => {
  const c = { id: 'cid-1', user_id: 'u', type: 'video_text', coleccion: 'chubut', year: 1990, item_id: null, payload: {}, created_at: '' } as const;
  it('sends only the kept changes as the override', async () => {
    const calls: unknown[][] = [];
    const client = { rpc: async (...a: unknown[]) => (calls.push(a), { error: null }) } as any;
    const r = await approveVideoText(c as any, [cambios[1]], client);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([['approve_contribution', { cid: 'cid-1', fills_gap: false, payload_override: { cambios: [cambios[1]] } }]]);
  });
  it('refuses an empty selection without calling', async () => {
    const client = { rpc: async () => { throw new Error('called'); } } as any;
    expect((await approveVideoText(c as any, [], client)).ok).toBe(false);
  });
});

// A crafted row (validation lets none through, but a direct insert could): one bad change must not throw in the card.
const bad: unknown[] = [
  null, 5, 'x', [], { t: 'x', texto: 'y' }, { t: Number.NaN, texto: 'y' }, { t: -1, texto: 'y' }, { t: 1, texto: 5 },
  { t: 1, antes: null, texto: 'y' }, { t: 1, antes: { a: 1 }, quitar: true }, { t: 1, idioma: 'en', texto: 'y' },
  { t: 1, antes: 'a', quitar: 'si' },
];

describe('isCambio', () => {
  it('takes the changes validation builds and nothing else', () => {
    for (const c of cambios) expect(isCambio(c)).toBe(true);
    expect(isCambio({ t: 0, antes: 'a', quitar: true })).toBe(true);
    for (const c of bad) expect(isCambio(c)).toBe(false);
  });
});

describe('a contribution with unreadable changes', () => {
  const mixed: unknown[] = [bad[0], cambios[0], bad[7], cambios[2], bad[8]];

  it('the card shows the readable changes at their own place and counts the rest', () => {
    const rows = videoCardRows('abcdef12345', mixed, seg);
    expect(rows.map((r) => [r.index, r.kind])).toEqual([[1, 'corregir'], [3, 'agregar']]);
    expect(videoCardRows('abcdef12345', bad, seg)).toEqual([]);
    expect(videoCardRows('abcdef12345', bad, null)).toEqual([]);
    expect(unreadable(mixed)).toBe(3);
    expect(unreadable(cambios)).toBe(0);
  });

  it('approval never sends an unreadable change, even ticked', () => {
    expect(keptCambios(mixed, mixed.map(() => true))).toEqual([cambios[0], cambios[2]]);
    expect(keptCambios(bad, bad.map(() => true))).toEqual([]);
  });
});

describe('orFallback', () => {
  it('what build makes, or the fallback when it throws (one bad card does not blank the queue)', () => {
    expect(orFallback(() => 1, () => 2)).toBe(1);
    const errors: unknown[] = [];
    expect(orFallback(() => { throw new Error('boom'); }, (e) => (errors.push(e), 2))).toBe(2);
    expect(String(errors[0])).toContain('boom');
  });
});
