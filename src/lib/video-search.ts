// Search in what is said in the videos: pure helpers shared by the edition page and /buscar/
// (scripts/buscar-videos.ts). The data is one file per edition, datos/videos-texto/<festival>-<year>.json,
// written at build time (lib/video-search-data.ts).
import { fold } from './video-transcript';

/** A transcribed video as its edition's search file carries it. */
export type SearchVideo = { id: string; title: string; kind: string; lang: string; seg: [number, string][] };
export type SearchEdition = { festival: string; year: number; videos: SearchVideo[] };
/** One edition in datos/videos-texto/indice.json. */
export type SearchIndexEntry = { festival: string; name: string; year: number; n: number };

/** A moment that matches: its second, the words shown and the [from, to) ranges to highlight in them. */
export type Hit = { t: number; text: string; marks: [number, number][] };
export type VideoHits = { video: SearchVideo; total: number; hits: Hit[] };

/** The name of an edition's search file: "chubut-2025". */
export const editionKey = (festival: string, year: number) => `${festival}-${year}`;

/** The words of a query, folded; one-letter words say nothing and are dropped. */
export function queryTerms(query: string): string[] {
  return [...new Set(fold(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))];
}

/**
 * Welsh initial mutations, radical → the forms it takes (soft, nasal, aspirate), on folded text:
 * "cadair" is also said "gadair", "chadair", "nghadair". Digraphs first ("ll" before "l").
 */
const MUTATIONS: [string, string[]][] = [
  ['ll', ['l']], ['rh', ['r']], ['ch', []], ['dd', []], ['ph', []], ['th', []], ['ff', []], ['ng', []],
  ['p', ['b', 'mh', 'ph']], ['t', ['d', 'nh', 'th']], ['c', ['g', 'ngh', 'ch']],
  ['b', ['f', 'm']], ['d', ['dd', 'n']], ['g', ['', 'ng']], ['m', ['f']],
];

/**
 * A folded term and its mutated forms. The soft mutation of "g" drops it ("gwlad" → "wlad"),
 * which only counts when four letters remain: shorter stumps are in every other word.
 */
export function variants(term: string): string[] {
  const rule = MUTATIONS.find(([radical]) => term.startsWith(radical));
  if (!rule) return [term];
  const rest = term.slice(rule[0].length);
  return [term, ...rule[1].map((m) => m + rest).filter((v) => (v === rest ? v.length >= 4 : v.length >= 2))];
}

/**
 * Does this folded text answer these folded terms? The one rule that says how
 * permissive the search is; everything else (the two-line window, the marks,
 * the order of results) follows it. Chosen by the user (2026-11-20): every
 * term must be there, anywhere inside a word ("rosa" finds "prosa"), in its
 * own form or a Welsh mutation of it ("cadair" finds "gadair").
 */
export function matches(text: string, terms: string[]): boolean {
  return terms.every((w) => variants(w).some((v) => text.includes(v)));
}

/** Where the terms are in `text` (original, unfolded), as merged [from, to) ranges. */
export function markRanges(text: string, terms: string[]): [number, number][] {
  // Fold letter by letter, remembering where each folded letter came from ("ŵ" folds to one, "ﬁ" stays).
  let folded = '';
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]);
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
  }
  const raw: [number, number][] = [];
  for (const w of terms.flatMap(variants)) {
    for (let from = folded.indexOf(w); from !== -1; from = folded.indexOf(w, from + w.length)) {
      raw.push([at[from], at[from + w.length - 1] + 1]);
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

const FOLDED = new WeakMap<SearchVideo, string[]>();
/** A video's lines folded, once: the search runs again on every letter typed. */
function foldedLines(video: SearchVideo): string[] {
  let f = FOLDED.get(video);
  if (!f) FOLDED.set(video, (f = video.seg.map(([, text]) => fold(text))));
  return f;
}

/**
 * The moments of one video that answer the terms. Caption lines are a few words long, so a
 * phrase often runs over two of them: a line also counts with the next one, when it holds
 * part of the answer itself (so the moment is where the phrase starts, and is counted once).
 */
export function videoHits(video: SearchVideo, terms: string[], max = 50): { total: number; hits: Hit[] } {
  const hits: Hit[] = [];
  let total = 0;
  if (!terms.length) return { total, hits };
  const folded = foldedLines(video);
  for (let i = 0; i < folded.length; i++) {
    const alone = matches(folded[i], terms);
    const withNext = !alone && i + 1 < folded.length && terms.some((w) => matches(folded[i], [w])) && matches(`${folded[i]} ${folded[i + 1]}`, terms);
    if (!alone && !withNext) continue;
    total++;
    if (hits.length >= max) continue;
    const text = withNext ? `${video.seg[i][1]} ${video.seg[i + 1][1]}` : video.seg[i][1];
    hits.push({ t: video.seg[i][0], text, marks: markRanges(text, terms) });
  }
  return { total, hits };
}

/** The videos that say the query, the ones that say it most first; none for a query without words. */
export function searchVideos(videos: SearchVideo[], query: string, max = 50): VideoHits[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  return videos
    .map((video) => ({ video, ...videoHits(video, terms, max) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}
