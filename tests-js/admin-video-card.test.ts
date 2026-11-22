import { describe, expect, it } from 'vitest';
import { approveVideoText } from '../src/lib/admin';
import { keptCambios, timeLink, videoCardRows } from '../src/lib/admin-video-card';
import type { Cambio } from '../src/lib/video-corrections';

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

describe('keptCambios', () => {
  it('keeps the ticked ones in order', () => {
    expect(keptCambios(cambios, [true, false, true, false])).toEqual([cambios[0], cambios[2]]);
    expect(keptCambios(cambios, [false, false, false, false])).toEqual([]);
  });
});

describe('approveVideoText', () => {
  const c = { id: 'cid-1', user_id: 'u', type: 'video_text', festival: 'chubut', year: 1990, item_id: null, payload: {}, created_at: '' } as const;
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
