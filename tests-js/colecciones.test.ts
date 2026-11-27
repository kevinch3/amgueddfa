import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import videosData from '../src/data/videos.json';
import { COLECCIONES, FESTIVAL_IDS, FORMAS, GRUPOS, PUBLIC_WINNERS, TIPOS, VIDEO_TEXT_FESTIVALS, VISIBILIDADES, coleccion } from '../src/lib/colecciones';
import { EISTEDDFOD_SEGMENTS, url } from '../src/lib/paths';
import { LOCALES, LOCALE_INFO } from '../src/lib/i18n';
import { CATEGORIES, FESTIVALS } from '../src/lib/contrib';
import { EDITABLE_FESTIVALS } from '../src/lib/transcript-draft';
import { PUBLIC_WINNERS as WINNERS_EXPORT } from '../scripts/export_approved.mjs';
import type { Item } from '../src/lib/types';

const messages = (l: (typeof LOCALES)[number]) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'src', 'i18n', `${LOCALE_INFO[l].tag}.json`), 'utf8'));

// docs/reglas.md, rule 1: a collection exists only as an entry in src/data/colecciones.json.
describe('collection list', () => {
  it('ids are unique, lower-case words, and every field holds a known value', () => {
    const ids = COLECCIONES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COLECCIONES) {
      expect(c.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(GRUPOS, c.id).toContain(c.grupo);
      expect(FORMAS, c.id).toContain(c.forma);
      expect(VISIBILIDADES, c.id).toContain(c.visibilidad_por_defecto);
      expect(c.tipos.length, c.id).toBeGreaterThan(0);
      for (const tp of c.tipos) expect(TIPOS, `${c.id}: ${tp}`).toContain(tp);
      expect(typeof c.ganadores_publicos, c.id).toBe('boolean');
      expect(typeof c.texto_de_videos, c.id).toBe('boolean');
    }
  });

  it('a collection id never collides with a page of its group or a language', () => {
    for (const c of COLECCIONES) {
      expect(['item', 'general', 'buscar', 'tareas', 'ranking', 'contribuir', 'datos', 'fuente'], c.id).not.toContain(c.id);
      expect(LOCALES as readonly string[], c.id).not.toContain(c.id);
    }
  });

  // Rule 3: a type is translated in every language before any record uses it.
  it('every type and every collection has its name in all 7 languages', () => {
    for (const l of LOCALES) {
      const m = messages(l);
      for (const tp of TIPOS) expect(m.categorias?.[tp], `${l} categorias.${tp}`).toBeTruthy();
      for (const c of COLECCIONES) {
        expect(m.festivales?.[c.id], `${l} festivales.${c.id}`).toBeTruthy();
        expect(m.festivales_cy?.[c.id], `${l} festivales_cy.${c.id}`).toBeTruthy();
      }
    }
  });

  it('every catalog item and video belongs to a listed collection, with a type that collection uses', () => {
    for (const i of (raw as { items: Item[] }).items) {
      const c = coleccion(i.festival);
      expect(c, i.id).toBeDefined();
      expect(c!.tipos, `${i.id} ${i.category}`).toContain(i.category);
    }
    for (const v of (videosData as { videos: { id: string; festival: string }[] }).videos) {
      expect(coleccion(v.festival)?.tipos, v.id).toContain('video');
    }
  });

  it('the festival lists of the site and the scripts all come from it', () => {
    expect(FESTIVALS).toEqual(FESTIVAL_IDS);
    expect(FESTIVAL_IDS).toEqual(['chubut', 'juventud', 'mimosa', 'trevelin']);
    expect([...PUBLIC_WINNERS]).toEqual(['chubut', 'trevelin']);
    expect(WINNERS_EXPORT).toEqual([...PUBLIC_WINNERS]);
    expect([...EDITABLE_FESTIVALS]).toEqual([...VIDEO_TEXT_FESTIVALS]);
    for (const f of FESTIVAL_IDS) expect(EISTEDDFOD_SEGMENTS.has(f), f).toBe(true);
    expect(url('chubut/1937/', 'es')).toBe('/eisteddfod/chubut/1937/');
  });

  it("the contribution form's categories are the document types every festival uses", () => {
    for (const c of COLECCIONES) for (const cat of CATEGORIES) expect(c.tipos, `${c.id} ${cat}`).toContain(cat);
  });
});
