import { describe, expect, it } from 'vitest';
import { parseTranscription, transcriptionFor, transcribedIds } from '../src/lib/transcripciones';

const SAMPLE = `## Literatura · Llenyddiaeth

### Adultos
1. Penillion syml: «Ar lan y môr».
12a. Cuento: tema libre.
- Poesía en castellano: tema libre.

## Jurados · Beirniaid
- Música: Clydwyn Jones.
Texto suelto.
`;

describe('transcripciones', () => {
  it('parses sections, groups, numbered and unnumbered competitions', () => {
    expect(parseTranscription(SAMPLE)).toEqual([
      { type: 'section', text: 'Literatura · Llenyddiaeth' },
      { type: 'group', text: 'Adultos' },
      { type: 'item', n: '1', text: 'Penillion syml: «Ar lan y môr».' },
      { type: 'item', n: '12a', text: 'Cuento: tema libre.' },
      { type: 'item', n: null, text: 'Poesía en castellano: tema libre.' },
      { type: 'section', text: 'Jurados · Beirniaid' },
      { type: 'item', n: null, text: 'Música: Clydwyn Jones.' },
      { type: 'text', text: 'Texto suelto.' },
    ]);
  });

  it('ignores blank lines and Windows line ends', () => {
    expect(parseTranscription('## A\r\n\r\n1. b\r\n')).toEqual([
      { type: 'section', text: 'A' },
      { type: 'item', n: '1', text: 'b' },
    ]);
  });

  it('every committed transcription belongs to a catalog item and starts with a section', () => {
    for (const id of transcribedIds()) {
      const blocks = parseTranscription(transcriptionFor(id) ?? '');
      expect(blocks[0]?.type, id).toBe('section');
      expect(blocks.some((b) => b.type === 'item'), id).toBe(true);
    }
  });

  it('returns null for items without a transcription', () => {
    expect(transcriptionFor('000000000000')).toBeNull();
  });
});
