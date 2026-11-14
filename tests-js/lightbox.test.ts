import { describe, expect, it } from 'vitest';
import { clamp, parsePageHash } from '../src/scripts/lightbox';

describe('lightbox page links', () => {
  it('reads #pN as a 0-based page inside the document', () => {
    expect(parsePageHash('#p1', 5)).toBe(0);
    expect(parsePageHash('#p5', 5)).toBe(4);
    expect(parsePageHash('#p6', 5)).toBeNull();
    expect(parsePageHash('#p0', 5)).toBeNull();
    expect(parsePageHash('#p01', 5)).toBeNull();
    expect(parsePageHash('#aportes', 5)).toBeNull();
    expect(parsePageHash('', 5)).toBeNull();
  });

  it('clamps an index to the pages', () => {
    expect(clamp(-1, 3)).toBe(0);
    expect(clamp(1, 3)).toBe(1);
    expect(clamp(7, 3)).toBe(2);
  });
});
