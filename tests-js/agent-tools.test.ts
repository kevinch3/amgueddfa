import { describe, expect, it } from 'vitest';
import { PAGES, fold, getEdition, inLanguage, listEditions, pagePath, searchDocuments, type Documento, type Edicion } from '../src/lib/agent-tools';
import { agentReply, modelContext } from '../src/lib/webmcp';
import { FESTIVALS } from '../src/lib/contrib';

const SITE = 'https://amgueddfa.org';
const doc = (id: string, titulo: string, eisteddfod: string, ano: number | null, categoria = 'programa'): Documento => ({
  id, titulo, eisteddfod, nombre_eisteddfod: eisteddfod === 'chubut' ? 'Eisteddfod del Chubut' : 'Eisteddfod de Trevelin', ano, categoria, tipo: 'image', url: `${SITE}/item/${id}/`, miniatura: null,
});
const DOCS = [
  doc('aaaaaaaaaaa1', 'Tapa programa 1975 foto 13', 'chubut', 1975),
  doc('aaaaaaaaaaa2', 'Programa Rhaglen 2024', 'chubut', 2024),
  doc('aaaaaaaaaaa3', 'Resultados Ŵyl 2011', 'trevelin', 2011, 'resultados'),
  doc('aaaaaaaaaaa4', 'bases', 'trevelin', null, 'bases'),
];
const ed = (eisteddfod: string, ano: number, estado: string): Edicion => ({ eisteddfod, nombre: eisteddfod, ano, url: `${SITE}/${eisteddfod}/${ano}/`, estado, realizada: null, tapa: null, documentos: 0, datos: [] });
const EDS = [ed('chubut', 2024, 'full'), ed('chubut', 1975, 'some'), ed('trevelin', 2011, 'some'), ed('chubut', 1942, 'none')];

describe('agent tools (WebMCP)', () => {
  it('folds accents and Welsh circumflexes for matching', () => {
    expect(fold('Ŵyl Gerdd Ñandú')).toBe('wyl gerdd nandu');
  });

  it('search_documents: every word must match; filters narrow; oldest first; limit is clamped', () => {
    expect(searchDocuments(DOCS, { query: 'tapa 1975' }).results.map((d) => d.id)).toEqual(['aaaaaaaaaaa1']);
    expect(searchDocuments(DOCS, { query: 'wyl' }).results.map((d) => d.id)).toEqual(['aaaaaaaaaaa3']);
    expect(searchDocuments(DOCS, { query: 'chubut' }).results.map((d) => d.ano)).toEqual([1975, 2024]);
    expect(searchDocuments(DOCS, { festival: 'trevelin' }).results.map((d) => d.id)).toEqual(['aaaaaaaaaaa3', 'aaaaaaaaaaa4']);
    expect(searchDocuments(DOCS, { category: 'resultados', year: 2011 }).total).toBe(1);
    expect(searchDocuments(DOCS, { query: 'programa coro' }).total).toBe(0);
    expect(searchDocuments(DOCS, { limit: 0 }).results).toHaveLength(1);
    expect(searchDocuments(DOCS, { limit: 1000 }).results).toHaveLength(4);
  });

  it('list_editions and get_edition', () => {
    expect(listEditions(EDS, { festival: 'chubut' }).map((e) => e.ano)).toEqual([1942, 1975, 2024]);
    expect(listEditions(EDS, { from_year: 1970, to_year: 2020 }).map((e) => `${e.eisteddfod} ${e.ano}`)).toEqual(['chubut 1975', 'trevelin 2011']);
    expect(listEditions(EDS, { status: 'none' })).toHaveLength(1);
    expect(getEdition(EDS, DOCS, 'chubut', 1975)!.documentos.map((d) => d.id)).toEqual(['aaaaaaaaaaa1']);
    expect(getEdition(EDS, DOCS, 'mimosa', 1975)).toBeNull();
  });

  it('open_page: builds the path or says what is missing', () => {
    expect(pagePath({ page: 'edition', festival: 'chubut', year: 1937 }, FESTIVALS)).toEqual({ path: 'chubut/1937/' });
    expect(pagePath({ page: 'edition', festival: 'nope', year: 1937 }, FESTIVALS)).toHaveProperty('error');
    expect(pagePath({ page: 'document', document_id: 'aaaaaaaaaaa1' }, FESTIVALS)).toEqual({ path: 'item/aaaaaaaaaaa1/' });
    expect(pagePath({ page: 'document', document_id: '../admin' }, FESTIVALS)).toHaveProperty('error');
    expect(pagePath({ page: 'contribute', festival: 'chubut', year: 1975, tab: 'recuerdo' }, FESTIVALS)).toEqual({ path: 'contribuir?f=chubut&y=1975&tab=recuerdo' });
    expect(pagePath({ page: 'contribute', tab: 'evil' }, FESTIVALS)).toEqual({ path: 'contribuir' });
    expect(pagePath({ page: 'admin' }, FESTIVALS)).toHaveProperty('error');
    for (const p of PAGES) expect('path' in pagePath({ page: p, festival: 'chubut', year: 2000, document_id: 'aaaaaaaaaaa1' }, FESTIVALS), p).toBe(true);
  });

  it('turns data URLs into pages in the reader\'s language', () => {
    expect(inLanguage(`${SITE}/chubut/1937/`, (p) => `/cy${p}`)).toBe('/cy/chubut/1937/');
    expect(inLanguage('not a url', (p) => p)).toBe('not a url');
  });

  it('WebMCP is feature-detected, and only agent-submitted forms get a reply', () => {
    expect(modelContext()).toBeNull();
    const replies: unknown[] = [];
    const agent = { agentInvoked: true, respondWith: (p: Promise<unknown>) => replies.push(p) } as unknown as Event;
    const person = { agentInvoked: false, respondWith: (p: Promise<unknown>) => replies.push(p) } as unknown as Event;
    agentReply(agent, Promise.resolve('ok'));
    agentReply(person, Promise.resolve('no'));
    agentReply({} as Event, Promise.resolve('old browser'));
    expect(replies).toHaveLength(1);
  });
});
