import { describe, expect, it } from 'vitest';
import { AJUSTES, DEFAULTS, LECTURA_KEY, OPCIONES, applyAjustes, changed, readAjustes, sanitize, saveAjustes } from '../src/lib/lectura';

function memoryStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    attrs,
  };
}

describe('reading settings', () => {
  it('every setting has a default first, and the defaults are those first values', () => {
    for (const k of AJUSTES) expect(DEFAULTS[k]).toBe(OPCIONES[k][0]);
    expect(DEFAULTS).toEqual({ texto: '100', contraste: 'auto', espaciado: 'normal', letra: 'serif', movimiento: 'auto', enlaces: 'normal' });
  });

  it('keeps only known settings with known values', () => {
    expect(sanitize({ texto: '150', contraste: 'alto', letra: 'comic', extra: 'x', movimiento: 3 })).toEqual({ ...DEFAULTS, texto: '150', contraste: 'alto' });
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize('texto=200')).toEqual(DEFAULTS);
  });

  it('stores only what differs from the defaults, and forgets the key when nothing does', () => {
    const s = memoryStore();
    expect(saveAjustes({ ...DEFAULTS, texto: '200', enlaces: 'subrayados' }, s)).toBe(true);
    expect(JSON.parse(s.m.get(LECTURA_KEY)!)).toEqual({ texto: '200', enlaces: 'subrayados' });
    expect(readAjustes(s)).toEqual({ ...DEFAULTS, texto: '200', enlaces: 'subrayados' });
    saveAjustes(DEFAULTS, s);
    expect(s.m.has(LECTURA_KEY)).toBe(false);
    expect(changed(DEFAULTS)).toEqual({});
  });

  it('survives blocked or corrupt storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    expect(readAjustes(broken)).toEqual(DEFAULTS);
    expect(saveAjustes({ ...DEFAULTS, texto: '125' }, broken)).toBe(false);
    expect(readAjustes(memoryStore({ [LECTURA_KEY]: '{not json' }))).toEqual(DEFAULTS);
    expect(readAjustes(null)).toEqual(DEFAULTS);
  });

  it('sets data-* only for non-default settings', () => {
    const root = fakeRoot();
    applyAjustes(root as unknown as Element, { ...DEFAULTS, contraste: 'alto', espaciado: 'amplio' });
    expect(Object.fromEntries(root.attrs)).toEqual({ 'data-contraste': 'alto', 'data-espaciado': 'amplio' });
    applyAjustes(root as unknown as Element, DEFAULTS);
    expect(root.attrs.size).toBe(0);
  });
});
