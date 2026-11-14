import type { SupabaseClient } from '@supabase/supabase-js';
import { t } from './i18n';
import { liveQuery } from './live';
import { getClient } from './supabase';
import type { CategorySlug, FestivalSlug } from './types';

export type Kind = 'upload' | 'fact' | 'tag' | 'transcription' | 'memory';
export type Result = { ok: true } | { ok: false; key: string };
export type Validation = { ok: true; payload: Record<string, unknown> } | { ok: false; key: string };

/** A row of the `public_contributions` view (also the shape of data/approved/contributions.json). */
export interface Contribution {
  id: string;
  type: Kind;
  festival: FestivalSlug | null;
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
export const FESTIVALS: FestivalSlug[] = ['chubut', 'juventud', 'mimosa', 'trevelin'];
export const YEAR_MIN = 1865;
export const YEAR_MAX = 2026;
export const TEXT_MIN = 10;
export const TEXT_MAX = 5000;
const VALUE_MAX = 500;

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

function validateFact(input: Record<string, unknown>): Validation {
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
  const cat = str(input.category);
  if (cat) {
    if (!CATEGORIES.includes(cat as CategorySlug)) return fail('etiqueta');
    payload.category = cat;
  }
  const fest = str(input.festival);
  if (fest) {
    if (!FESTIVALS.includes(fest as FestivalSlug)) return fail('etiqueta');
    payload.festival = fest;
  }
  return Object.keys(payload).length ? { ok: true, payload } : fail('etiqueta');
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
      const category = str(input.category);
      if (!CATEGORIES.includes(category as CategorySlug)) return fail('categoria');
      const description = str(input.description);
      if (len(description) > VALUE_MAX) return fail('valor');
      const payload: Record<string, unknown> = { category };
      if (category === 'programa') {
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
    case 'transcription':
    case 'memory': {
      const text = str(input.text);
      if (len(text) < TEXT_MIN || len(text) > TEXT_MAX) return fail('texto');
      return { ok: true, payload: { text } };
    }
    default:
      return fail('campo');
  }
}

function uuid(): string {
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
  if (e?.code === '42501' || /row-level security|JWT/i.test(msg)) return { ok: false, key: 'contrib.error.sesion' };
  return OFFLINE;
}

/**
 * Send a contribution as a pending row. Uploads go to `uploads/<uid>/<uuid>.<ext>`
 * first and the row carries `payload.storage_path`. Never throws.
 */
export async function submit(
  kind: Kind,
  festival: FestivalSlug | null,
  year: number | null,
  itemId: string | null,
  input: Record<string, unknown>,
  client: SupabaseClient | null = getClient(),
): Promise<Result> {
  const v = validate(kind, input);
  if (!v.ok) return v;
  if (!client) return OFFLINE;
  const s = await liveQuery(async (c) => {
    const { data, error } = await c.auth.getSession();
    return { data: data?.session?.user?.id ?? null, error };
  }, null as string | null, 6000, client);
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
      festival,
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
export function forEdition(list: Contribution[], festival: string, year: number, type: Kind): Contribution[] {
  return list.filter((c) => c.festival === festival && c.year === year && c.type === type);
}


function longDate(iso: string): string {
  if (!isoDate(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
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

/** "Aportó <nombre>", or '' when the contributor has no public name. */
export function byLine(c: Contribution): string {
  return c.display_name ? t('edicion.aportado_por', { nombre: c.display_name }) : '';
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
export async function ownPending(festival: string, year: number, client: SupabaseClient | null = getClient()): Promise<Contribution[]> {
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
        .select('id, type, festival, year, item_id, payload, created_at, reviewed_at')
        .eq('user_id', uid)
        .eq('status', 'pending')
        .eq('festival', festival)
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

export type PendingView = { section: 'hechos' | 'recuerdos' | 'aportes'; text: string; preview: 'image' | 'pdf' | null; path: string | null };

/** Where a pending contribution shows on the edition page, its text, and whether its original can be previewed. */
export function pendingView(c: Contribution): PendingView {
  const p = c.payload ?? {};
  if (c.type === 'fact') {
    const { label, value } = factDisplay(c);
    return { section: 'hechos', text: `${label}: ${value}`, preview: null, path: null };
  }
  if (c.type === 'memory') return { section: 'recuerdos', text: String(p.text ?? ''), preview: null, path: null };
  const path = typeof p.storage_path === 'string' ? p.storage_path : null;
  const ext = path?.split('.').pop()?.toLowerCase() ?? '';
  const preview = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : ext === 'pdf' ? 'pdf' : null;
  const text = String(p.description ?? '') || (p.category ? t(`categorias.${p.category}`) : '');
  return { section: 'aportes', text, preview, path };
}
