import { isPublic, visibleAs } from '../../../lib/visibilidad';
import { items, thumbUrl } from '../../../lib/catalog';

/**
 * Compact catalog for live corrections (scripts/live-catalog.ts): where each
 * item sits in this build, after the tags this build includes. Restricted items
 * are listed without media, as their cards are.
 */
export function GET(): Response {
  const list = items().map((i) => ({
    id: i.id, title: i.title, coleccion: i.coleccion, fecha: i.fecha, tipo: i.tipo,
    formato: i.formato, restricted: !isPublic(i), visibilidad: visibleAs(i), thumb: !isPublic(i) ? null : thumbUrl(i),
  }));
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
