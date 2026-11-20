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
