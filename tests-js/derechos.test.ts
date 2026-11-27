import { describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import fuentes from '../src/data/fuentes.json';
import { COLECCIONES } from '../src/lib/colecciones';
import { LICENCIAS, derechosDe, licenciaDe, titularDe, type Declaracion } from '../src/lib/derechos';
import { itemSourceKey } from '../src/lib/fuentes';
import { isPublic } from '../src/lib/visibilidad';
import type { Item } from '../src/lib/types';

const catalog = (raw as { items: Item[] }).items;

// docs/reglas.md, rule 2: every record resolves to one rights statement with a known licence code.
describe('rights', () => {
  it('reads the licence of each credit line the archive writes', () => {
    const cases: [string, string][] = [
      ['© Llyfrgell Genedlaethol Cymru / The National Library of Wales · Creative Archive Licence', 'creative-archive'],
      ['Llyfrgell Genedlaethol Cymru, Papurau Newydd Cymru · statws hawlfraint: anhysbys (yn ôl y Llyfrgell)', 'desconocido'],
      ['CC BY-SA 4.0 · Gastón Cuello', 'cc-by-sa-4.0'],
      ['CC BY-SA 3.0 · Gastón Cuello', 'cc-by-sa-3.0'],
      ['© Amgueddfa Hanes y Wladfa, Gaiman · All Rights Reserved (reproduced by permission)', 'con-permiso'],
      ['Diario Jornada, Trelew (1954) · foto de la página impresa', 'titulares-originales'],
      ['Public domain · autor desconocido', 'dominio-publico'],
      ['© sus autores o propietarios; copia publicada por X en el grupo de Facebook «Recuerdos»; uso restringido hasta obtener permiso', 'titulares-originales'],
      ['Fotografía de autor no identificado, anterior a 1946; copia publicada por X en el grupo de Facebook «Recuerdos»', 'dominio-publico'],
      ['Documento de 1881; original en la Biblioteca Nacional de Gales (NLW MS 18219D); copia publicada por X', 'dominio-publico'],
      ['Documento de 1955; copia publicada por X', 'sin-declarar'],
      ['algo nuevo', 'sin-declarar'],
    ];
    for (const [text, code] of cases) expect(licenciaDe(text), text).toBe(code);
  });

  it('names the holder without the licence words', () => {
    expect(titularDe('CC BY-SA 4.0 · Gastón Cuello')).toBe('Gastón Cuello');
    expect(titularDe('© Amgueddfa Hanes y Wladfa, Gaiman · All Rights Reserved (reproduced by permission)')).toBe('Amgueddfa Hanes y Wladfa, Gaiman');
    expect(titularDe('Public domain · Fortunato Stillitani')).toBe('Fortunato Stillitani');
  });

  it('every credit line in the catalog has a known licence (add a rule to lib/derechos.ts for a new wording)', () => {
    for (const text of new Set(catalog.map((i) => (i.rights ?? '').trim()).filter(Boolean))) {
      expect(licenciaDe(text), text).not.toBe('sin-declarar');
    }
  });

  it('every public record resolves to a statement, falling back to its source and then its collection', () => {
    for (const i of catalog.filter(isPublic)) {
      const d = derechosDe(i);
      expect(d, i.id).not.toBeNull();
      expect(LICENCIAS, i.id).toContain(d!.licencia);
      expect(d!.licencia, i.id).not.toBe('sin-declarar');
    }
    const bare = { rights: '', festival: 'chubut', source_url: 'https://example.org/a', source_label: 'A' };
    expect(derechosDe(bare)?.origen).toBe('coleccion');
    expect(derechosDe(bare, { 'https://example.org/a': { licencia: 'con-permiso', titular: 'A' } })).toEqual({ licencia: 'con-permiso', titular: 'A', origen: 'fuente' });
    expect(derechosDe({ ...bare, festival: 'ninguna' })).toBeNull();
  });

  it('source statements and collection defaults use known codes, and each source statement names a real source', () => {
    const keys = new Set(catalog.map(itemSourceKey));
    for (const [k, d] of Object.entries(fuentes as Record<string, Declaracion>)) {
      expect(LICENCIAS, k).toContain(d.licencia);
      expect(d.titular, k).toBeTruthy();
      expect(keys.has(k), k).toBe(true);
    }
    for (const c of COLECCIONES) if (c.derechos_por_defecto) expect(LICENCIAS, c.id).toContain(c.derechos_por_defecto.licencia);
  });
});
