import { describe, expect, it } from 'vitest';
import {
  absUrl, editionDescription, editionFacts, editionJsonLd, itemJsonLd, siteJsonLd, sitemapXml, xmlEscape,
} from '../src/lib/seo';

const fact = (field: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ id: field, type: 'fact', festival: 'chubut', year: 1937, item_id: null, payload: { field, value, ...extra }, created_at: '', reviewed_at: null, display_name: null }) as any;

describe('seo builders', () => {
  it('absUrl makes site-absolute URLs', () => {
    expect(absUrl('chubut/1937/')).toBe('https://amgueddfa.kevinroberts.ar/chubut/1937/');
    expect(absUrl('/')).toBe('https://amgueddfa.kevinroberts.ar/');
    expect(absUrl('https://x.supabase.co/a.webp')).toBe('https://x.supabase.co/a.webp');
  });

  it('sitemapXml escapes and lists every URL', () => {
    expect(xmlEscape('a & b <c>')).toBe('a &amp; b &lt;c&gt;');
    const xml = sitemapXml(['https://amgueddfa.kevinroberts.ar/a?x=1&y=2']);
    expect(xml).toContain('<loc>https://amgueddfa.kevinroberts.ar/a?x=1&amp;y=2</loc>');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('editionFacts reads the approved facts of one edition', () => {
    const f = editionFacts([
      fact('start_date', '1937-12-08'), fact('venue', 'Salón San David de Trelew'),
      fact('ganador_silla', 'Edward Morgan Roberts'), { ...fact('venue', 'Otro'), year: 1938 },
    ], 'chubut', 1937);
    expect(f).toEqual({ startDate: '1937-12-08', venue: 'Salón San David de Trelew', silla: 'Edward Morgan Roberts', notHeld: false });
    expect(editionFacts([fact('edicion_realizada', 'no')], 'chubut', 1937).notHeld).toBe(true);
  });

  it('editionJsonLd: a full Event, and a minimal valid one without facts', () => {
    const full = editionJsonLd({
      name: 'Eisteddfod del Chubut', year: 1937, url: absUrl('chubut/1937/'), image: 'https://x/c.webp',
      facts: { startDate: '1937-12-08', venue: 'Salón San David', silla: 'E. M. Roberts', notHeld: false },
    });
    expect(full).toMatchObject({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Eisteddfod del Chubut 1937',
      startDate: '1937-12-08', location: { '@type': 'Place', name: 'Salón San David' }, image: 'https://x/c.webp',
      isAccessibleForFree: true,
    });
    const bare = editionJsonLd({ name: 'Eisteddfod de Trevelin', year: 2016, url: absUrl('trevelin/2016/'), image: null, facts: { notHeld: false } });
    expect(bare).toMatchObject({ '@type': 'Event', name: 'Eisteddfod de Trevelin 2016', url: 'https://amgueddfa.kevinroberts.ar/trevelin/2016/' });
    for (const k of ['startDate', 'location', 'image', 'eventStatus']) expect(bare).not.toHaveProperty(k);
    const cancelled = editionJsonLd({ name: 'X', year: 1930, url: 'u', image: null, facts: { notHeld: true } });
    expect(cancelled.eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('editionDescription summarises what is known', () => {
    const d = editionDescription('Eisteddfod del Chubut', 1937, 'some', { startDate: '1937-12-08', venue: 'Salón San David', silla: 'E. M. Roberts', notHeld: false }, 1);
    expect(d).toContain('Eisteddfod del Chubut 1937');
    expect(d).toContain('8 de diciembre de 1937');
    expect(d).toContain('Salón San David');
    expect(d).toContain('E. M. Roberts');
    expect(editionDescription('Eisteddfod de Trevelin', 2016, 'none', { notHeld: false }, 0).length).toBeGreaterThan(40);
    expect(d).toContain('1 documento en el archivo');
  });

  it('itemJsonLd and siteJsonLd', () => {
    const item = itemJsonLd({ name: 'Programa Rhaglen 2012', url: absUrl('item/abc/'), image: absUrl('media/abc/thumb.webp'), editionUrl: absUrl('chubut/2012/'), editionName: 'Eisteddfod del Chubut 2012', year: 2012 });
    expect(item).toMatchObject({ '@type': 'ArchiveComponent', name: 'Programa Rhaglen 2012', about: { '@type': 'Event', url: 'https://amgueddfa.kevinroberts.ar/chubut/2012/' } });
    const site = siteJsonLd();
    expect(JSON.stringify(site)).toContain('ArchiveOrganization');
    expect(JSON.stringify(site)).toContain('WebSite');
  });
});
