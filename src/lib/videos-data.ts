/**
 * The exported videos (src/data/videos.json, from the archive's VIDEOS.tsv) with
 * the last export's approved reports applied: hidden ones dropped, moved ones
 * moved. Build time only: never import this from a browser script, it carries
 * the whole list.
 */
import raw from '../data/videos.json';
import approvedRaw from '../../data/approved/contributions.json';
import type { TagLike } from './tags';
import type { FestivalSlug } from './types';
import { applyVideoReports, editionVideos as pick, type Video } from './videos';

export const ALL_VIDEOS: Video[] = applyVideoReports((raw as { videos: Video[] }).videos, approvedRaw as TagLike[]);

/** Videos of one edition as its page shows them. */
export function editionVideos(f: FestivalSlug, year: number): Video[] {
  return pick(f, year, ALL_VIDEOS);
}
