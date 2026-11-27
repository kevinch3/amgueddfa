import { describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import { COLECCIONES } from '../src/lib/colecciones';
import { isListed, isPublic, stricter, visibleAs } from '../src/lib/visibilidad';
import { pageUrls, thumbUrl } from '../src/lib/catalog';
import type { Item } from '../src/lib/types';

const catalog = (raw as { items: Item[] }).items;

// docs/reglas.md, rule 5: nothing is public unless its record says so.
describe('visibility', () => {
  it('the stricter level wins, and the old restricted flag can only restrict', () => {
    expect(stricter('publico', 'solo_ficha')).toBe('solo_ficha');
    expect(visibleAs({ visibilidad: 'publico', restricted: true })).toBe('solo_ficha');
    expect(visibleAs({ visibilidad: 'privado', restricted: false })).toBe('privado');
    expect(visibleAs({ restricted: false })).toBe('publico');
    expect(visibleAs({ visibilidad: 'raro' as never, restricted: true })).toBe('solo_ficha');
    expect(isListed({ visibilidad: 'privado' })).toBe(false);
    expect(isPublic({ visibilidad: 'solo_ficha' })).toBe(false);
  });

  it('every catalog record carries a level, in step with the old flag, and none is private', () => {
    for (const i of catalog) {
      expect(['publico', 'solo_ficha'], i.id).toContain(i.visibilidad);
      expect(i.restricted, i.id).toBe(i.visibilidad !== 'publico');
    }
  });

  it('results lists are never public without a release date', () => {
    for (const i of catalog.filter((x) => x.category === 'resultados' && !x.publico_desde)) expect(isPublic(i), i.id).toBe(false);
  });

  it('a record that is not public publishes no files', () => {
    for (const i of catalog.filter((x) => !isPublic(x))) {
      expect(thumbUrl(i), i.id).toBeNull();
      expect(pageUrls(i), i.id).toEqual([]);
    }
  });

  it('a collection that defaults to public names the day the maintainer opened it', () => {
    for (const c of COLECCIONES) {
      if (c.visibilidad_por_defecto === 'publico') expect(c.abierta, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
