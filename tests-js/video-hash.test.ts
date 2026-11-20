import { describe, expect, it } from 'vitest';
import { parseVideoHash, videoHash } from '../src/lib/video-hash';

describe('video hash', () => {
  it('reads a video and its second', () => {
    expect(parseVideoHash('#v=h5zX7SaZJt8&t=98')).toEqual({ id: 'h5zX7SaZJt8', t: 98 });
    expect(parseVideoHash('v=-0VtD_5HIlA')).toEqual({ id: '-0VtD_5HIlA', t: 0 });
    expect(parseVideoHash('#t=12.7&v=h5zX7SaZJt8')).toEqual({ id: 'h5zX7SaZJt8', t: 12 });
  });

  it('is null for other hashes and bad ids; a bad time is the start', () => {
    for (const h of ['', '#', '#aportar', '#v=', '#v=a b', '#v="><script>']) expect(parseVideoHash(h)).toBeNull();
    expect(parseVideoHash('#v=h5zX7SaZJt8&t=x')).toEqual({ id: 'h5zX7SaZJt8', t: 0 });
    expect(parseVideoHash('#v=h5zX7SaZJt8&t=-4')).toEqual({ id: 'h5zX7SaZJt8', t: 0 });
  });

  it('writes what it reads', () => {
    expect(videoHash('h5zX7SaZJt8', 98.6)).toBe('#v=h5zX7SaZJt8&t=98');
    expect(videoHash('h5zX7SaZJt8')).toBe('#v=h5zX7SaZJt8');
    expect(parseVideoHash(videoHash('-0VtD_5HIlA', 5))).toEqual({ id: '-0VtD_5HIlA', t: 5 });
  });
});
