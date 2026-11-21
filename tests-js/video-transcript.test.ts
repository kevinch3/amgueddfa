import { describe, expect, it } from 'vitest';
import { asTranscript, creditos, findLines, fmtTime, fold, letraAt, lineAt } from '../src/lib/video-transcript';

const seg: [number, string][] = [[2, 'Galwn ar yr unawdwyr'], [10.5, 'Hyd fedd hi gâr yn gywir'], [24, 'Canción de Glyndŵr'], [38, 'Veredicto']];

describe('video transcript', () => {
  it('finds the line playing at a time', () => {
    expect(lineAt(seg, 0)).toBe(-1);
    expect(lineAt(seg, 2)).toBe(0);
    expect(lineAt(seg, 10.4)).toBe(0);
    expect(lineAt(seg, 10.5)).toBe(1);
    expect(lineAt(seg, 9999)).toBe(3);
    expect(lineAt([], 5)).toBe(-1);
  });

  it('searches without accents or case', () => {
    expect(fold('Glyndŵr Canción')).toBe('glyndwr cancion');
    expect(findLines(seg, 'glyndwr')).toEqual([2]);
    expect(findLines(seg, 'CANCION')).toEqual([2]);
    expect(findLines(seg, 'gar')).toEqual([1]);
    expect(findLines(seg, '  ')).toEqual([]);
  });

  it('formats times', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(75.9)).toBe('1:15');
    expect(fmtTime(3725)).toBe('1:02:05');
  });

  it('accepts only real transcription files', () => {
    expect(asTranscript({ src: 'youtube', lang: 'es', seg })?.seg).toHaveLength(4);
    expect(asTranscript({ src: 'other', seg })).toBeNull();
    expect(asTranscript({ src: 'whisper', seg: [] })).toBeNull();
    expect(asTranscript(null)).toBeNull();
  });

  it('accepts the reconstructed text with its per-line sources', () => {
    const tr = asTranscript({ src: 'reconstruida', lang: 'es', seg, fuentes: [['yt_es'], ['letra'], ['yt_es', 'whisper_es'], ['yt_es']] })!;
    expect(tr.src).toBe('reconstruida');
    expect(tr.fuentes?.[2]).toEqual(['yt_es', 'whisper_es']);
    expect(asTranscript({ src: 'reconstruida', lang: 'es', seg, fuentes: [['yt_es']] })!.fuentes).toBeUndefined();
    expect(asTranscript({ src: 'inventada', lang: 'es', seg })).toBeNull();
  });

  it('keeps the aligned lyric spans and finds the one a line is in', () => {
    const tr = asTranscript({ src: 'youtube', lang: 'es', seg, letras: [{ desde: 20, hasta: 30, titulo: 'Rosa', autor: 'Trad.', idioma: 'pt' }, { bad: 1 }] })!;
    expect(tr.letras).toHaveLength(1);
    expect(letraAt(tr, 24)?.idioma).toBe('pt');
    expect(letraAt(tr, 30)).toBeNull();
    expect(asTranscript({ src: 'youtube', lang: 'es', seg })!.letras).toBeUndefined();
  });
});

describe('lyric credits', () => {
  const l = (desde: number, titulo: string, extra = {}) => ({ desde, hasta: desde + 9, titulo, autor: 'A', idioma: 'es', ...extra });
  it('gives one credit per piece, in the order sung, with its rights and a link to its source', () => {
    const tr = asTranscript({
      src: 'reconstruida', lang: 'es', seg: [[1, 'x']],
      letras: [
        l(500, 'Zamba', { derechos: 'Dominio público', fuente: 'https://ejemplo.org/zamba, aportado por Alguien' }),
        l(100, 'Gato', { fuente: 'Cancionero del coro' }),
        l(900, 'Zamba', { derechos: 'Dominio público', fuente: 'https://ejemplo.org/zamba, aportado por Alguien' }),
      ],
    })!;
    expect(creditos(tr)).toEqual([
      { titulo: 'Gato', autor: 'A', derechos: '', fuente: { texto: 'Cancionero del coro' } },
      { titulo: 'Zamba', autor: 'A', derechos: 'Dominio público', fuente: { href: 'https://ejemplo.org/zamba', host: 'ejemplo.org', texto: 'aportado por Alguien' } },
    ]);
  });
  it('is empty without lyrics', () => {
    expect(creditos(asTranscript({ src: 'youtube', lang: 'es', seg: [[1, 'x']] })!)).toEqual([]);
  });
});
