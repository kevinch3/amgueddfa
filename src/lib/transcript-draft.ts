// A collaborator's draft of corrections to one video's transcript, in the player's edit mode
// (scripts/editor-transcripcion.ts draws it; docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md,
// "Player: edit mode for collaborators"). Everything here is pure, so the DOM layer only draws what it says.
//
// The draft refers to the transcript AS SHOWN (the file plus the approved corrections applied live): a change's `antes`
// is the line's text there, the text the export will find once the earlier corrections are baked.
import { MAX_CAMBIOS, type Result } from './contrib';
import { t } from './i18n';
import type { FestivalSlug } from './types';
import { foldLine, type Cambio } from './video-corrections';
import { fmtTime, letraAt, lineAt, lineLang, type Transcript } from './video-transcript';

export type Idioma = 'es' | 'cy';
/** A change to line i. `t` and `antes` are that line as the editor saw it, so a draft reopened on a transcript that
 * changed goes back to its own line or is dropped, never moved to another one. */
export type LineaBorrador = { t: number; antes: string; texto?: string; idioma?: Idioma; quitar?: boolean };
/** A line the collaborator adds at `t` (the video's time when they pressed "Agregar"). */
export type Nueva = { t: number; texto: string; idioma: Idioma };
export type Draft = { video: string; base?: string; lines: Record<number, LineaBorrador>; nuevas: Nueva[] };

/** localStorage key prefix: one draft per video, `amg:borrador-video:<id>` (listed on /cookies/). */
export const DRAFT_KEY = 'amg:borrador-video:';
/** Only these festivals' videos can be corrected (#29: no children's festival). */
export const EDITABLE_FESTIVALS = ['chubut', 'trevelin'] as const;
/** An exact match: the same line within this many seconds (lib/video-corrections.ts uses the same window). */
const EXACTA = 2;

const isIdioma = (x: unknown): x is Idioma => x === 'es' || x === 'cy';
const esLetra = (tr: Transcript, i: number) => !!tr.fuentes?.[i]?.includes('letra');

export function emptyDraft(video: string, base?: string): Draft {
  return { video, ...(base ? { base } : {}), lines: {}, nuevas: [] };
}

/** The language the player shows for line i, when it is one a collaborator can choose (Spanish or Welsh). */
export function lineIdioma(tr: Transcript, i: number): Idioma | null {
  const seg = tr.seg[i];
  if (!seg) return null;
  const l = lineLang(tr, i, letraAt(tr, seg[0]));
  return isIdioma(l) ? l : null;
}

/** The language a line added at `at` starts with: the line playing there, else Spanish. */
export function nuevaIdioma(tr: Transcript, at: number): Idioma {
  return lineIdioma(tr, Math.max(0, lineAt(tr.seg, at))) ?? 'es';
}

/** The draft with line i as the editor left it: only what differs from the line as shown is kept (a removal excludes
 * the rest; blank words are no change of words); nothing that differs forgets the line. Lyric lines are never edited. */
export function setLine(tr: Transcript, d: Draft, i: number, edit: { texto?: string; idioma?: Idioma | null; quitar?: boolean }): Draft {
  const seg = tr.seg[i];
  if (!seg || esLetra(tr, i)) return d;
  const lines = { ...d.lines };
  delete lines[i];
  const [t0, antes] = seg;
  const e: LineaBorrador = { t: t0, antes };
  if (edit.quitar) e.quitar = true;
  else {
    const texto = (edit.texto ?? '').trim();
    if (texto && texto !== antes.trim()) e.texto = texto;
    if (isIdioma(edit.idioma) && edit.idioma !== lineIdioma(tr, i)) e.idioma = edit.idioma;
  }
  if (e.quitar || e.texto !== undefined || e.idioma) lines[i] = e;
  const base = d.base ?? tr.exportado;
  return { ...d, ...(base ? { base } : {}), lines };
}

/** The moment a line added now starts at ("+ Agregar una línea en 1:23"): the player's time when it has one; a video
 * that cannot play in the site (embedding disabled) or a player not ready has none, and then the second in the address
 * (#v=…&t=…: a shared link, "Copiar enlace"), else the line whose ✎ was used last, else the start. Tenths of a second. */
export function momentoNueva(s: { reproductor: number | null; enlace: number | null; ultimo: number | null }): number {
  const ok = (x: number | null, min: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min;
  const t0 = ok(s.reproductor, 0) ? s.reproductor : ok(s.enlace, 0.001) ? s.enlace : ok(s.ultimo, 0) ? s.ultimo : 0;
  return Math.round(t0 * 10) / 10;
}

/** The new line's time field: "12:05" (minutes:seconds) or "1:02:03" (hours:minutes:seconds) in seconds; null when it
 * is not one. */
export function parseTiempo(s: string): number | null {
  const m = /^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d)$/.exec((s ?? '').trim());
  if (!m) return null;
  return m[1] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[4]) : Number(m[3]) * 60 + Number(m[4]);
}

/** The time the new-line form gives: `prefill` (to the tenth) while the field still reads it, else what was written;
 * never past the end of the video when its length (`duracion`, seconds) is known. */
export function tiempoNueva(
  campo: string,
  o: { prefill: number; duracion: number | null },
): { ok: true; t: number } | { ok: false; key: 'editor.error_tiempo' } | { ok: false; key: 'editor.error_tiempo_fin'; duracion: string } {
  const t0 = (campo ?? '').trim() === fmtTime(o.prefill) ? o.prefill : parseTiempo(campo);
  if (t0 === null) return { ok: false, key: 'editor.error_tiempo' };
  const fin = typeof o.duracion === 'number' && Number.isFinite(o.duracion) && o.duracion > 0 ? o.duracion : null;
  if (fin !== null && t0 > fin) return { ok: false, key: 'editor.error_tiempo_fin', duracion: fmtTime(fin) };
  return { ok: true, t: t0 };
}

/** The draft without its change to line i ("Deshacer"). */
export function undoLine(d: Draft, i: number): Draft {
  const lines = { ...d.lines };
  delete lines[i];
  return { ...d, lines };
}

/** The draft plus a line added at `n.t` (tenths of a second); a blank one adds nothing. Two adds never share a time
 * (the contribution would be refused as a repeated change): a later one at a taken time moves on by 0.1 s. */
export function addNueva(d: Draft, n: Nueva): Draft {
  const texto = n.texto.trim();
  if (!texto || !Number.isFinite(n.t) || n.t < 0 || !isIdioma(n.idioma)) return d;
  let t0 = Math.round(n.t * 10) / 10;
  while (d.nuevas.some((x) => x.t === t0)) t0 = Math.round((t0 + 0.1) * 10) / 10;
  return { ...d, nuevas: [...d.nuevas, { t: t0, texto, idioma: n.idioma }] };
}

export function removeNueva(d: Draft, k: number): Draft {
  return { ...d, nuevas: d.nuevas.filter((_, j) => j !== k) };
}

/** Whether entry `e` still describes line i as shown (same start, same words once folded). */
const sameLine = (tr: Transcript, i: number, e: LineaBorrador) =>
  !!tr.seg[i] && !esLetra(tr, i) && tr.seg[i][0] === e.t && foldLine(tr.seg[i][1]) === foldLine(e.antes);

/** The changes the draft sends, in time order: one per changed line (`antes` = the line's text as shown) and one per
 * added line. Edits that change nothing are dropped; so is a change whose line is no longer there. */
export function cambiosFrom(tr: Transcript, d: Draft): Cambio[] {
  const out: Cambio[] = [];
  for (const [k, e] of Object.entries(d.lines)) {
    const i = Number(k);
    if (!e || !sameLine(tr, i, e)) continue;
    const [t0, antes] = tr.seg[i];
    if (e.quitar) {
      out.push({ t: t0, antes, quitar: true });
      continue;
    }
    const c: Cambio = { t: t0, antes };
    const texto = typeof e.texto === 'string' ? e.texto.trim() : '';
    if (texto && texto !== antes.trim()) c.texto = texto;
    if (isIdioma(e.idioma) && e.idioma !== lineIdioma(tr, i)) c.idioma = e.idioma;
    if (c.texto !== undefined || c.idioma) out.push(c);
  }
  for (const n of d.nuevas) {
    const texto = n.texto.trim();
    if (texto && Number.isFinite(n.t) && n.t >= 0 && isIdioma(n.idioma)) out.push({ t: n.t, texto, idioma: n.idioma });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** How many changes the draft would send (the counter). */
export function countCambios(tr: Transcript, d: Draft): number {
  return cambiosFrom(tr, d).length;
}

/** Whether `next` (the draft after one more edit or add) still fits one contribution: at most MAX_CAMBIOS changes,
 * the limit validate applies, so the counter never offers a send that would be refused. A step that adds no change
 * (a line changed again, an undo) always fits. */
export function cabe(tr: Transcript, before: Draft, next: Draft): boolean {
  const n = countCambios(tr, next);
  return n <= MAX_CAMBIOS || n <= countCambios(tr, before);
}

/** The editor's message when a change does not fit (see cabe). */
export const limiteLabel = (): string => t('editor.limite', { max: MAX_CAMBIOS });

/** The draft on the transcript as it is now: each change back on its own line (the same index, else the line with the
 * same start and words, else the nearest line within 2 s with the same folded words), or dropped and counted when its
 * line is gone (rewritten, removed). A change never moves to a line with other words. */
export function fitDraft(tr: Transcript, d: Draft): { draft: Draft; descartados: number } {
  const lines: Record<number, LineaBorrador> = {};
  const libre = (j: number) => !!tr.seg[j] && !esLetra(tr, j) && !(j in lines);
  const entries = Object.entries(d.lines).map(([k, e]) => [Number(k), e] as const);
  const rest: LineaBorrador[] = [];
  // Changes still on their own line first, so none of them loses its line to another that moved.
  for (const [k, e] of entries) {
    if (Number.isInteger(k) && tr.seg[k]?.[0] === e.t && tr.seg[k]?.[1] === e.antes && libre(k)) lines[k] = e;
    else rest.push(e);
  }
  let descartados = 0;
  for (const e of rest) {
    let j = tr.seg.findIndex(([s, w], m) => s === e.t && w === e.antes && libre(m));
    const f = foldLine(e.antes);
    if (j < 0 && f) {
      let best = Infinity;
      tr.seg.forEach(([s, w], m) => {
        const dt = Math.abs(s - e.t);
        if (dt <= EXACTA && dt < best && libre(m) && foldLine(w) === f) {
          best = dt;
          j = m;
        }
      });
    }
    if (j < 0) descartados++;
    else lines[j] = { ...e, t: tr.seg[j][0], antes: tr.seg[j][1] };
  }
  return { draft: { ...d, lines }, descartados };
}

// ---- Storage: a convenience only (a private window or blocked site data simply keeps nothing) --------------------

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The given store, else the browser's; null when there is none or reading it throws. */
function storage(store: Store | null | undefined): Store | null {
  if (store !== undefined) return store;
  try {
    return (globalThis as { localStorage?: Store }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** A stored draft, keeping only well-formed entries; null when nothing usable is left. */
function asDraft(raw: unknown, video: string): Draft | null {
  const r = raw as Partial<Draft> | null;
  if (!r || typeof r !== 'object' || r.video !== video) return null;
  const lines: Record<number, LineaBorrador> = {};
  for (const [k, x] of Object.entries(r.lines && typeof r.lines === 'object' ? r.lines : {})) {
    const i = Number(k);
    const e = x as Partial<LineaBorrador> | null;
    if (!/^\d+$/.test(k) || !e || typeof e.t !== 'number' || !Number.isFinite(e.t) || typeof e.antes !== 'string') continue;
    const out: LineaBorrador = { t: e.t, antes: e.antes };
    if (e.quitar === true) out.quitar = true;
    else {
      if (typeof e.texto === 'string' && e.texto.trim()) out.texto = e.texto;
      if (isIdioma(e.idioma)) out.idioma = e.idioma;
    }
    if (out.quitar || out.texto !== undefined || out.idioma) lines[i] = out;
  }
  const nuevas = (Array.isArray(r.nuevas) ? r.nuevas : []).filter(
    (n): n is Nueva => !!n && typeof n.t === 'number' && Number.isFinite(n.t) && n.t >= 0 && typeof n.texto === 'string'
      && !!n.texto.trim() && isIdioma(n.idioma),
  ).map((n) => ({ t: n.t, texto: n.texto, idioma: n.idioma }));
  if (!Object.keys(lines).length && !nuevas.length) return null;
  return { video, ...(typeof r.base === 'string' && r.base ? { base: r.base } : {}), lines, nuevas };
}

export function loadDraft(video: string, store?: Store | null): Draft | null {
  try {
    const raw = storage(store)?.getItem(`${DRAFT_KEY}${video}`);
    return raw ? asDraft(JSON.parse(raw), video) : null;
  } catch {
    return null;
  }
}

/** Keep the draft; an empty one removes the key. */
export function saveDraft(d: Draft, store?: Store | null): void {
  try {
    const s = storage(store);
    if (!Object.keys(d.lines).length && !d.nuevas.length) s?.removeItem(`${DRAFT_KEY}${d.video}`);
    else s?.setItem(`${DRAFT_KEY}${d.video}`, JSON.stringify(d));
  } catch {
    /* blocked storage: the draft lives until the page closes */
  }
}

export function clearDraft(video: string, store?: Store | null): void {
  try {
    storage(store)?.removeItem(`${DRAFT_KEY}${video}`);
  } catch {
    /* blocked storage: nothing was kept */
  }
}

// ---- What the edit mode draws --------------------------------------------------------------------------------------

/** What the edit mode offers on the video open now: the edit button (a signed-in profile with a display name, a
 * Chubut or Trevelin video, a transcript), the sign-in link instead (signed out, or no name yet), or nothing. */
export function editorAccess(
  festival: string | null | undefined,
  tr: Transcript | null,
  g: { profile: unknown; reason?: 'offline' | 'signed_out' | 'no_name' } | null,
): { boton: boolean; ingresar: 'signed_out' | 'no_name' | null } {
  if (!tr || !(EDITABLE_FESTIVALS as readonly string[]).includes(festival ?? '') || !g) return { boton: false, ingresar: null };
  if (g.profile) return { boton: true, ingresar: null };
  return { boton: false, ingresar: g.reason === 'signed_out' || g.reason === 'no_name' ? g.reason : null };
}

/** Whether edit mode may start now: a visitor who may edit (editorAccess's button: signed in with a name, a Chubut or
 * Trevelin video), once the text of the video drawn is final, and not while already editing. The button's `hidden` is
 * not the only guard: a hidden control that a style still showed must not let a signed-out visitor in. */
export function puedeEntrar(s: { tr: Transcript | null; video: unknown; editando: boolean; asentada: boolean; puede: boolean }): boolean {
  return s.puede && s.asentada && !s.editando && !!s.tr && !!s.video;
}

/** One entry per line, for edit mode: `editable` lines get a ✎ control beside their seek button; lyric lines get none,
 * and the first line of each sung passage carries the lyrics note. Only the line `abierta` has its editor (and so an
 * input): entering edit mode creates no input. */
export type Control = { i: number; t: number; editable: boolean; nota?: 'letra'; abierta: boolean };
export function editControls(tr: Transcript, abierta: number | null = null): Control[] {
  return tr.seg.map(([t0], i) => {
    const letra = esLetra(tr, i);
    return { i, t: t0, editable: !letra, ...(letra && !esLetra(tr, i - 1) ? { nota: 'letra' as const } : {}), abierta: !letra && i === abierta };
  });
}

/** "2 cambios" (the counter); "1 cambio". */
export const cambiosLabel = (n: number): string => (n === 1 ? t('editor.un_cambio') : t('editor.cambios', { n }));
/** "Enviar 2 correcciones"; "Enviar 1 corrección". */
export const enviarLabel = (n: number): string => (n === 1 ? t('editor.enviar_una') : t('editor.enviar', { n }));

/** A language by name in the page's language: "español", "galés". */
export const nombreIdioma = (x: Idioma): string => t(`editor.idioma_nombre.${x}`);

/** A language change in words, from the line's own language to the new one: "Idioma: galés → español"; "Idioma:
 * español" when the line's own is unknown (or the same). */
export function idiomaCambio(hacia: Idioma, desde?: Idioma | null): string {
  return desde && desde !== hacia
    ? t('editor.idioma_cambio', { antes: nombreIdioma(desde), despues: nombreIdioma(hacia) })
    : t('editor.idioma_nuevo', { idioma: nombreIdioma(hacia) });
}

/** A change in words, for the line's note: «the new text», "Quitar esta línea", the language (`desde`: the line's own
 * language as shown, lineIdioma). */
export function cambioTexto(c: { texto?: string; idioma?: Idioma; quitar?: boolean }, desde?: Idioma | null): string {
  if (c.quitar) return t('editor.quitar');
  return [c.texto !== undefined ? `«${c.texto}»` : '', c.idioma ? idiomaCambio(c.idioma, desde) : ''].filter(Boolean).join(' · ');
}

/** The note under a line the draft changes: "→ «the new text»", "→ Quitar esta línea"; a language change on its own
 * reads "Idioma: galés → español" (its own arrow). */
export function notaBorrador(c: { texto?: string; idioma?: Idioma; quitar?: boolean }, desde?: Idioma | null): string {
  return `${c.quitar || c.texto !== undefined ? '→ ' : ''}${cambioTexto(c, desde)}`;
}

/** The note under a line with the author's own pending change: "Pendiente de revisión: Idioma: galés → español". */
export const notaPendiente = (c: { texto?: string; idioma?: Idioma; quitar?: boolean }, desde?: Idioma | null): string =>
  t('editor.pendiente', { cambio: cambioTexto(c, desde) });

/** "+ 1:23 «texto»": a line added (in the draft, or pending). */
export const nuevaTexto = (n: { t: number; texto: string }): string => `+ ${fmtTime(n.t)} «${n.texto}»`;

export type Pendiente = { texto?: string; idioma?: Idioma; quitar?: boolean };
/** The author's own pending changes on the transcript as shown, for the dashed "pendiente" marks (their rows only;
 * nobody else sees them before approval). A change marks the nearest line within 2 s with its `antes`' folded words
 * (never a lyric line; none when that line changed since); an add goes after the line playing at its time (-1: before
 * the first). Display only: the lines stay as published. */
export function pendingMarks(
  tr: Transcript,
  rows: { payload?: unknown }[],
): { lineas: Record<number, Pendiente>; nuevas: { despues: number; t: number; texto: string; idioma?: Idioma }[] } {
  const lineas: Record<number, Pendiente> = {};
  const nuevas: { despues: number; t: number; texto: string; idioma?: Idioma }[] = [];
  for (const r of rows ?? []) {
    const cambios = (r?.payload as { cambios?: unknown } | null | undefined)?.cambios;
    for (const c of Array.isArray(cambios) ? (cambios as Partial<Cambio>[]) : []) {
      if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t)) continue;
      const texto = typeof c.texto === 'string' && c.texto.trim() ? c.texto : undefined;
      const idioma = isIdioma(c.idioma) ? c.idioma : undefined;
      if (typeof c.antes !== 'string') {
        if (texto) nuevas.push({ despues: lineAt(tr.seg, c.t), t: c.t, texto, ...(idioma ? { idioma } : {}) });
        continue;
      }
      const f = foldLine(c.antes);
      let j = -1;
      let best = Infinity;
      tr.seg.forEach(([s, w], m) => {
        const dt = Math.abs(s - c.t!);
        if (f && dt <= EXACTA && dt < best && !esLetra(tr, m) && foldLine(w) === f) {
          best = dt;
          j = m;
        }
      });
      if (j < 0 || (c.quitar !== true && !texto && !idioma)) continue;
      // A later change to the same line wins, as at approval.
      lineas[j] = c.quitar === true ? { quitar: true } : { ...(texto ? { texto } : {}), ...(idioma ? { idioma } : {}) };
    }
  }
  return { lineas, nuevas };
}

/** Send the draft as ONE `video_text` contribution (through `send`, lib/contrib.ts's submit) and clear it once sent;
 * a refusal (daily limit, signed out, offline) keeps it. A draft with no real change is not sent. */
export async function sendDraft(
  tr: Transcript,
  d: Draft,
  video: { id: string; title: string; festival: string; year: number },
  send: (kind: 'video_text', festival: FestivalSlug, year: number, itemId: null, input: Record<string, unknown>) => Promise<Result>,
  store?: Store | null,
): Promise<Result> {
  const cambios = cambiosFrom(tr, d);
  if (!cambios.length) return { ok: false, key: 'contrib.error.video_cambios' };
  const base = d.base ?? tr.exportado;
  const r = await send('video_text', video.festival as FestivalSlug, video.year, null, {
    video: { id: video.id, title: video.title }, ...(base ? { base } : {}), cambios,
  });
  if (r.ok) clearDraft(video.id, store);
  return r;
}
