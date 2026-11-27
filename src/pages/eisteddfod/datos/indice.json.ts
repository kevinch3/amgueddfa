import { isPublic, visibleAs } from '../../../lib/visibilidad';
import { items, thumbUrl } from '../../../lib/catalog';

/**
 * Compact catalog for live corrections (scripts/live-catalog.ts): where each
 * item sits in this build, after the tags this build includes. Restricted items
 * are listed without media, as their cards are.
 */
export function GET(): Response {
  const list = items().map((i) => ({
    id: i.id, title: i.title, festival: i.festival, year: i.year, undated: i.undated, category: i.category,
    kind: i.kind, restricted: !isPublic(i), visibilidad: visibleAs(i), year_inferred: i.year_inferred, thumb: !isPublic(i) ? null : thumbUrl(i),
  }));
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
