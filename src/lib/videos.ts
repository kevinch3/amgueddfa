import raw from '../data/videos.json';
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
