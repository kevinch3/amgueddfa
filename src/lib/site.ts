import type { CategorySlug, EditionState, FestivalSlug, Item } from './types';
import { t } from './i18n';

export const CATEGORY_ORDER: CategorySlug[] = [
  'programa', 'programa-del-dia', 'preliminares', 'bases', 'resultados', 'otros',
];

export function festivalName(f: FestivalSlug): string {
  return t(`festivales.${f}`);
}

/** Stable display order inside a section: by title, then id. */
export function byTitle(a: Item, b: Item): number {
  return a.title.localeCompare(b.title, 'es', { numeric: true }) || a.id.localeCompare(b.id);
}

export function docCount(n: number): string {
  return n === 1 ? t('comun.un_documento') : t('comun.n_documentos', { n });
}

/** Whether an edition took place, as far as the archive knows (editions.status). */
export type EditionStatus = 'held' | 'not_held' | 'unknown';

/**
 * The label of an edition's coverage state. With nothing archived, "¿Se realizó?"
 * asks whether it took place; when that is known ("held"), it says so instead.
 */
export function stateLabel(state: EditionState, status?: string | null): string {
  return state === 'none' && status === 'held' ? t('estados.held_none') : t(`estados.${state}`);
}
