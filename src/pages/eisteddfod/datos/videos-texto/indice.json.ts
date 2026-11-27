import { searchIndex } from '../../../../lib/video-search-data';

/** The editions whose videos can be searched (each has a file beside this one), newest first. */
export function GET(): Response {
  return new Response(JSON.stringify(searchIndex()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
