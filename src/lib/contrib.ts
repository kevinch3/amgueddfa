import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate, t } from './i18n';
import { liveQuery } from './live';
import { getClient } from './supabase';
import type { CategorySlug, FestivalSlug } from './types';
import type { Cambio } from './video-corrections';
import { FESTIVAL_IDS, VIDEO_TEXT_FESTIVALS } from './colecciones';

export type Kind = 'upload' | 'fact' | 'tag' | 'transcription' | 'memory' | 'report' | 'note' | 'video_text';
export type Result = { ok: true } | { ok: false; key: string };
export type Validation = { ok: true; payload: Record<string, unknown> } | { ok: false; key: string };

/** A row of the `public_contributions` view (also the shape of data/approved/contributions.json). */
export interface Contribution {
  id: string;
  type: Kind;
  coleccion: FestivalSlug | null;
  year: number | null;
  item_id: string | null;
  payload: Record<string, any>;
  created_at: string;
  reviewed_at: string | null;
  display_name: string | null;
}

export const MAX_UPLOAD = 20971520;
export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const FACT_FIELDS = [
  'start_date', 'end_date', 'venue', 'presentadores', 'ganador_silla', 'ganador_corona',
  'edicion_realizada', 'competencia', 'other',
] as const;
export const CATEGORIES: CategorySlug[] = ['programa', 'programa-del-dia', 'preliminares', 'bases', 'resultados', 'otros'];
/** What part of a programa an upload is, as the contributor says (an admin confirms on approval). */
export const ALCANCES = ['completo', 'tapa', 'parcial'] as const;
export type Alcance = (typeof ALCANCES)[number];
export const FESTIVALS: FestivalSlug[] = [...FESTIVAL_IDS];
export const YEAR_MIN = 1865;
export const YEAR_MAX = 2026;
export const TEXT_MIN = 10;
export const TEXT_MAX = 5000;
/** Transcriptions copy whole documents, so they get a longer limit than memories. */
export const TRANSCRIPTION_MAX = 15000;
/** Longest value of one field, and the longest `texto` of a transcript change (the database checks the same). */
export const VALUE_MAX = 500;
/** What a report is about, and what is wrong with it ("Informar un error"). */
export const OBJETIVOS = ['documento', 'video'] as const;
export type Objetivo = (typeof OBJETIVOS)[number];
export const PROBLEMAS = ['no_corresponde', 'otra_edicion', 'otro'] as const;
export type Problema = (typeof PROBLEMAS)[number];
/** Length of a report's explanation and of a note. */
export const REPORT_MIN = 10;
export const REPORT_MAX = 1000;

const OFFLINE: Result = { ok: false, key: 'estado.sin_conexion' };
const fail = (k: string): Validation => ({ ok: false, key: `contrib.error.${k}` });
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const len = (s: string): number => [...s].length;

function isoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Longest accepted "Fuente" (where a fact comes from: a book, a newspaper, a person). */
export const FUENTE_MAX = 200;

/** A fact plus its optional public source, shared by every fact of a submission. */
function validateFact(input: Record<string, unknown>): Validation {
  const v = validateFactBody(input);
  if (!v.ok) return v;
  const fuente = str(input.fuente);
  if (len(fuente) > FUENTE_MAX) return fail('fuente');
  return fuente ? { ok: true, payload: { ...v.payload, fuente } } : v;
}

function validateFactBody(input: Record<string, unknown>): Validation {
  const field = str(input.field);
  if (!(FACT_FIELDS as readonly string[]).includes(field)) return fail('campo');
  if (field === 'competencia') {
    const numero = str(input.numero);
    const descripcion = str(input.descripcion);
    if (!numero || !descripcion) return fail('competencia');
    if (len(numero) > 20 || len(descripcion) > VALUE_MAX) return fail('valor');
    const payload: Record<string, unknown> = { field, numero, descripcion };
    for (const k of ['categoria', 'idioma']) {
      const v = str(input[k]);
      if (len(v) > 100) return fail('valor');
      if (v) payload[k] = v;
    }
    return { ok: true, payload };
  }
  const value = str(input.value);
  if (field === 'start_date' || field === 'end_date') {
    return isoDate(value) ? { ok: true, payload: { field, value } } : fail('fecha');
  }
  if (field === 'edicion_realizada') {
    const v = value.toLowerCase().replace('sí', 'si');
    return v === 'si' || v === 'no' ? { ok: true, payload: { field, value: v } } : fail('valor');
  }
  if (!value || len(value) > VALUE_MAX) return fail('valor');
  return { ok: true, payload: { field, value } };
}

function validateTag(input: Record<string, unknown>): Validation {
  const payload: Record<string, unknown> = {};
  const y = str(input.year);
  if (y) {
    const n = Number(y);
    if (!/^\d{4}$/.test(y) || n < YEAR_MIN || n > YEAR_MAX) return fail('ano');
    payload.year = n;
  }
  const cat = str(input.tipo);
  if (cat) {
    if (!CATEGORIES.includes(cat as CategorySlug)) return fail('etiqueta');
    payload.tipo = cat;
  }
  const fest = str(input.coleccion);
  if (fest) {
    if (!FESTIVALS.includes(fest as FestivalSlug)) return fail('etiqueta');
    payload.coleccion = fest;
  }
  return Object.keys(payload).length ? { ok: true, payload } : fail('etiqueta');
}

/** The copy of a video a report carries, so a page can show it where it was moved to. */
function videoCopy(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  const out: Record<string, string> = { id };
  for (const k of ['title', 'channel', 'kind']) {
    const x = str(o[k]);
    if (len(x) > 300) return null;
    if (x) out[k] = x;
  }
  return out;
}

/** Most changes one video_text contribution may carry. */
export const MAX_CAMBIOS = 200;
/** Longest original line (`antes`) a change may target. */
export const ANTES_MAX = 2000;
/** The festivals whose videos can be corrected. */
const VIDEO_FESTIVALS: readonly FestivalSlug[] = VIDEO_TEXT_FESTIVALS;

/**
 * A transcript correction: changes to the lines of one video. A change to a line (`antes`) sets its words, its
 * language or both, or removes it; an add (no `antes`) needs words. A change whose texto equals its `antes` and sets no
 * language changes nothing and is dropped; a malformed one makes the whole contribution fail (video_cambios / video_texto).
 */
function validateVideoText(input: Record<string, unknown>): Validation {
  const v = input.video as Record<string, unknown> | null | undefined;
  const id = v && typeof v === 'object' ? str(v.id) : '';
  if (!/^[\w-]{6,20}$/.test(id)) return fail('video_id');
  const raw = Array.isArray(input.cambios) ? input.cambios : [];
  if (raw.length > MAX_CAMBIOS) return fail('video_cambios');
  const cambios: Cambio[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return fail('video_cambios');
    const o = r as Record<string, unknown>;
    if (typeof o.t !== 'number' || !Number.isFinite(o.t) || o.t < 0) return fail('video_cambios');
    if (o.idioma != null && o.idioma !== 'es' && o.idioma !== 'cy') return fail('video_cambios');
    const c: Cambio = { t: o.t };
    if (o.antes != null && str(o.antes)) {
      if (len(str(o.antes)) > ANTES_MAX) return fail('video_antes');
      c.antes = str(o.antes);
    }
    if (o.quitar === true) {
      if (c.antes === undefined) return fail('video_cambios');
      c.quitar = true;
    } else if (o.texto == null && c.antes !== undefined && o.idioma) {
      // A language-only change to an existing line: its words stay.
    } else {
      const texto = str(o.texto);
      if (!texto) return o.texto == null ? fail('video_cambios') : fail('video_texto');
      if (len(texto) > VALUE_MAX) return fail('video_texto');
      // The same words change nothing; with a language it is still a language change.
      if (texto === c.antes) {
        if (!o.idioma) continue;
      } else c.texto = texto;
    }
    if (o.idioma) c.idioma = o.idioma as 'es' | 'cy';
    if (cambios.some((x) => x.t === c.t && x.antes === c.antes)) return fail('video_repetido');
    cambios.push(c);
  }
  if (cambios.length < 1) return fail('video_cambios');
  const video: Record<string, string> = { id };
  const title = str(v!.title);
  if (title) video.title = [...title].slice(0, 300).join('');
  const payload: Record<string, unknown> = { video };
  const base = str(input.base);
  if (base && len(base) <= 40 && !Number.isNaN(Date.parse(base))) payload.base = base;
  payload.cambios = cambios;
  return { ok: true, payload };
}

/**
 * A report: what it is about, what is wrong, why, and for "otra_edicion" the
 * fix (a video has no section, so its category is dropped). `actual` (where it
 * is listed now) only refuses a fix that changes nothing; it is not sent.
 */
function validateReport(input: Record<string, unknown>): Validation {
  const objetivo = str(input.objetivo);
  if (!(OBJETIVOS as readonly string[]).includes(objetivo)) return fail('objetivo');
  const video = objetivo === 'video' ? videoCopy(input.video) : null;
  if (objetivo === 'video' && !video) return fail('objetivo');
  const problema = str(input.problema);
  if (!(PROBLEMAS as readonly string[]).includes(problema)) return fail('problema');
  const texto = str(input.texto);
  if (len(texto) < REPORT_MIN || len(texto) > REPORT_MAX) return fail('texto_informe');
  const payload: Record<string, unknown> = { objetivo, problema, texto };
  if (video) payload.video = video;
  if (problema === 'otra_edicion') {
    const raw = { ...((input.arreglo ?? {}) as Record<string, unknown>) };
    if (objetivo === 'video') delete raw.tipo;
    const v = validateTag(raw);
    if (!v.ok) return fail('arreglo');
    const actual = (input.actual ?? {}) as Record<string, unknown>;
    const same = Object.entries(v.payload).every(([k, x]) => String(actual[k] ?? '') === String(x));
    if (same) return fail('arreglo');
    payload.arreglo = v.payload;
  }
  return { ok: true, payload };
}

/** Check a contribution before it is sent. The payload is what goes into `contributions.payload`. */
export function validate(kind: Kind, input: Record<string, unknown>): Validation {
  input = input ?? {};
  switch (kind) {
    case 'upload': {
      const f = input.file as { type?: string; size?: number } | undefined;
      if (!f || typeof f.size !== 'number') return fail('archivo');
      if (!MIME_EXT[f.type ?? '']) return fail('tipo_archivo');
      if (f.size > MAX_UPLOAD) return fail('muy_grande');
      if (f.size <= 0) return fail('archivo');
      const tipo = str(input.tipo);
      if (!CATEGORIES.includes(tipo as CategorySlug)) return fail('categoria');
      const description = str(input.description);
      if (len(description) > VALUE_MAX) return fail('valor');
      const payload: Record<string, unknown> = { tipo };
      if (tipo === 'programa') {
        const alcance = str(input.alcance);
        if (!(ALCANCES as readonly string[]).includes(alcance)) return fail('alcance');
        payload.alcance = alcance;
      }
      if (description) payload.description = description;
      return { ok: true, payload };
    }
    case 'fact':
      return validateFact(input);
    case 'tag':
      return validateTag(input);
    case 'transcription': {
      const text = str(input.text);
      if (len(text) < TEXT_MIN || len(text) > TRANSCRIPTION_MAX) return fail('texto_transcripcion');
      return { ok: true, payload: { text } };
    }
    case 'memory': {
      const text = str(input.text);
      if (len(text) < TEXT_MIN || len(text) > TEXT_MAX) return fail('texto');
      return { ok: true, payload: { text } };
    }
    case 'report':
      return validateReport(input);
    case 'note': {
      const text = str(input.text);
      if (len(text) < REPORT_MIN || len(text) > REPORT_MAX) return fail('texto_informe');
      return { ok: true, payload: { text } };
    }
    case 'video_text':
      return validateVideoText(input);
    default:
      return fail('campo');
  }
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function mapInsertError(e: { message?: string; code?: string } | null | undefined): Result {
  const msg = e?.message ?? '';
  if (msg.includes('daily_limit')) return { ok: false, key: 'contrib.error.limite' };
  // The database's check of a transcript correction (video_text_valid) refused what validation let through.
  if (msg === 'invalid') return { ok: false, key: 'contrib.error.video_cambios' };
  if (e?.code === '42501' || /row-level security|JWT/i.test(msg)) return { ok: false, key: 'contrib.error.sesion' };
  return OFFLINE;
}

/** The signed-in user's id (null signed out), via liveQuery so it never throws. */
function signedInUid(client: SupabaseClient) {
  return liveQuery(async (c) => {
    const { data, error } = await c.auth.getSession();
    return { data: data?.session?.user?.id ?? null, error };
  }, null as string | null, 6000, client);
}

/** Most facts one submission may carry. */
export const MAX_FACTS = 15;

/**
 * Send several facts of one edition as pending rows in a single insert (all or
 * nothing, e.g. at the daily limit). They share the optional fuente and, when
 * more than one, a `lote` id so the admin queue can review them together.
 * A failing fact is reported with its position (`index`).
 */
export async function submitFacts(
  coleccion: FestivalSlug,
  year: number,
  facts: Record<string, unknown>[],
  fuente: string,
  client: SupabaseClient | null = getClient(),
): Promise<Result & { index?: number }> {
  if (!facts.length) return fail('campo');
  if (facts.length > MAX_FACTS) return fail('demasiados');
  const payloads: Record<string, unknown>[] = [];
  for (const [index, f] of facts.entries()) {
    const v = validate('fact', { ...f, fuente });
    if (!v.ok) return { ...v, index };
    payloads.push(v.payload);
  }
  if (!client) return OFFLINE;
  const s = await signedInUid(client);
  if (s.offline) return OFFLINE;
  const uid = s.data;
  if (!uid) return { ok: false, key: 'contrib.error.sesion' };
  const lote = payloads.length > 1 ? uuid() : null;
  const rows = payloads.map((payload) => ({
    user_id: uid, type: 'fact', coleccion, year, item_id: null, status: 'pending',
    payload: lote ? { ...payload, lote } : payload,
  }));
  try {
    const { error } = await client.from('contributions').insert(rows);
    return error ? mapInsertError(error as any) : { ok: true };
  } catch {
    return OFFLINE;
  }
}

/**
 * Send a contribution as a pending row. Uploads go to `uploads/<uid>/<uuid>.<ext>`
 * first and the row carries `payload.storage_path`. Never throws.
 */
export async function submit(
  kind: Kind,
  coleccion: FestivalSlug | null,
  year: number | null,
  itemId: string | null,
  input: Record<string, unknown>,
  client: SupabaseClient | null = getClient(),
): Promise<Result> {
  const v = validate(kind, input);
  if (!v.ok) return v;
  // validate() does not see the edition: only Chubut and Trevelin videos can be corrected.
  if (kind === 'video_text' && !VIDEO_FESTIVALS.includes(coleccion as FestivalSlug)) return fail('edicion');
  if (!client) return OFFLINE;
  const s = await signedInUid(client);
  if (s.offline) return OFFLINE;
  const uid = s.data;
  if (!uid) return { ok: false, key: 'contrib.error.sesion' };

  const payload = { ...v.payload };
  let stored: string | null = null;
  if (kind === 'upload') {
    const f = input.file as Blob & { type: string };
    const path = `${uid}/${uuid()}.${MIME_EXT[f.type]}`;
    try {
      const { error } = await client.storage.from('uploads').upload(path, f, { contentType: f.type, upsert: false });
      if (error) return /maximum allowed size|too large|413/i.test(String((error as any).message ?? ''))
        ? { ok: false, key: 'contrib.error.muy_grande' }
        : OFFLINE;
    } catch {
      return OFFLINE;
    }
    stored = path;
    payload.storage_path = path;
  }

  let res: Result;
  try {
    const { error } = await client.from('contributions').insert({
      user_id: uid,
      type: kind,
      coleccion,
      year,
      item_id: itemId,
      payload,
      status: 'pending',
    });
    res = error ? mapInsertError(error as any) : { ok: true };
  } catch {
    res = OFFLINE;
  }
  if (!res.ok && stored) {
    try {
      await client.storage.from('uploads').remove([stored]); // best effort: no orphaned original
    } catch {
      /* ignore */
    }
  }
  return res;
}

/** Static (exported) rows plus live rows, deduplicated by id with the live copy winning; oldest first. */
export function mergeApproved(stat: Contribution[], live: Contribution[]): Contribution[] {
  const by = new Map<string, Contribution>();
  for (const c of stat ?? []) if (c?.id) by.set(c.id, c);
  for (const c of live ?? []) if (c?.id) by.set(c.id, c);
  return [...by.values()].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
}

/** Approved rows of one edition and type. */
export function forEdition(list: Contribution[], coleccion: string, year: number, type: Kind): Contribution[] {
  return list.filter((c) => c.coleccion === coleccion && c.year === year && c.type === type);
}


/**
 * ISO date from separate day, month (1-12) and four-digit year fields, or null
 * when a part is missing or the day does not exist. The form uses this instead
 * of <input type="date">, whose day/month order follows the browser's language.
 */
export function isoFromParts(day: string, month: string, year: string): string | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isoDate(iso) ? iso : null;
}

/** "8 de diciembre de 1937" (in the current language) for an ISO date; anything else is returned unchanged. */
export function longDate(iso: string): string {
  if (!isoDate(iso)) return iso;
  return formatDate(new Date(`${iso}T12:00:00Z`), 'long', 'UTC');
}

/** Label and text of an approved fact, as shown on the edition page (static build and live island alike). */
export function factDisplay(c: Contribution): { label: string; value: string } {
  const p = c.payload ?? {};
  const field = (FACT_FIELDS as readonly string[]).includes(p.field) ? p.field : 'other';
  const label = t(`contrib.campos.${field}`);
  if (field === 'competencia') {
    const extra = [p.categoria, p.idioma].map(str).filter(Boolean).join(', ');
    const base = t('contrib.competencia_valor', { numero: str(p.numero), descripcion: str(p.descripcion) });
    return { label, value: extra ? `${base} (${extra})` : base };
  }
  const value = str(p.value);
  if (field === 'start_date' || field === 'end_date') return { label, value: longDate(value) };
  if (field === 'edicion_realizada') return { label, value: value === 'no' ? t('contrib.no') : t('contrib.si') };
  return { label, value };
}

/**
 * True when a fact's value is the contributor's own text (a venue, names, a
 * competition), so in its original language; dates and yes/no are written in the
 * page's language.
 */
export function factInOriginal(c: Contribution): boolean {
  const field = c.payload?.field;
  return !['start_date', 'end_date', 'edicion_realizada'].includes(field);
}


/** Facts ordered by field (fact list order), then oldest first. */
export function sortFacts(list: Contribution[]): Contribution[] {
  const rank = (c: Contribution) => {
    const i = (FACT_FIELDS as readonly string[]).indexOf(c.payload?.field);
    return i < 0 ? FACT_FIELDS.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
}

/** JSON safe to put inside a <script type="application/json"> element. */
export function jsonForScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * The signed-in user's own pending contributions for one edition (also for an
 * admin, who could read everyone's). [] when signed out, offline or on error.
 */
export async function ownPending(coleccion: string, year: number, client: SupabaseClient | null = getClient()): Promise<Contribution[]> {
  if (!client) return [];
  const session = await liveQuery(async (c) => {
    const { data, error } = await c.auth.getSession();
    return { data: data?.session?.user?.id ?? null, error };
  }, null as string | null, 6000, client);
  const uid = session.data;
  if (!uid) return [];
  const rows = await liveQuery<Contribution[]>(
    (c) =>
      c.from('contributions')
        .select('id, type, coleccion, year, item_id, payload, created_at, reviewed_at')
        .eq('user_id', uid)
        .eq('status', 'pending')
        .eq('coleccion', coleccion)
        .eq('year', year)
        .in('type', ['fact', 'memory', 'upload'])
        .order('created_at', { ascending: true })
        .limit(100),
    [],
    6000,
    client,
  );
  return rows.data;
}

/** The signed-in user's own pending video_text contributions for one video. [] when signed out, offline or on error. */
export async function ownPendingVideo(videoId: string, client: SupabaseClient | null = getClient()): Promise<Contribution[]> {
  if (!client) return [];
  const session = await signedInUid(client);
  const uid = session.data;
  if (!uid) return [];
  const rows = await liveQuery<Contribution[]>(
    (c) =>
      c.from('contributions')
        .select('id, type, coleccion, year, item_id, payload, created_at, reviewed_at')
        .eq('user_id', uid)
        .eq('status', 'pending')
        .eq('type', 'video_text')
        .eq('payload->video->>id', videoId)
        .order('created_at', { ascending: true })
        .limit(100),
    [],
    6000,
    client,
  );
  return rows.data;
}

export type PendingView = { section: 'hechos' | 'recuerdos' | 'aportes'; text: string; preview: 'image' | 'pdf' | null; path: string | null; label: string | null };

/** Where a pending contribution shows on the edition page, its text, and whether its original can be previewed. */
export function pendingView(c: Contribution): PendingView {
  const p = c.payload ?? {};
  if (c.type === 'fact') {
    const { label, value } = factDisplay(c);
    return { section: 'hechos', text: `${label}: ${value}`, preview: null, path: null, label: null };
  }
  if (c.type === 'memory') return { section: 'recuerdos', text: String(p.text ?? ''), preview: null, path: null, label: null };
  const path = typeof p.storage_path === 'string' ? p.storage_path : null;
  const ext = path?.split('.').pop()?.toLowerCase() ?? '';
  const preview = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : ext === 'pdf' ? 'pdf' : null;
  const text = String(p.description ?? '') || (p.tipo ? t(`categorias.${p.tipo}`) : '');
  // The stored name is a random id, so a PDF gets a plain label instead.
  return { section: 'aportes', text, preview, path, label: preview === 'pdf' ? t('edicion.archivo_pdf') : null };
}

/** Approved facts, memories and uploads of one edition, live from the public view. */
export function approvedForEdition(coleccion: string, year: number, client: SupabaseClient | null = getClient()) {
  return liveQuery<Contribution[]>(
    (c) =>
      c.from('public_contributions')
        .select('id, type, coleccion, year, item_id, payload, created_at, reviewed_at, display_name')
        .eq('coleccion', coleccion)
        .eq('year', year)
        .in('type', ['fact', 'memory', 'upload', 'transcription'])
        .order('created_at', { ascending: true })
        .limit(500),
    [],
    6000,
    client,
  );
}

/** Approved transcriptions of one catalog item, oldest first. */
export function approvedTranscriptions(itemId: string, client: SupabaseClient | null = getClient()) {
  return liveQuery<Contribution[]>(
    (c) =>
      c.from('public_contributions')
        .select('id, type, coleccion, year, item_id, payload, created_at, reviewed_at, display_name')
        .eq('type', 'transcription')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true })
        .limit(50),
    [],
    6000,
    client,
  );
}

/** Approved notes ("Agregar información") of one catalog item, oldest first. */
export function approvedNotes(itemId: string, client: SupabaseClient | null = getClient()) {
  return liveQuery<Contribution[]>(
    (c) =>
      c.from('public_contributions')
        .select('id, type, coleccion, year, item_id, payload, created_at, reviewed_at, display_name')
        .eq('type', 'note')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true })
        .limit(50),
    [],
    6000,
    client,
  );
}

/** "Fuente: …" for a fact that names where it comes from; null otherwise. */
/** A fact's source as a label plus its link, when the source ends with a URL ("Diario Jornada, 14/10/2024: https://…"),
 *  so the page shows the short label as a link instead of the long address (#78). */
export function splitFuente(f: string): { label: string; href?: string } {
  const m = /^(.*?)[\s:,]*\(?(https?:\/\/[^\s()]+)\)?\s*$/.exec(f.trim());
  if (!m) return { label: f.trim() };
  let host = m[2];
  try {
    host = new URL(m[2]).hostname.replace(/^www\./, '');
  } catch {
    return { label: f.trim() };
  }
  return { label: m[1].trim() || host, href: m[2] };
}

export function sourceLine(c: Contribution): string | null {
  const f = String(c.payload?.fuente ?? '').trim();
  return f ? t('edicion.fuente', { fuente: f }) : null;
}

