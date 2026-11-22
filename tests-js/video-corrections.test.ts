import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCorrections, foldLine, type CorrectionRow } from '../src/lib/video-corrections';

// The same vectors run in tests/test_video_corrections.py against scripts/video_corrections.py.
const DIR = join(__dirname, '..', 'tests', 'fixtures', 'video-corrections');

type Vector = {
  about: string;
  transcript: { lang: string; seg: [number, string][]; fuentes: string[][]; idiomas?: string[] };
  rows: CorrectionRow[];
  expected: { seg: [number, string][]; fuentes: string[][]; idiomas?: string[] };
  sinAnclar: [string, number, string][];
  applied: string[];
  autores?: Record<string, string[]>;
};

const vectors = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Vector] as const);

describe('video corrections: shared vectors', () => {
  it('finds every vector', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(17);
  });

  it.each(vectors)('%s', (_, v) => {
    const before = structuredClone(v.transcript);
    const out = applyCorrections(v.transcript, v.rows);
    expect(out.tr.seg).toEqual(v.expected.seg);
    expect(out.tr.fuentes).toEqual(v.expected.fuentes);
    expect('idiomas' in out.tr).toBe('idiomas' in v.expected);
    expect(out.tr.idiomas).toEqual(v.expected.idiomas);
    expect(out.sinAnclar.map((s) => [s.id, s.cambio.t, s.motivo])).toEqual(v.sinAnclar);
    expect(out.applied).toEqual(v.applied);
    if (v.autores) expect(out.autores).toEqual(v.autores);
    expect(v.transcript).toEqual(before);
  });
});

describe('video corrections', () => {
  it('folds case, accents, Welsh circumflexes and punctuation', () => {
    expect(foldLine('¡Gracias, Señor ŵ!')).toBe('gracias senor w');
    expect(foldLine('  Côr   Meibion—Gaiman ')).toBe('cor meibion gaiman');
    expect(foldLine('♪ ♪')).toBe('');
  });

  it("keeps the file's other fields and adds nothing without rows", () => {
    const tr = { src: 'reconstruida' as const, lang: 'es', seg: [[1, 'Hola']] as [number, string][], fuentes: [['yt_es']],
      letras: [{ desde: 5, hasta: 9, titulo: 'Calon Lân', autor: 'Gwyrosydd', idioma: 'cy' }] };
    const out = applyCorrections(tr, []);
    expect(out.tr).toEqual(tr);
    expect(out).toMatchObject({ applied: [], sinAnclar: [], autores: {} });
  });

  it('reports a change it cannot read instead of dropping it', () => {
    const row = { id: 'r', reviewed_at: '2026-11-22T10:00:00+00:00', payload: { video: { id: 'v' },
      cambios: [{ t: Number.NaN, antes: 'Hola', texto: 'Chau' }, { t: 3, texto: '  ' }] } };
    const out = applyCorrections({ lang: 'es', seg: [[1, 'Hola']], fuentes: [['yt_es']] }, [row]);
    expect(out.tr.seg).toEqual([[1, 'Hola']]);
    expect(out.sinAnclar.map((s) => s.motivo)).toEqual(['sin_linea', 'sin_linea']);
  });
});

// The player (TypeScript only): rows already in the file (its `correcciones`) are not applied again, but leave the
// traces they left at the export, so a later duplicate is reported instead of landing on a twin line.
describe('video corrections: rows the export already baked', () => {
  const row = (id: string, at: string, display_name: string, cambios: CorrectionRow['payload']['cambios']): CorrectionRow =>
    ({ id, reviewed_at: `2026-11-22T${at}:00+00:00`, display_name, payload: { video: { id: 'TESTVIDEO01' }, cambios } });
  const ana = row('r1', '10:00', 'Ana', [
    { t: 31, antes: '¡Bravo!', quitar: true },
    { t: 61, antes: '¡Bravo!', texto: '¡Muy bien!' },
    { t: 90, antes: '¡Bravo!', quitar: true },
  ]);
  // twin-duplicate.json's machine text after the export applied Ana's row.
  const file = {
    lang: 'es',
    seg: [[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo!'], [61, '¡Muy bien!'], [90, '¡Bravo!']] as [number, string][],
    fuentes: [['whisper_es'], ['whisper_es'], ['whisper_es'], ['whisper_es', 'colab'], ['whisper_es']],
    correcciones: ['r1'],
  };
  const baked = new Set(['r1']);

  it('reports a duplicate approved after the export and leaves the twin lines alone', () => {
    const bruno = row('r2', '11:00', 'Bruno', [
      { t: 31, antes: '¡Bravo!', quitar: true },
      { t: 61, antes: '¡Bravo!', texto: '¡Excelente!' },
      { t: 90, antes: '¡Bravo!', quitar: true },
    ]);
    const out = applyCorrections(file, [ana, bruno], { baked });
    expect(out.tr.seg).toEqual(file.seg);
    expect(out.tr.fuentes).toEqual(file.fuentes);
    expect(out.sinAnclar.map((s) => [s.id, s.cambio.t, s.motivo])).toEqual([['r2', 31, 'sin_linea'], ['r2', 61, 'sin_linea'], ['r2', 90, 'sin_linea']]);
    expect(out.applied).toEqual([]);
    expect(out.autores).toEqual({});
  });

  it('applies a new row that does not repeat it, and does not apply the baked row again', () => {
    const carla = row('r3', '12:00', 'Carla', [
      { t: 33, antes: 'Muy bien', texto: 'Muy bien, gracias' },
      { t: 61, antes: '¡Muy bien!', texto: '¡Muy bien, Ana!' },
    ]);
    const out = applyCorrections(file, [ana, carla], { baked });
    expect(out.tr.seg).toEqual([[30, '¡Bravo!'], [33, 'Muy bien, gracias'], [60, '¡Bravo!'], [61, '¡Muy bien, Ana!'], [90, '¡Bravo!']]);
    expect(out.tr.fuentes).toEqual([['whisper_es'], ['whisper_es', 'colab'], ['whisper_es'], ['whisper_es', 'colab'], ['whisper_es']]);
    expect(out.sinAnclar).toEqual([]);
    expect(out.applied).toEqual(['r3']);
    expect(out.autores).toEqual({ 1: ['Carla'], 3: ['Carla'] });
  });

  it('without the option, the same rows would land on the twin (why the player passes it)', () => {
    expect(applyCorrections(file, [ana], {}).tr.seg).toEqual([[33, 'Muy bien'], [60, '¡Muy bien!'], [61, '¡Muy bien!']]);
  });

  it('follows a chain of baked rewrites, so a stale duplicate of the first is reported too', () => {
    const tr = { lang: 'es', seg: [[10, 'Buenas noches'], [11, 'Buenas noches, Trelew']] as [number, string][],
      fuentes: [['yt_es'], ['yt_es', 'colab']] };
    const rows = [
      row('a', '10:00', 'Ana', [{ t: 11, antes: 'Buenas noches', texto: 'Buenas noches, Gaiman' }]),
      row('b', '11:00', 'Bruno', [{ t: 11, antes: 'Buenas noches, Gaiman', texto: 'Buenas noches, Trelew' }]),
      row('c', '12:00', 'Carla', [{ t: 11, antes: 'Buenas noches', texto: 'Buenas noches a todos' }]),
    ];
    const out = applyCorrections(tr, rows, { baked: new Set(['a', 'b']) });
    expect(out.tr.seg).toEqual(tr.seg);
    expect(out.sinAnclar.map((s) => [s.id, s.cambio.t])).toEqual([['c', 11]]);
    // The same rows from the machine text (what the next export does) report it too.
    const machine = { lang: 'es', seg: [[10, 'Buenas noches'], [11, 'Buenas noches']] as [number, string][], fuentes: [['yt_es'], ['yt_es']] };
    const full = applyCorrections(machine, rows);
    expect(full.tr.seg).toEqual(tr.seg);
    expect(full.sinAnclar.map((s) => [s.id, s.cambio.t])).toEqual([['c', 11]]);
  });

  it.each([
    ['rewrote', { t: 11, antes: 'Gaiman', texto: 'Trelew' }, 'Buenas noches Trelew'],
    ['removed', { t: 11, antes: 'Gaiman', quitar: true }, 'Buenas noches'],
  ] as const)('follows a chain where a later baked change %s part of an earlier one\'s words', (_, later, shown) => {
    const rows = [
      row('a', '10:00', 'Ana', [{ t: 11, antes: 'Buenas noches', texto: 'Buenas noches Gaiman' }]),
      row('b', '11:00', 'Bruno', [later]),
      row('c', '12:00', 'Carla', [{ t: 11, antes: 'Buenas noches', texto: 'Buenas noches a todos' }]),
    ];
    const tr = { lang: 'es', seg: [[10, 'Buenas noches'], [11, shown]] as [number, string][], fuentes: [['yt_es'], ['yt_es', 'colab']] };
    const out = applyCorrections(tr, rows, { baked: new Set(['a', 'b']) });
    expect(out.tr.seg).toEqual(tr.seg);
    expect(out.sinAnclar.map((s) => [s.id, s.cambio.t])).toEqual([['c', 11]]);
    // What the next export makes of the same rows from the machine text.
    const machine = { lang: 'es', seg: [[10, 'Buenas noches'], [11, 'Buenas noches']] as [number, string][], fuentes: [['yt_es'], ['yt_es']] };
    const full = applyCorrections(machine, rows);
    expect(full.tr.seg).toEqual(tr.seg);
    expect(full.sinAnclar.map((s) => [s.id, s.cambio.t])).toEqual([['c', 11]]);
  });

  it('leaves no trace for a baked change that did not land, nor for one that only fixed case or marks', () => {
    // The file after the export: Ana's first change found no line (the export listed it in sin_anclar), her second
    // only capitalised line 21; line 20 is its twin.
    const tr = { lang: 'es', seg: [[20, 'Hola'], [21, 'Hola']] as [number, string][], fuentes: [['yt_es'], ['yt_es', 'colab']] };
    const rows = [
      row('a', '10:00', 'Ana', [{ t: 21, antes: 'Chau', texto: 'Adiós' }, { t: 21, antes: 'hola', texto: 'Hola' }]),
      row('b', '11:00', 'Bruno', [{ t: 21, texto: 'Chau' }]),
      row('c', '12:00', 'Carla', [{ t: 21, antes: 'Chau', texto: 'Chau, chau' }, { t: 21, antes: 'hola', texto: 'Hola, Trevelin' }]),
    ];
    const out = applyCorrections(tr, rows, { baked: new Set(['a']) });
    expect(out.tr.seg).toEqual([[20, 'Hola'], [21, 'Hola, Trevelin'], [21, 'Chau, chau']]);
    expect(out.applied).toEqual(['b', 'c']);
    expect(out.sinAnclar).toEqual([]);
    // What the next export makes of the same rows from the machine text.
    const full = applyCorrections({ lang: 'es', seg: [[20, 'Hola'], [21, 'hola']], fuentes: [['yt_es'], ['yt_es']] }, rows);
    expect(full.tr.seg).toEqual(out.tr.seg);
  });
});
