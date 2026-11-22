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
    expect(vectors.length).toBeGreaterThanOrEqual(12);
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
