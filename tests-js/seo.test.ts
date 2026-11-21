import { describe, expect, it } from 'vitest';
import { absUrl, breadcrumbJsonLd, editionDescription, editionFacts, editionJsonLd, factRecord, isConfirmedEdition, itemJsonLd, ldGraph, siteJsonLd, sitemapXml, xmlEscape, isEventEdition } from '../src/lib/seo';

const fact = (field: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ id: field, type: 'fact', festival: 'chubut', year: 1937, item_id: null, payload: { field, value, ...extra }, created_at: '', reviewed_at: null, display_name: null }) as any;

describe('seo builders', () => {
  it('absUrl makes site-absolute URLs', () => {
    expect(absUrl('chubut/1937/')).toBe('https://amgueddfa.org/chubut/1937/');
    expect(absUrl('/')).toBe('https://amgueddfa.org/');
    expect(absUrl('https://x.supabase.co/a.webp')).toBe('https://x.supabase.co/a.webp');
  });

  it('sitemapXml escapes and lists every URL', () => {
    expect(xmlEscape('a & b <c>')).toBe('a &amp; b &lt;c&gt;');
    const xml = sitemapXml(['https://amgueddfa.org/a?x=1&y=2']);
    expect(xml).toContain('<loc>https://amgueddfa.org/a?x=1&amp;y=2</loc>');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('editionFacts reads the approved facts of one edition', () => {
    const f = editionFacts([
      fact('start_date', '1937-12-08'), fact('venue', 'Salón San David de Trelew'),
      fact('ganador_silla', 'Edward Morgan Roberts'), { ...fact('venue', 'Otro'), year: 1938 },
    ], 'chubut', 1937);
    expect(f).toEqual({ startDate: '1937-12-08', venue: 'Salón San David de Trelew', silla: 'Edward Morgan Roberts', notHeld: false, held: null });
    expect(editionFacts([fact('edicion_realizada', 'no')], 'chubut', 1937)).toMatchObject({ notHeld: true, held: false });
  });

  it('editionFacts: the most recently approved fact wins, whatever the ids', () => {
    const older = { ...fact('edicion_realizada', 'no'), id: 'ffff', reviewed_at: '2026-11-01T10:00:00Z' };
    const newer = { ...fact('edicion_realizada', 'si'), id: 'aaaa', reviewed_at: '2026-11-02T10:00:00Z' };
    expect(editionFacts([newer, older], 'chubut', 1937)).toMatchObject({ held: true, notHeld: false });
    const v1 = { ...fact('venue', 'Viejo'), id: 'ffff', reviewed_at: '2026-11-01T10:00:00Z' };
    const v2 = { ...fact('venue', 'Corregido'), id: 'aaaa', reviewed_at: '2026-11-03T10:00:00Z' };
    expect(editionFacts([v2, v1], 'chubut', 1937).venue).toBe('Corregido');
  });

  it('editionFacts: the edition status table wins over facts; unknown stays null', () => {
    expect(editionFacts([fact('edicion_realizada', 'si')], 'chubut', 1937, 'not_held')).toMatchObject({ held: false, notHeld: true });
    expect(editionFacts([], 'chubut', 1937, 'held')).toMatchObject({ held: true, notHeld: false });
    expect(editionFacts([], 'chubut', 1937)).toMatchObject({ held: null, notHeld: false });
  });

  it('editionJsonLd: an Event only with an approved date and place, with what Google asks for (#16)', () => {
    const full = editionJsonLd({
      name: 'Eisteddfod del Chubut', year: 1937, url: absUrl('chubut/1937/'), image: 'https://x/c.webp', description: 'Eisteddfod del Chubut 1937. Lugar: Salón San David.',
      facts: { startDate: '1937-12-08', venue: 'Salón San David', silla: 'E. M. Roberts', notHeld: false, held: true },
    });
    expect(full).toMatchObject({
      '@context': 'https://schema.org', '@type': 'Event', '@id': 'https://amgueddfa.org/chubut/1937/#evento', name: 'Eisteddfod del Chubut 1937', description: 'Eisteddfod del Chubut 1937. Lugar: Salón San David.',
      startDate: '1937-12-08', eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: 'Salón San David', address: { '@type': 'PostalAddress', addressRegion: 'Chubut', addressCountry: 'AR' } },
      image: 'https://x/c.webp', isAccessibleForFree: true,
    });
    const cancelled = editionJsonLd({ name: 'X', year: 1930, url: 'u', image: null, facts: { startDate: '1930-10-01', venue: 'Trelew', notHeld: true, held: false } });
    expect(cancelled.eventStatus).toBe('https://schema.org/EventCancelled');
    // Held, but no date or no place approved: an archive page, never an incomplete Event.
    for (const facts of [{ notHeld: false, held: true }, { startDate: '2016-04-30', notHeld: false, held: true }, { venue: 'Trevelin', notHeld: false, held: true }, { notHeld: true, held: false }]) {
      const ld = editionJsonLd({ name: 'Eisteddfod de Trevelin', year: 2016, url: absUrl('trevelin/2016/'), image: null, facts });
      expect(ld, JSON.stringify(facts)).toMatchObject({ '@type': 'CollectionPage', url: 'https://amgueddfa.org/trevelin/2016/' });
      expect(JSON.stringify(ld)).not.toContain('Event');
    }
    expect(isEventEdition({ startDate: '1937-12-08', venue: 'Salón San David', notHeld: false, held: true })).toBe(true);
    expect(isEventEdition({ startDate: '1937-12-08', notHeld: false, held: true })).toBe(false);
  });

  it('editionJsonLd: an edition not known to have happened is never an Event', () => {
    const unknown = editionJsonLd({ name: 'Eisteddfod del Chubut', year: 1865, url: absUrl('chubut/1865/'), image: null, facts: { venue: 'Punta Cuevas', notHeld: false, held: null } });
    expect(unknown).toMatchObject({ '@type': 'CollectionPage', name: 'Eisteddfod del Chubut 1865', url: 'https://amgueddfa.org/chubut/1865/', isAccessibleForFree: true });
    expect(JSON.stringify(unknown)).not.toContain('Event');
    // No place either: an unconfirmed edition's venue is not asserted as an event location.
    expect(unknown).not.toHaveProperty('location');
  });

  it('isConfirmedEdition: held/not held known, or an approved start date; a venue alone does not confirm', () => {
    expect(isConfirmedEdition({ notHeld: false, held: true })).toBe(true);
    expect(isConfirmedEdition({ notHeld: true, held: false })).toBe(true);
    expect(isConfirmedEdition({ notHeld: false, held: null, startDate: '1880-11-08' })).toBe(true);
    expect(isConfirmedEdition({ notHeld: false, held: null, venue: 'Punta Cuevas' })).toBe(false);
    expect(isConfirmedEdition({ notHeld: false })).toBe(false);
  });

  it('breadcrumbJsonLd follows the visible crumbs; ldGraph joins blocks under one @context', () => {
    const crumbs = breadcrumbJsonLd([{ name: 'Inicio', url: 'https://amgueddfa.org/' }, { name: 'Eisteddfod del Chubut', url: 'https://amgueddfa.org/chubut/' }, { name: '1937' }]);
    expect(crumbs).toMatchObject({ '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://amgueddfa.org/' },
      { '@type': 'ListItem', position: 2, name: 'Eisteddfod del Chubut', item: 'https://amgueddfa.org/chubut/' },
      { '@type': 'ListItem', position: 3, name: '1937' },
    ] });
    expect(crumbs.itemListElement[2]).not.toHaveProperty('item');
    const g = ldGraph(editionJsonLd({ name: 'X', year: 1, url: 'u', image: null, facts: { notHeld: false, held: true } }), crumbs);
    expect(g['@context']).toBe('https://schema.org');
    expect(g['@graph']).toHaveLength(2);
    expect(JSON.stringify(g['@graph'])).not.toContain('@context');
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
    const item = itemJsonLd({ name: 'Programa Rhaglen 2012', url: absUrl('item/abc/'), image: absUrl('media/abc/thumb.webp'), editionUrl: absUrl('chubut/2012/'), editionName: 'Eisteddfod del Chubut 2012', year: 2012, editionEvent: true });
    expect(item).toMatchObject({ '@type': 'ArchiveComponent', name: 'Programa Rhaglen 2012', about: { '@id': 'https://amgueddfa.org/chubut/2012/#evento' } });
    expect(JSON.stringify(item)).not.toContain('"@type":"Event"');
    // Edition with no Event (no approved date and place): the document belongs to the edition's page, not to an asserted Event.
    const unsure = itemJsonLd({ name: 'Recorte 1880', url: absUrl('item/def/'), image: null, editionUrl: absUrl('chubut/1880/'), editionName: 'Eisteddfod del Chubut 1880', year: 1880, editionEvent: false });
    expect(unsure).toMatchObject({ isPartOf: { '@type': 'CollectionPage', url: 'https://amgueddfa.org/chubut/1880/' } });
    expect(JSON.stringify(unsure)).not.toContain('Event');
    expect(unsure).not.toHaveProperty('copyrightNotice');
    const credited = itemJsonLd({ name: 'Foto', url: 'u', image: null, editionUrl: null, editionName: null, year: null, rights: 'CC BY-SA 4.0 · Gastón Cuello' });
    expect(credited.copyrightNotice).toBe('CC BY-SA 4.0 · Gastón Cuello');
    const site = siteJsonLd();
    expect(JSON.stringify(site)).toContain('ArchiveOrganization');
    expect(JSON.stringify(site)).toContain('WebSite');
  });

  it('factRecord: readable field, value, fuente and who contributed', () => {
    expect(factRecord({ ...fact('start_date', '1937-12-08', { fuente: 'Libro' }), display_name: 'Meirion Griffiths' }))
      .toEqual({ campo: 'start_date', etiqueta: 'Fecha de inicio', valor: '8 de diciembre de 1937', fecha: '1937-12-08', fuente: 'Libro', aporto: 'Meirion Griffiths' });
    expect(factRecord(fact('venue', 'Salón San David'))).toEqual({ campo: 'venue', etiqueta: 'Lugar', valor: 'Salón San David' });
  });
});

