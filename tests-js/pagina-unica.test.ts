import { describe, expect, it } from 'vitest';
import { isDeep, localizeHref, translateText, withLang, decodeEntities } from '../src/lib/pagina-unica';
import { alternates, url } from '../src/lib/paths';
import { translateHtml } from '../scripts/paginas_unicas.mjs';

const LANGS = ['cy', 'en', 'zh', 'it', 'fr', 'sv'];

// docs/reglas.md, rule 4: a deep page is built once, at its Spanish address.
describe('deep pages built once', () => {
  it('knows which pages are deep', () => {
    expect(isDeep('eisteddfod/item/abc/')).toBe(true);
    expect(isDeep('/fuente/0123/#aportes')).toBe(true);
    expect(isDeep('eisteddfod/item/')).toBe(false);
    expect(isDeep('eisteddfod/item/abc.md')).toBe(false);
    expect(isDeep('eisteddfod/chubut/1937/')).toBe(false);
  });

  it('links to a deep page carry the language; other pages get its prefix', () => {
    expect(url('item/abc/', 'cy')).toBe('/eisteddfod/item/abc/?l=cy');
    expect(url('item/abc/#p2', 'fr')).toBe('/eisteddfod/item/abc/?l=fr#p2');
    expect(url('item/abc/', 'es')).toBe('/eisteddfod/item/abc/');
    expect(url('fuente/0123/', 'en')).toBe('/fuente/0123/?l=en');
    expect(url('chubut/1937/', 'cy')).toBe('/cy/eisteddfod/chubut/1937/');
    expect(url('item/abc.md', 'cy')).toBe('/eisteddfod/item/abc.md');
    expect(withLang('/fuente/x/?a=1&l=cy#h', 'en')).toBe('/fuente/x/?a=1&l=en#h');
    expect(withLang('/fuente/x/?l=cy', 'es')).toBe('/fuente/x/');
    expect(alternates('/cy/eisteddfod/item/abc/').map((a) => a.href)).toEqual(['/eisteddfod/item/abc/', '/eisteddfod/item/abc/?l=cy', '/eisteddfod/item/abc/?l=en', '/eisteddfod/item/abc/?l=zh', '/eisteddfod/item/abc/?l=it', '/eisteddfod/item/abc/?l=fr', '/eisteddfod/item/abc/?l=sv']);
  });

  it('rewrites a deep page’s links for a visitor in another language', () => {
    expect(localizeHref('/eisteddfod/chubut/1937/', 'cy', '', LANGS)).toBe('/cy/eisteddfod/chubut/1937/');
    expect(localizeHref('/eisteddfod/item/x/', 'cy', '', LANGS)).toBe('/eisteddfod/item/x/?l=cy');
    expect(localizeHref('/eisteddfod/datos/documentos.json', 'cy', '', LANGS)).toBe('/eisteddfod/datos/documentos.json');
    expect(localizeHref('/cy/eisteddfod/', 'cy', '', LANGS)).toBe('/cy/eisteddfod/');
    expect(localizeHref('https://example.org/', 'cy', '', LANGS)).toBe('https://example.org/');
    expect(localizeHref('#p2', 'cy', '', LANGS)).toBe('#p2');
    expect(localizeHref('/eisteddfod/', 'es', '', LANGS)).toBe('/eisteddfod/');
  });

  it('swaps labels keeping their spacing, by position when a word translates two ways', () => {
    const dict = { Fuente: 'Ffynhonnell', Normal: ['Normal', 'Normale'], 'Fuente: ': '来源：' };
    expect(translateText('  Fuente\n', dict)).toBe('  Ffynhonnell\n');
    expect(translateText('Fuente: ', dict)).toBe('来源：');
    expect(translateText('Otro', dict)).toBeNull();
    const seen = new Map<string, number>();
    expect([translateText('Normal', dict, seen), translateText('Normal', dict, seen), translateText('Normal', dict, seen)]).toEqual(['Normal', 'Normale', 'Normale']);
    expect(decodeEntities('Mae&#39;r &amp; &lt;b&gt; &#x41;')).toBe("Mae'r & <b> A");
  });

  it('never touches archive text: anything inside an element with its own language', () => {
    const html = '<html lang="es-AR"><head><title>Fuente | Amgueddfa</title></head><body><h2>Fuente</h2><h1 lang="es">Fuente</h1>'
      + '<a href="/eisteddfod/chubut/1937/" aria-label="Fuente">x</a><a href="/eisteddfod/item/y/">y</a>'
      + '<span lang="es-AR" data-idioma-actual>Español</span><a href="/" data-idioma="cy">Cymraeg</a>'
      + '<p data-solo-traducida hidden>Nota</p></body></html>';
    const out = translateHtml(html, { Fuente: 'Ffynhonnell', 'Fuente | Amgueddfa': 'Ffynhonnell | Amgueddfa', Nota: 'Nodyn' }, 'cy');
    expect(out).toContain('<html lang="cy-AR" data-idioma="cy">');
    expect(out).toContain('<title>Ffynhonnell | Amgueddfa</title>');
    expect(out).toContain('<h2>Ffynhonnell</h2><h1 lang="es">Fuente</h1>');
    expect(out).toContain('<a href="/cy/eisteddfod/chubut/1937/" aria-label="Ffynhonnell">');
    expect(out).toContain('<a href="/eisteddfod/item/y/?l=cy">');
    expect(out).toContain('<span lang="cy-AR" data-idioma-actual>Cymraeg</span>');
    expect(out).toContain('<a href="/" data-idioma="cy" aria-current="true">');
    expect(out).toContain('<p data-solo-traducida>Nodyn</p>');
  });
});
