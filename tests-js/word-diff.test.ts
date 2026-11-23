import { describe, expect, it } from 'vitest';
import { wordDiff } from '../src/lib/word-diff';

describe('wordDiff', () => {
  it('marks the changed word', () => {
    expect(wordDiff('Benedicto de la competencia', 'Veredicto de la competencia')).toEqual([
      { op: 'del', text: 'Benedicto' },
      { op: 'ins', text: 'Veredicto' },
      { op: 'same', text: 'de la competencia' },
    ]);
  });
  it('equal text is one same run', () => {
    expect(wordDiff('a b', 'a b')).toEqual([{ op: 'same', text: 'a b' }]);
  });
  it('handles insertions and deletions', () => {
    expect(wordDiff('a c', 'a b c')).toEqual([{ op: 'same', text: 'a' }, { op: 'ins', text: 'b' }, { op: 'same', text: 'c' }]);
    expect(wordDiff('a b c', 'a c')).toEqual([{ op: 'same', text: 'a' }, { op: 'del', text: 'b' }, { op: 'same', text: 'c' }]);
  });
  it('empty sides', () => {
    expect(wordDiff('', 'x y')).toEqual([{ op: 'ins', text: 'x y' }]);
    expect(wordDiff('x y', '')).toEqual([{ op: 'del', text: 'x y' }]);
    expect(wordDiff('', '')).toEqual([]);
  });
});
