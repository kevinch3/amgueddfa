import { describe, expect, it } from 'vitest';
import { indexDocs, readDoc } from '../src/lib/docmd';

describe('docmd: one transcription per document', () => {
  it('a file without front matter covers only its own item', () => {
    expect(readDoc('aaaaaaaaaaaa', '## A\n1. b\n')).toEqual({ id: 'aaaaaaaaaaaa', items: ['aaaaaaaaaaaa'], text: '## A\n1. b\n' });
  });

  it('front matter lists every image of the document, the file id first', () => {
    const d = readDoc('aaaaaaaaaaaa', '---\nitems: bbbbbbbbbbbb, aaaaaaaaaaaa cccccccccccc\n---\n## A\n1. b\n');
    expect(d.items).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc']);
    expect(d.text).toBe('## A\n1. b\n');
  });

  it('every member finds the same document; the document list has it once', () => {
    const { byMember, docs } = indexDocs({
      '../data/x/aaaaaaaaaaaa.md': '---\nitems: aaaaaaaaaaaa bbbbbbbbbbbb\n---\n## A\n1. b\n',
      '../data/x/dddddddddddd.md': '## C\n1. d\n',
    });
    expect(byMember.get('bbbbbbbbbbbb')).toBe(byMember.get('aaaaaaaaaaaa'));
    expect(docs.map((d) => d.id)).toEqual(['aaaaaaaaaaaa', 'dddddddddddd']);
  });

  it('an item claimed by two documents is an error', () => {
    expect(() => indexDocs({
      '../x/aaaaaaaaaaaa.md': '---\nitems: bbbbbbbbbbbb\n---\n## A\n',
      '../x/bbbbbbbbbbbb.md': '## B\n',
    })).toThrow(/bbbbbbbbbbbb/);
  });
});
