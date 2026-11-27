import { describe, expect, it } from 'vitest';
import type { Contribution } from '../src/lib/contrib';
import { buildSources, contributionSourceKey, itemSourceKey, sourceKind, sourceRef, sourceSlug, waybackLookup } from '../src/lib/fuentes';
import type { Item } from '../src/lib/types';
import raw from '../src/data/catalog.json';
import approved from '../data/approved/contributions.json';

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, festival: 'chubut', year: 1990, undated: false, category: 'programa', title: id, kind: 'image',
    src_path: `x/${id}.jpg`, alt_paths: [], source_url: 'https://www.facebook.com/photo/?fbid=1', source_label: 'Facebook',
    retrieved: '2026-11-13', note_public: '', year_inferred: false, restricted: false, pages: 1, thumb: `${id}/thumb.webp`,
    page_paths: [`${id}/p01.webp`], text_excerpt: null, table: null, ...over,
  } as Item;
}
const contrib = (over: Partial<Contribution>): Contribution =>
  ({ id: 'c', type: 'fact', festival: 'chubut', year: 1990, item_id: null, payload: {}, created_at: '', display_name: 'Ana', ...over }) as Contribution;

describe('source keys and slugs (#185)', () => {
  it('slugs are 14 hex characters, stable, and never collide on the real catalog', () => {
    expect(sourceSlug('x')).toMatch(/^[0-9a-f]{14}$/);
    expect(sourceSlug('x')).toBe(sourceSlug('x'));
    const keys = new Set([
      ...(raw as { items: Item[] }).items.map(itemSourceKey),
      ...(approved as Contribution[]).map(contributionSourceKey).filter((k): k is string => Boolean(k)),
    ]);
    expect(new Set([...keys].map(sourceSlug)).size).toBe(keys.size);
  });

  it('a document keys by its URL, or its label when it has none', () => {
    expect(itemSourceKey(item('a'))).toBe('https://www.facebook.com/photo/?fbid=1');
    expect(itemSourceKey(item('a', { source_url: null, source_label: 'Archivo personal (kpc)' }))).toBe('label:Archivo personal (kpc)');
  });

  it('a contribution keys by what it cites, else by who contributed it', () => {
    expect(contributionSourceKey(contrib({ payload: { fuente: 'Diario Jornada: https://diariojornada.com.ar/1' } }))).toBe('https://diariojornada.com.ar/1');
    expect(contributionSourceKey(contrib({ payload: { fuente: 'Osian Hughes, p. 14' } }))).toBe('label:Osian Hughes, p. 14');
    expect(contributionSourceKey(contrib({}))).toBe('persona:Ana');
    expect(contributionSourceKey(contrib({ display_name: null }))).toBeNull();
  });

  it('names the kind of source', () => {
    expect(sourceKind('https://www.facebook.com/photo/?fbid=1')).toBe('facebook');
    expect(sourceKind('https://web.archive.org/web/2006/x')).toBe('wayback');
    expect(sourceKind('https://newspapers.library.wales/1')).toBe('papurau');
    expect(sourceKind('https://example.org/')).toBe('web');
    expect(sourceKind('label:Archivo personal (kpc)')).toBe('personal');
    expect(sourceKind('label:Osian Hughes')).toBe('publicacion');
    expect(sourceKind('persona:Ana')).toBe('comunidad');
    expect(waybackLookup({ url: 'https://example.org/', kind: 'web' })).toBe('https://web.archive.org/web/*/https://example.org/');
    expect(waybackLookup({ url: 'https://web.archive.org/web/1/x', kind: 'wayback' })).toBeNull();
  });
});

describe('buildSources', () => {
  it('groups documents and the contributions that cite them, and names contributors once', () => {
    const url = 'https://www.facebook.com/photo/?fbid=1';
    const m = buildSources(
      [item('a'), item('b'), item('c', { source_url: 'https://www.facebook.com/photo/?fbid=2' })],
      [
        contrib({ id: '1', payload: { fuente: url } }),
        contrib({ id: '2', payload: { fuente: `Post: ${url}` } }),
        contrib({ id: '3', type: 'tag', payload: { fuente: url } }), // tags never show: not listed
        contrib({ id: '4', type: 'memory', payload: { text: 'x' }, display_name: 'Beto' }),
      ],
    );
    const s = m.get(sourceSlug(url))!;
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.contributions.map((c) => c.id)).toEqual(['1', '2']);
    expect(s.contributors).toEqual(['Ana']);
    expect(m.get(sourceSlug('persona:Beto'))!.kind).toBe('comunidad');
    expect(m.size).toBe(3);
  });
});

describe('sourceRef: the "Fuente: …" a block shows instead of a name (#184)', () => {
  const known = new Set([sourceSlug('https://diariojornada.com.ar/1'), sourceSlug('persona:Ana')]);
  it('links what a contribution cites to its source page', () => {
    const r = sourceRef(contrib({ payload: { fuente: 'Diario Jornada: https://diariojornada.com.ar/1' } }), known)!;
    expect(r).toEqual({ label: 'Diario Jornada', href: `/fuente/${sourceSlug('https://diariojornada.com.ar/1')}/`, own: true, original: 'https://diariojornada.com.ar/1' });
  });
  it('falls back to the cited URL, or plain text, when no page was built', () => {
    expect(sourceRef(contrib({ payload: { fuente: 'X: https://new.example/1' } }), known)!.href).toBe('https://new.example/1');
    expect(sourceRef(contrib({ payload: { fuente: 'Un libro' } }), known)!.href).toBeNull();
    expect(sourceRef(contrib({ payload: { fuente: 'Un libro' } }), known)!.original).toBeNull();
  });
  it('names the community, never the person, for a contribution that cites nothing', () => {
    const r = sourceRef(contrib({}), known)!;
    expect(r.label).not.toContain('Ana');
    expect(r.href).toBe(`/fuente/${sourceSlug('persona:Ana')}/`);
    expect(sourceRef(contrib({ display_name: 'Nueva' }), known)).toBeNull();
  });
});
