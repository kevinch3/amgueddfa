import { describe, expect, it } from 'vitest';
import { editionKey, markRanges, matches, queryTerms, searchVideos, variants, videoHits, type SearchVideo } from '../src/lib/video-search';

const video = (id: string, lines: string[]): SearchVideo => ({ id, title: id, kind: 'actuacion', lang: 'es', seg: lines.map((text, i) => [i * 4, text]) });
const coro = video('A', ['Competencia 75, segunda competencia', 'principal para coro,', 'escuela de música Gaiman.', 'Olha a Rosa amarela, Rosa']);

describe('video search', () => {
  it('reads the words of a query: folded, once each, no single letters', () => {
    expect(queryTerms('  Música, y  MUSICA Glyndŵr ')).toEqual(['musica', 'glyndwr']);
    expect(queryTerms(' a ')).toEqual([]);
  });

  it('finds a word whatever its accents and case, at its second', () => {
    const { total, hits } = videoHits(coro, queryTerms('MUSICA'));
    expect(total).toBe(1);
    expect(hits[0].t).toBe(8);
    expect(hits[0].text).toBe('escuela de música Gaiman.');
    expect(hits[0].marks.map(([a, b]) => hits[0].text.slice(a, b))).toEqual(['música']);
  });

  it('finds a phrase that runs over two lines, once, where it starts', () => {
    const { total, hits } = videoHits(coro, queryTerms('coro escuela'));
    expect(total).toBe(1);
    expect(hits[0].t).toBe(4);
    expect(hits[0].text).toBe('principal para coro, escuela de música Gaiman.');
    expect(hits[0].marks.map(([a, b]) => hits[0].text.slice(a, b))).toEqual(['coro', 'escuela']);
  });

  it('does not join lines that are further apart', () => {
    expect(videoHits(coro, queryTerms('competencia gaiman')).total).toBe(0);
  });

  it('counts every moment and keeps the first `max`', () => {
    const many = video('B', Array.from({ length: 9 }, () => 'la silla del bardo'));
    const r = videoHits(many, queryTerms('silla'), 3);
    expect(r.total).toBe(9);
    expect(r.hits).toHaveLength(3);
  });

  it('marks merged ranges in the original text', () => {
    expect(markRanges('Glyndŵr a Glyndwr', ['glyndwr'])).toEqual([[0, 7], [10, 17]]);
    expect(markRanges('rosa rosada', ['rosa', 'rosada'])).toEqual([[0, 4], [5, 11]]);
  });

  it('lists the videos that say it most first, and none for an empty query', () => {
    const one = video('C', ['una rosa']);
    const two = video('D', ['rosa', 'otra rosa']);
    expect(searchVideos([one, coro, two], 'rosa').map((r) => [r.video.id, r.total])).toEqual([['D', 2], ['C', 1], ['A', 1]]);
    expect(searchVideos([one], ' ')).toEqual([]);
    expect(searchVideos([one], 'silla')).toEqual([]);
  });

  it('asks for every word, anywhere inside a word', () => {
    expect(matches('la prosa generosa', ['rosa'])).toBe(true);
    expect(matches('el coro de gaiman', ['coro', 'gaiman'])).toBe(true);
    expect(matches('el coro de trelew', ['coro', 'gaiman'])).toBe(false);
  });

  it('finds the Welsh mutations of a word, and marks them', () => {
    expect(variants('cadair')).toEqual(['cadair', 'gadair', 'nghadair', 'chadair']);
    expect(variants('llyfr')).toEqual(['llyfr', 'lyfr']);
    expect(variants('gwlad')).toEqual(['gwlad', 'wlad', 'ngwlad']);
    expect(variants('gato')).toEqual(['gato', 'ngato']); // "ato" is in every other word
    expect(variants('chwarae')).toEqual(['chwarae']);
    expect(variants('eisteddfod')).toEqual(['eisteddfod']);
    for (const said of ['y gadair', 'ei chadair', 'fy nghadair', 'cadair']) expect(matches(said, ['cadair'])).toBe(true);
    expect(matches('y wladfa', ['gwladfa'])).toBe(true);
    expect(matches('y gadair', ['gadair'])).toBe(true);
    expect(matches('y tad', ['dad'])).toBe(false); // from the radical to its mutations, not back
    const text = 'Enillodd y Gadair';
    expect(markRanges(text, ['cadair']).map(([a, b]) => text.slice(a, b))).toEqual(['Gadair']);
  });

  it('names an edition file', () => {
    expect(editionKey('chubut', 2025)).toBe('chubut-2025');
  });
});
