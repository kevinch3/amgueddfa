import { describe, expect, it } from 'vitest';
import { editionMarkdown, frontMatter, itemMarkdown, nestHeadings } from '../src/lib/markdown';

describe('markdown twins', () => {
  it('frontMatter quotes strings as JSON (valid YAML) and keeps null', () => {
    expect(frontMatter({ a: 'x: "y"', b: 3, c: null, d: undefined, e: true })).toBe('---\na: "x: \\"y\\""\nb: 3\nc: null\ne: true\n---\n');
  });

  it('nestHeadings pushes headings one level down', () => {
    expect(nestHeadings('## Lunes\n1. Unawd\n### Grupo')).toBe('### Lunes\n1. Unawd\n#### Grupo');
  });

  it('editionMarkdown: unknown is not "not held"; facts carry fuente and contributor', () => {
    const md = editionMarkdown({
      name: 'Eisteddfod del Chubut', festival: 'chubut', year: 1865, url: 'https://amgueddfa.org/chubut/1865/',
      status: 'unknown', estado: 'none', stateText: 'Sin material', dataUrl: 'https://amgueddfa.org/datos/ediciones.json',
      facts: [{ label: 'Lugar', value: 'Punta Cuevas', fuente: 'Fuente: libro', by: 'Aportó Meirion Griffiths' }], docs: [], uploads: 0,
    });
    expect(md).toContain('realizada: null');
    expect(md).toContain('# Eisteddfod del Chubut 1865');
    expect(md).toContain('no se sabe');
    expect(md).toContain('- Lugar: Punta Cuevas (Fuente: libro · Aportó Meirion Griffiths)');
    expect(md).toContain('Todavía no hay documentos públicos');
    const held = editionMarkdown({ name: 'X', festival: 'chubut', year: 1937, url: 'u', status: 'held', estado: 'some', stateText: 's', dataUrl: 'd', facts: [], uploads: 2,
      docs: [{ title: 'Programa', category: 'Programa', url: 'https://amgueddfa.org/item/abc/', transcribed: true }] });
    expect(held).toContain('realizada: true');
    expect(held).toContain('- [Programa](https://amgueddfa.org/item/abc/) · Programa · transcrito');
    expect(held).toContain('- 2 imágenes aportadas por la comunidad');
  });

  it('itemMarkdown: rights always stated; transcription nested with its licence', () => {
    const base = { id: 'abc', title: 'Rhaglen 2012', festivalName: 'Eisteddfod del Chubut', festival: 'chubut', year: 2012, category: 'Programa',
      url: 'https://amgueddfa.org/item/abc/', editionUrl: 'https://amgueddfa.org/chubut/2012/', rights: 'Titulares originales', source: 'Asociación', sourceUrl: null,
      note: '', images: ['https://m/p1.webp'], transcriptionLicense: 'CC BY-SA 4.0' };
    const md = itemMarkdown({ ...base, transcription: '## Lunes\n1. Unawd' });
    expect(md).toContain('id: "abc"');
    expect(md).toContain('transcrito: true');
    expect(md).toContain('- Derechos del documento: Titulares originales');
    expect(md).toContain('## Transcripción');
    expect(md).toContain('### Lunes');
    expect(md).toContain('CC BY-SA 4.0');
    const bare = itemMarkdown({ ...base, transcription: null });
    expect(bare).not.toContain('## Transcripción');
    expect(bare).toContain('transcrito: false');
  });
});
