import { describe, expect, it } from 'vitest';
import { fetchReleasedText, releasedSource } from '../src/lib/released';

const pub = (p: string) => `https://cdn.test/media/${p}`;

describe('releasedSource', () => {
  it('pages when the catalog lists any', () => {
    expect(releasedSource('abc123def456', ['p01.webp', 'p02.webp'], pub)).toEqual({
      kind: 'pages',
      urls: ['https://cdn.test/media/released/abc123def456/p01.webp', 'https://cdn.test/media/released/abc123def456/p02.webp'],
    });
  });

  it('text.txt when there are no pages', () => {
    expect(releasedSource('abc123def456', [], pub)).toEqual({ kind: 'text', url: 'https://cdn.test/media/released/abc123def456/text.txt' });
  });
});

describe('fetchReleasedText', () => {
  it('returns the trimmed text, or null when missing, empty or offline', async () => {
    expect(await fetchReleasedText('u', async () => ({ ok: true, text: async () => '  <b>Ganó Ana</b>\n' }))).toBe('<b>Ganó Ana</b>');
    expect(await fetchReleasedText('u', async () => ({ ok: false, text: async () => 'not found' }))).toBeNull();
    expect(await fetchReleasedText('u', async () => ({ ok: true, text: async () => '  ' }))).toBeNull();
    expect(await fetchReleasedText('u', async () => { throw new Error('offline'); })).toBeNull();
  });
});
