/**
 * What a record shows (docs/reglas.md, rule 5; scripts/catalog/visibilidad.py):
 *   publico     page, lists, files and text
 *   solo_ficha  page with title, date, source and a notice; no files, no text
 *   privado     nothing (the catalog builder leaves it out of catalog.json)
 *
 * The catalog builder evaluates `publico_desde`, because it also moves the files;
 * the site never lifts a record above what the builder wrote. The stricter of
 * `visibilidad` and the old `restricted` flag wins, so a correction that moves a
 * document to Resultados (lib/tags.ts) still restricts it at once.
 */
import type { Visibilidad } from './colecciones';

const LEVELS: readonly Visibilidad[] = ['publico', 'solo_ficha', 'privado'];

export function stricter(a: Visibilidad, b: Visibilidad): Visibilidad {
  return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

export type Visible = { visibilidad?: Visibilidad | null; restricted?: boolean };

export function visibleAs(r: Visible): Visibilidad {
  const stored = r.visibilidad && LEVELS.includes(r.visibilidad) ? r.visibilidad : 'publico';
  return stricter(stored, r.restricted ? 'solo_ficha' : 'publico');
}

/** Its files, text and data are shown. */
export function isPublic(r: Visible): boolean {
  return visibleAs(r) === 'publico';
}

/** It has a page and appears in lists (with a notice when not public). */
export function isListed(r: Visible): boolean {
  return visibleAs(r) !== 'privado';
}
