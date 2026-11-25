import { describe, expect, it } from 'vitest';
import { playMap } from '../src/lib/markers';

describe('markers', () => {
  it('maps each competition to its start in the first video (in order) that marks it; ceremonies and other videos stay out', () => {
    const files = {
      A: { auto: true, markers: [[900, '26', 'Voz femenina', 'comp'], [3000, 'corona', 'Ceremonia de la Corona', 'ceremonia']] },
      B: { auto: true, markers: [[100, '26', 'Voz femenina', 'comp'], [200, '64', 'Cuarteto', 'comp']] },
      C: { auto: true, markers: [[5, '99', 'Otro', 'comp']] },
    };
    expect(playMap(files, ['A', 'B'])).toEqual({ '26': { v: 'A', t: 900 }, '64': { v: 'B', t: 200 } });
  });

  it('ignores malformed files', () => {
    expect(playMap({ A: { markers: 'x' } as never, B: null as never }, ['A', 'B'])).toEqual({});
  });
});

describe('playMap with performance clips (scripts/visual/clip_comps.py)', () => {
  it("keeps a session's chapter when a clip of the same competition comes later in the list", () => {
    const files = { ses: { auto: true, markers: [[3600, '22', 'Solo', 'comp']] as [number, string, string, string][] },
                    clip: { auto: true, markers: [[0, '22', 'Solo', 'comp']] as [number, string, string, string][] } };
    expect(playMap(files, ['ses', 'clip'])['22']).toEqual({ v: 'ses', t: 3600 });
  });
  it('links a competition no session marks to its clip, from the start', () => {
    const files = { clip: { auto: true, markers: [[0, '51', 'Coro', 'comp']] as [number, string, string, string][] } };
    expect(playMap(files, ['ses', 'clip'])['51']).toEqual({ v: 'clip', t: 0 });
  });
});
