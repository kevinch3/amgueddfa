// What a /perfil/ row says beyond its type (src/pages/perfil.astro draws the rows).
import { t } from './i18n';
import { videoHash } from './video-hash';

/** A transcript correction's row: after "Corrección de transcripción", the video's title (from the payload, as sent)
 * and how many changes it holds, " · «GORSEDD Y WLADFA 2011» · 4 cambios"; and the address hash that opens the player
 * at its first change ("#v=<id>&t=98"). Nothing a row cannot read: no title, no count, no link. */
export function videoTextFila(payload: unknown): { resumen: string; hash: string } {
  const p = (payload && typeof payload === 'object' ? payload : {}) as { video?: { id?: unknown; title?: unknown }; cambios?: unknown };
  const id = typeof p.video?.id === 'string' && /^[\w-]{6,20}$/.test(p.video.id) ? p.video.id : '';
  const titulo = typeof p.video?.title === 'string' ? p.video.title.trim() : '';
  const cambios = Array.isArray(p.cambios) ? p.cambios : [];
  const n = cambios.length;
  const primero = cambios[0] as { t?: unknown } | undefined;
  const partes = [titulo ? `«${titulo}»` : '', n ? (n === 1 ? t('editor.un_cambio') : t('editor.cambios', { n })) : ''].filter(Boolean);
  return {
    resumen: partes.map((x) => ` · ${x}`).join(''),
    hash: id ? videoHash(id, Number(primero?.t) || 0) : '',
  };
}
