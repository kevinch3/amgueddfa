// The admin's Videos tab as plain data: approved transcript corrections grouped by video, the changes that found no
// line ("Sin anclar"), and what Re-anclar sends (docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md,
// "Admin: undo and re-anchor approved corrections"). The DOM layer (scripts/admin.ts) only draws it.
import { corregible, liveRows } from './live-video-corrections';

// The player shows such a file as it is until the next export; the tab says so.
export { withdrawnInFile } from './live-video-corrections';
import { withdrawnInFile } from './live-video-corrections';
import { isCambio } from './admin-video-card';
import { t } from './i18n';
import { applyCorrections, type Cambio, type CorrectionRow } from './video-corrections';
import type { Transcript } from './video-transcript';

/** An approved video_text contribution as an admin reads it from `contributions`. */
export type ApprovedVideoText = {
  id: string;
  user_id: string;
  festival: string | null;
  year: number | null;
  payload: { video?: { id?: string; title?: string }; cambios?: Cambio[] } & Record<string, unknown>;
  created_at: string;
  reviewed_at: string;
  display_name?: string | null;
};

export type VideoGroup = { id: string; title: string; festival: string | null; year: number | null; rows: ApprovedVideoText[] };

export type Motivo = 'sin_linea' | 'idioma_en_linea_unida';
/** A change the player does not show: the export or the browser found no line for it (or its language fell inside a
 * joined line). `index` is its place in the row's `cambios`; `baked` when the file already holds the row (its
 * `correcciones`), so a re-anchored change shows only after the next export. */
export type SinAnclarItem = { row: string; index: number; cambio: Cambio; motivo: Motivo; baked: boolean };
/** Where Re-anclar puts a change: on a line of the transcript, or as a new line at the change's own time. */
export type Eleccion = { t: number; text: string } | 'nueva';

const cambiosOf = (r: { payload?: { cambios?: unknown } }): Cambio[] => (Array.isArray(r.payload?.cambios) ? (r.payload.cambios as Cambio[]) : []);
const newestFirst = (a: ApprovedVideoText, b: ApprovedVideoText) =>
  a.reviewed_at < b.reviewed_at ? 1 : a.reviewed_at > b.reviewed_at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;

/** The rows as applyCorrections reads them (the same payloads, so a change found there is the row's own). */
const asCorrectionRows = (rows: ApprovedVideoText[]): CorrectionRow[] =>
  rows.map((r) => ({ id: r.id, reviewed_at: r.reviewed_at, display_name: r.display_name ?? null, payload: r.payload as CorrectionRow['payload'] }));

/** One group per video, its corrections newest first; the videos in the order of their newest correction. A row without
 * a video is left out (validation never lets one through). */
export function groupByVideo(rows: ApprovedVideoText[]): VideoGroup[] {
  const out: VideoGroup[] = [];
  const byId = new Map<string, VideoGroup>();
  for (const r of [...rows].sort(newestFirst)) {
    const id = String(r.payload?.video?.id ?? '');
    if (!id) continue;
    let g = byId.get(id);
    if (!g) {
      g = { id, title: '', festival: r.festival, year: r.year, rows: [] };
      byId.set(id, g);
      out.push(g);
    }
    g.rows.push(r);
    if (!g.title && r.payload?.video?.title) g.title = String(r.payload.video.title);
  }
  for (const g of out) g.title ||= g.id;
  return out;
}

/** The changes the player does not show on this video, in time order: (a) those the file's `sin_anclar` lists, of rows
 * still approved and still reading so (a re-anchored change has a new time or antes; a language moved to its line has
 * left the change), and (b) those of rows the file does not hold yet that the rule cannot place on the file, run as the
 * player runs it: with the file's `correcciones` as baked rows, so a repeat of one is reported instead of placed on a
 * twin. `live` is the transcript the player shows (the file plus what does apply). */
export function sinAnclarList(file: Transcript, approved: ApprovedVideoText[]): { items: SinAnclarItem[]; live: Transcript } {
  const baked = new Set(file.correcciones ?? []);
  const rows = asCorrectionRows(approved);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: SinAnclarItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, index: number, motivo: Motivo) => {
    const c = index < 0 ? undefined : cambiosOf(byId.get(id)!)[index];
    if (!isCambio(c) || seen.has(`${id}#${index}`)) return;
    seen.add(`${id}#${index}`);
    items.push({ row: id, index, cambio: c, motivo, baked: baked.has(id) });
  };
  for (const u of file.sin_anclar ?? []) {
    const r = byId.get(u.id);
    if (!r) continue; // withdrawn
    const motivo: Motivo = u.motivo === 'idioma_en_linea_unida' ? u.motivo : 'sin_linea';
    add(u.id, cambiosOf(r).findIndex((c) => isCambio(c) && c.t === u.t && (typeof c.antes === 'string' ? c.antes : undefined) === u.antes
      && (motivo !== 'idioma_en_linea_unida' || !!c.idioma)), motivo);
  }
  const out = applyCorrections(corregible(file), liveRows(file, rows).rows, { baked });
  for (const u of out.sinAnclar) {
    const r = byId.get(u.id);
    if (r) add(u.id, cambiosOf(r).indexOf(u.cambio), u.motivo);
  }
  items.sort((a, b) => a.cambio.t - b.cambio.t);
  return { items, live: out.tr };
}

/** Retirar beside one unplaced change: it withdraws the whole contribution (all its changes, points and credit), not
 * that change alone, so the button says so and how many changes go. */
export function retirarTodaLabel(row: { payload?: { cambios?: unknown } }): string {
  const n = cambiosOf(row).length;
  return n === 1 ? t('admin.videos.retirar_toda_uno') : t('admin.videos.retirar_toda', { n });
}

/** A note at the top of a video's card (an admin.videos key). */
export type CardNote = 'sin_filas' | 'sin_archivo' | 'pausa_exportar';

/** The notes at the top of a video's card, in order: `sin_filas` once no approved correction is left on it (so the card
 * never stands empty after the last Retirar); then, once its file is read, `sin_archivo` when it cannot be, or
 * `pausa_exportar` while the file still holds a withdrawn correction: its text stays in the file until the next export,
 * and the player shows that file as it is (no live corrections) meanwhile. */
export function cardNotes(file: Transcript | null | undefined, rows: { id: string }[]): CardNote[] {
  const out: CardNote[] = [];
  if (!rows.length) out.push('sin_filas');
  if (file === null) out.push('sin_archivo');
  else if (file && withdrawnInFile(file, rows)) out.push('pausa_exportar');
  return out;
}

/** The lines a change near `t` may belong to: within a minute of it, nearest first, never a lyric line. */
export function reanchorOptions(tr: Transcript, t: number): { i: number; t: number; text: string }[] {
  return tr.seg
    .flatMap(([lt, text], i) => (Math.abs(lt - t) <= 60 && !tr.fuentes?.[i]?.includes('letra') ? [{ i, t: lt, text }] : []))
    .sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t) || a.i - b.i);
}

/** "Agregar como línea nueva" fits a change that has words to write and was looking for a line (not a removal, not an
 * add already, not a language whose words are in the file). */
export function canAddNew(c: Cambio, motivo: Motivo): boolean {
  return motivo === 'sin_linea' && typeof c.antes === 'string' && c.quitar !== true && typeof c.texto === 'string' && c.texto.trim() !== '';
}

/** The row's `cambios` with change `index` re-anchored; every other change as it was. On a line: that change's `t` and
 * `antes` become the line's. As a new line: the change loses its `antes` and adds its words at its own time. A language
 * that fell inside a joined line (`idioma_en_linea_unida`) only had its language left out: its words stay where they
 * landed (the export starts from the machine text every time, so they must stay in the row), and the language alone
 * goes to the picked line, as a change after the row's others, whose text the picked line already shows. Null when the
 * choice does not fit the change. */
export function reanchoredCambios(cambios: Cambio[], item: { index: number; motivo: Motivo }, pick: Eleccion): Cambio[] | null {
  const c = cambios[item.index];
  if (!isCambio(c)) return null;
  if (item.motivo === 'idioma_en_linea_unida') {
    if (pick === 'nueva' || !c.idioma) return null;
    const { idioma, ...words } = c;
    const keep = typeof words.texto === 'string' && words.texto.trim() !== '' ? [words] : [];
    return [...cambios.slice(0, item.index), ...keep, ...cambios.slice(item.index + 1), { t: pick.t, antes: pick.text, idioma }];
  }
  if (pick === 'nueva') {
    if (!canAddNew(c, item.motivo)) return null;
    const { antes: _antes, quitar: _quitar, ...nueva } = c;
    return cambios.map((x, i) => (i === item.index ? nueva : x));
  }
  return cambios.map((x, i) => (i === item.index ? { ...c, t: pick.t, antes: pick.text } : x));
}
