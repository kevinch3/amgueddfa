import { describe, expect, it } from 'vitest';
import { asTranscript, findLines, fmtTime, fold, lineAt } from '../src/lib/video-transcript';

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
});
