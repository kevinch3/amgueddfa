import raw from '../data/videos.json';
import { when, type TagLike } from './tags';
import type { FestivalSlug } from './types';

/** A YouTube video of an edition (exported from the archive's VIDEOS.tsv). */
export type Video = {
  id: string;
  festival: FestivalSlug;
  year: number;
  kind: 'ceremonia' | 'sesion' | 'noticia' | 'actuacion';
  title: string;
  channel: string;
  date: string;
  year_inferred: boolean;
};

const ALL: Video[] = (raw as { videos: Video[] }).videos;

/** Ceremonies first, then whole sessions and news; single performances last. */
export const KIND_ORDER: Video['kind'][] = ['ceremonia', 'sesion', 'noticia', 'actuacion'];

export function editionVideos(f: FestivalSlug, year: number, list: Video[] = ALL): Video[] {
  return list
    .filter((v) => v.festival === f && v.year === year)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, 'es'));
}

export function splitVideos(list: Video[]): { highlights: Video[]; performances: Video[] } {
  return {
    highlights: list.filter((v) => v.kind !== 'actuacion'),
    performances: list.filter((v) => v.kind === 'actuacion'),
  };
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
/** 320×180, exists for every video (maxres does not). */
export const videoThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const KINDS: Video['kind'][] = ['ceremonia', 'sesion', 'noticia', 'actuacion'];
/** An approved report about a video ("Informar un error"). */
const isVideoReport = (r: TagLike) => r?.type === 'report' && r.payload?.objetivo === 'video' && typeof r.payload?.video?.id === 'string';

/** Where an "otra_edicion" fix puts a video: its fields over the current ones. */
function moved(v: Video, arreglo: Record<string, any> | undefined): Video {
  const a = arreglo ?? {};
  return {
    ...v,
    festival: a.festival ? (a.festival as FestivalSlug) : v.festival,
    year: a.year !== undefined && a.year !== null && a.year !== '' ? Number(a.year) : v.year,
    year_inferred: false,
  };
}

/**
 * Videos after approved reports, oldest approval first: "no_corresponde"
 * hides a video, "otra_edicion" moves it, "otro" changes nothing. Keyed by
 * video id, so a re-export of VIDEOS.tsv never undoes a fix. Nothing un-hides.
 */
export function applyVideoReports(videos: Video[], rows: TagLike[]): Video[] {
  const mine = rows.filter(isVideoReport).sort((a, b) => when(a).localeCompare(when(b)));
  if (!mine.length) return videos;
  const byId = new Map(videos.map((v) => [v.id, v]));
  const changed = new Map<string, Video | null>();
  for (const r of mine) {
    const id = String(r.payload!.video.id);
    const base = changed.has(id) ? changed.get(id) : byId.get(id);
    if (!base) continue; // unknown, or already hidden
    if (r.payload!.problema === 'no_corresponde') changed.set(id, null);
    else if (r.payload!.problema === 'otra_edicion') changed.set(id, moved(base, r.payload!.arreglo));
  }
  return videos.filter((v) => changed.get(v.id) !== null).map((v) => changed.get(v.id) ?? v);
}

/**
 * A video moved by an "otra_edicion" report, rebuilt from the copy the report
 * carries (for pages built before the move). A fix that names only a year
 * keeps the eisteddfod the report was filed under. Null when it cannot be placed.
 */
export function videoFromReport(r: TagLike): Video | null {
  if (!isVideoReport(r) || r.payload!.problema !== 'otra_edicion') return null;
  const c = r.payload!.video;
  const base: Video = {
    id: String(c.id), festival: (r.festival ?? '') as FestivalSlug, year: Number(r.year ?? NaN),
    kind: KINDS.includes(c.kind) ? c.kind : 'actuacion', title: String(c.title ?? ''), channel: String(c.channel ?? ''),
    date: '', year_inferred: false,
  };
  const v = moved(base, r.payload!.arreglo);
  return v.festival && Number.isInteger(v.year) ? v : null;
}
