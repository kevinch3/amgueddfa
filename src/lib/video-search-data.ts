/**
 * The search files of the videos' transcriptions, one per edition that has any
 * (datos/videos-texto/<festival>-<year>.json) and their index. Build time only:
 * it reads every transcription (public/transcripciones-video/) from disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { festivals } from './catalog';
import { editionKey, type SearchEdition, type SearchIndexEntry } from './video-search';
import { asTranscript } from './video-transcript';
import { ALL_VIDEOS } from './videos-data';

const DIR = join(process.cwd(), 'public', 'transcripciones-video');

let cache: Map<string, SearchEdition> | null = null;

/** Every edition with transcribed videos, by its key ("chubut-2025"). Times are whole seconds. */
export function searchEditions(): Map<string, SearchEdition> {
  if (cache) return cache;
  cache = new Map();
  for (const v of ALL_VIDEOS) {
    const path = join(DIR, `${v.id}.json`);
    if (!existsSync(path)) continue;
    let tr = null;
    try {
      tr = asTranscript(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      /* a broken file: the video is not searchable */
    }
    if (!tr) continue;
    const key = editionKey(v.coleccion, v.fecha.year as number);
    const ed = cache.get(key) ?? { coleccion: v.coleccion, year: v.fecha.year as number, videos: [] };
    ed.videos.push({ id: v.id, title: v.title, kind: v.kind, lang: tr.lang, seg: tr.seg.map(([t, text]) => [Math.floor(t), text]) });
    cache.set(key, ed);
  }
  return cache;
}

/** The editions to search, newest first. */
export function searchIndex(): SearchIndexEntry[] {
  const names = new Map<string, string>(festivals().map((f) => [f.slug, f.name]));
  return [...searchEditions().values()]
    .map((e) => ({ coleccion: e.coleccion, name: names.get(e.coleccion) ?? e.coleccion, year: e.year, n: e.videos.length }))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'es'));
}
