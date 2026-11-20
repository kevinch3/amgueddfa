import type { APIContext } from 'astro';
import { searchEditions } from '../../../lib/video-search-data';

// What is said in the videos of one edition, for the search on its page and on /buscar/
// (scripts/buscar-videos.ts): the transcriptions of public/transcripciones-video/ in one file.
export function getStaticPaths() {
  return [...searchEditions().keys()].map((edicion) => ({ params: { edicion } }));
}

export function GET({ params }: APIContext): Response {
  return new Response(JSON.stringify(searchEditions().get(String(params.edicion))), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
