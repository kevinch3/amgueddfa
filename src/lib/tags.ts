/**
 * The item overlay: approved "tag" contributions (and document reports) correct
 * a catalog item without touching the archive. The folder and file name only
 * give an item its initial values; the latest approved correction wins.
 *
 * The same rule runs three times, and must agree:
 * - Python, scripts/catalog/overlay.py, before media are derived (a tag that
 *   makes an item "resultados" keeps its pages off the public bucket);
 * - at build time here (catalog.ts, from the last export);
 * - in the browser (scripts/live-catalog.ts, approvals made after the build).
 * tests/fixtures/overlay.json holds the cases both test suites run.
 */
import type { EditionState } from './types';

/** What a tag can change: catalog items and the compact index (lib/placement.ts) both fit. */
export type Taggable = {
  id: string; year: number | null; category: string; festival: string; undated: boolean; year_inferred: boolean; restricted: boolean;
  hidden?: boolean; title?: string; rights?: string; note_public?: string; no_text?: boolean;
};

export type TagLike = {
  type?: string;
  festival?: string | null;
  year?: number | null;
  item_id?: string | null;
  payload?: Record<string, any> | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

/** Payload keys a tag may carry, and the item field each one sets. */
export const OVERLAY_FIELDS = {
  year: 'year', category: 'category', festival: 'festival',
  title: 'title', rights: 'rights', caption: 'note_public', no_text: 'no_text', hidden: 'hidden',
} as const;
export type OverlayKey = keyof typeof OVERLAY_FIELDS;
/** Fields an empty string may clear (a wrong credit line or caption); the rest ignore "". */
const CLEARABLE = new Set<OverlayKey>(['rights', 'caption']);
const FLAGS = new Set<OverlayKey>(['no_text', 'hidden']);

export const when = (t: TagLike) => t.reviewed_at ?? t.created_at ?? '';
/** An approved report about a catalog document ("Informar un error"). */
const isDocReport = (t: TagLike) => t?.type === 'report' && t.payload?.objetivo === 'documento';
/** Rows that place documents: tags and document reports. */
const places = (t: TagLike) => t?.type === 'tag' || isDocReport(t);
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * New array of items with every approved tag and document report applied,
 * oldest approval first. A report "otra_edicion" moves like a tag (its
 * `arreglo`); "no_corresponde" hides the item; "otro" changes nothing. Only a
 * tag (an admin correction) un-hides. "resultados" restricts and nothing
 * un-restricts; a restricted item never shows a caption.
 */
export function applyTags<T extends Taggable>(items: T[], tags: TagLike[]): T[] {
  const mine = tags.filter((t) => places(t) && t.item_id).sort((a, b) => when(a).localeCompare(when(b)));
  if (!mine.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const changed = new Map<string, T>();
  for (const t of mine) {
    const base = changed.get(t.item_id!) ?? byId.get(t.item_id!);
    if (!base) continue;
    const it: Record<string, any> = { ...base };
    let p: Record<string, any> = t.payload ?? {};
    if (t.type === 'report') {
      if (p.problema === 'no_corresponde') it.hidden = true;
      p = p.problema === 'otra_edicion' ? (p.arreglo ?? {}) : {};
    }
    for (const [k, f] of Object.entries(OVERLAY_FIELDS) as [OverlayKey, string][]) {
      const v = p[k];
      if (FLAGS.has(k)) {
        if (typeof v === 'boolean') it[f] = v;
      } else if (given(v) || (CLEARABLE.has(k) && v === '')) {
        it[f] = k === 'year' ? Number(v) : String(v);
      }
    }
    if (given(p.year)) {
      it.undated = false;
      it.year_inferred = false;
    }
    if (it.category === 'resultados') it.restricted = true; // only ever restrict
    if (it.restricted && 'note_public' in it) it.note_public = '';
    changed.set(it.id, it as T);
  }
  return items.map((i) => changed.get(i.id) ?? i);
}

/** Coverage from catalog items alone: a programa PDF is full, anything else some. */
export function catalogState(list: { category: string; kind: string }[]): EditionState {
  if (list.some((i) => i.category === 'programa' && i.kind === 'pdf')) return 'full';
  return list.length ? 'some' : 'none';
}

/** Newest approval time among tags and reports: what a static build already includes. */
export function latestTagAt(tags: TagLike[]): string | null {
  const times = tags.filter((t) => (t?.type === 'tag' || t?.type === 'report') && t.reviewed_at).map((t) => t.reviewed_at as string).sort();
  return times.length ? times[times.length - 1] : null;
}
