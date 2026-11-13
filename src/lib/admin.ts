import type { SupabaseClient } from '@supabase/supabase-js';
import { validate, type Kind } from './contrib';
import { makePages } from './derive';
import { liveQuery } from './live';
import { getClient } from './supabase';

export type Result = { ok: true } | { ok: false; key: string };

/** A contribution row as an admin reads it from `contributions`. */
export interface Pending {
  id: string;
  user_id: string;
  type: Kind;
  festival: string | null;
  year: number | null;
  item_id: string | null;
  payload: Record<string, any>;
  created_at: string;
  display_name?: string | null;
}

/** Approved rows (static export or live) as far as fillsGap needs them. */
export type ApprovedLike = { type: string; festival: string | null; year: number | null; payload: Record<string, any> | null };
/** What fillsGap checks: "festival|year|category" keys of the static catalog, plus approved uploads. */
export type GapCtx = { catalog: Iterable<string> | Set<string>; approved: ApprovedLike[] };

const OFFLINE: Result = { ok: false, key: 'estado.sin_conexion' };
const OK: Result = { ok: true };
const SIGNED_TTL = 600;
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

const key = (festival: string, year: number, category: string) => `${festival}|${year}|${category}`;

/** Precompute the edition/category keys of the static catalog (build time, see admin.astro). */
export function editionKeys(list: { festival: string; year: number | null; category: string }[]): string[] {
  const out = new Set<string>();
  for (const i of list) if (i.year !== null) out.add(key(i.festival, i.year, i.category));
  return [...out].sort();
}

/**
 * True when the edition has nothing in that category, neither in the static
 * catalog nor among approved uploads (live or exported). No edition, no gap.
 */
export function fillsGap(festival: string | null, year: number | null, category: string, ctx: GapCtx): boolean {
  if (!festival || year === null || !category) return false;
  const k = key(festival, year, category);
  const cat = ctx.catalog instanceof Set ? ctx.catalog : new Set(ctx.catalog);
  if (cat.has(k)) return false;
  return !ctx.approved.some(
    (c) => c.type === 'upload' && c.festival === festival && c.year === year && c.payload?.category === category,
  );
}

/**
 * The "Llena un hueco" choice for one pending upload. `touched` is set once
 * the admin changes the checkbox; until then the value follows fillsGap and
 * is recomputed whenever another upload is approved.
 */
export type GapChoice = { festival: string | null; year: number | null; category: string; checked: boolean; touched: boolean };

export function gapChoice(c: Pending, ctx: GapCtx): GapChoice {
  const category = String(c.payload?.category ?? '');
  return { festival: c.festival, year: c.year, category, checked: fillsGap(c.festival, c.year, category, ctx), touched: false };
}

/** The override to pass to approveUpload: only an explicit admin choice. */
export function gapOverride(g: GapChoice): boolean | undefined {
  return g.touched ? g.checked : undefined;
}

/** After an upload is approved: count it, then recompute every untouched choice. */
export function recordApprovedUpload(c: Pending, ctx: GapCtx, choices: GapChoice[]): void {
  ctx.approved.push({ type: 'upload', festival: c.festival, year: c.year, payload: c.payload });
  for (const g of choices) if (!g.touched) g.checked = fillsGap(g.festival, g.year, g.category, ctx);
}

/** rpc error → es-AR message key. */
export function mapRpcError(e: { message?: string } | null | undefined): Result {
  const m = e?.message ?? '';
  if (m.includes('not_pending')) return { ok: false, key: 'admin.error.ya_revisado' };
  if (m.includes('not_admin')) return { ok: false, key: 'admin.error.no_admin' };
  if (m.includes('not_found')) return { ok: false, key: 'admin.error.no_encontrado' };
  if (m.includes('invalid_value') || m.includes('edition_required')) return { ok: false, key: 'admin.error.valor' };
  return OFFLINE;
}

async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Result> {
  try {
    const { error } = await client.rpc(fn, args);
    return error ? mapRpcError(error as any) : OK;
  } catch {
    return OFFLINE;
  }
}

/** Short-lived signed URL of an upload's original, or null. */
export async function signedUrl(path: string, client: SupabaseClient | null = getClient(), ttl = SIGNED_TTL): Promise<string | null> {
  if (!client || !path) return null;
  try {
    const { data, error } = await client.storage.from('uploads').createSignedUrl(path, ttl);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}

/** The private text of a restricted doc/web/table item (no page images): `restricted/<id>/text.txt`. */
export const TEXT_FILE = 'text.txt';
const TEXT_TYPE = 'text/plain; charset=utf-8';

type RestrictedRef = { id: string; thumb: string | null; page_paths: string[] };
export type RestrictedView = { thumb: string | null; pages: string[]; text: string | null };

/** True when the item has no page images, so its only derivative is text.txt. */
export const textOnly = (item: RestrictedRef): boolean => !item.thumb && item.page_paths.length === 0;

/**
 * What an admin sees before releasing a restricted item: signed URLs (10 min)
 * of its thumbnail and pages, or, for an item without images, its text.txt.
 * Null offline or if nothing could be read.
 */
export async function restrictedPreview(item: RestrictedRef, client: SupabaseClient | null = getClient()): Promise<RestrictedView | null> {
  if (!client) return null;
  if (textOnly(item)) {
    try {
      const { data, error } = await client.storage.from('restricted').download(`${item.id}/${TEXT_FILE}`);
      if (error || !data) return null;
      const text = (await data.text()).trim();
      return text ? { thumb: null, pages: [], text } : null;
    } catch {
      return null;
    }
  }
  const sign = async (name: string): Promise<string | null> => {
    try {
      const { data, error } = await client.storage.from('restricted').createSignedUrl(`${item.id}/${name}`, SIGNED_TTL);
      return error ? null : (data?.signedUrl ?? null);
    } catch {
      return null;
    }
  };
  const thumb = item.thumb ? await sign(base(item.thumb)) : null;
  const pages: string[] = [];
  for (const p of item.page_paths) {
    const u = await sign(base(p));
    if (u) pages.push(u);
  }
  return thumb || pages.length ? { thumb, pages, text: null } : null;
}

/** MIME type of an upload from its stored extension (set by contrib.submit), else the blob's. */
export function mimeOf(path: string, blobType = ''): string {
  return MIME_BY_EXT[(path.split('.').pop() ?? '').toLowerCase()] ?? blobType;
}

type Make = (file: Blob, mime: string) => Promise<{ pages: Blob[]; thumb: Blob }>;
type FetchLike = (url: string) => Promise<{ ok: boolean; blob(): Promise<Blob> }>;

export interface UploadOpts {
  gap: GapCtx;
  /** The admin's explicit choice; when absent, fillsGap(…) decides. */
  fillsGap?: boolean;
  client?: SupabaseClient | null;
  fetchFn?: FetchLike;
  make?: Make;
}

const base = (p: string) => p.split('/').pop() ?? p;
const pageName = (i: number) => `p${String(i + 1).padStart(2, '0')}.webp`;

/**
 * Approve an upload: download the original (signed URL), make the derivatives
 * in this browser, put them in `media/uploads/<cid>/…`, then approve with the
 * media paths in the payload. Re-running after a partial failure overwrites the
 * same objects (upsert), and the rpc only succeeds once.
 */
export async function approveUpload(c: Pending, opts: UploadOpts): Promise<Result> {
  const client = opts.client === undefined ? getClient() : opts.client;
  const fetchFn = opts.fetchFn ?? ((u: string) => fetch(u));
  const make = opts.make ?? ((f, m) => makePages(f, m));
  if (!client) return OFFLINE;
  const path = String(c.payload?.storage_path ?? '');
  if (!path) return { ok: false, key: 'admin.error.sin_archivo' };

  // Another admin may have reviewed it since the queue loaded: publish nothing then.
  const status = await currentStatus(client, c.id);
  if (status === null) return OFFLINE;
  if (status === 'missing') return { ok: false, key: 'admin.error.no_encontrado' };
  if (status !== 'pending') return { ok: false, key: 'admin.error.ya_revisado' };

  const signed = await signedUrl(path, client);
  if (!signed) return { ok: false, key: 'admin.error.sin_archivo' };
  let original: Blob;
  try {
    const res = await fetchFn(signed);
    if (!res.ok) return { ok: false, key: 'admin.error.sin_archivo' };
    original = await res.blob();
  } catch {
    return OFFLINE;
  }

  let made: { pages: Blob[]; thumb: Blob };
  try {
    made = await make(original, mimeOf(path, original.type));
  } catch {
    return { ok: false, key: 'admin.error.derivados' };
  }

  const dir = `uploads/${c.id}`;
  const files: [string, Blob][] = [[`${dir}/thumb.webp`, made.thumb], ...made.pages.map((b, i): [string, Blob] => [`${dir}/${pageName(i)}`, b])];
  const paths = files.map(([p]) => p);
  for (const [p, body] of files) {
    let failed = false;
    try {
      const { error } = await client.storage.from('media').upload(p, body, { contentType: 'image/webp', upsert: true });
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      await removeQuietly(client, 'media', paths);
      return OFFLINE;
    }
  }

  const gap = opts.fillsGap ?? fillsGap(c.festival, c.year, String(c.payload?.category ?? ''), opts.gap);
  const res = await rpc(client, 'approve_contribution', {
    cid: c.id,
    fills_gap: gap,
    payload_override: { media: { thumb: paths[0], pages: paths.slice(1) } },
  });
  // Not approved (rejected meanwhile, network, validation): take the derivatives down again.
  if (!res.ok) await removeQuietly(client, 'media', paths);
  return res;
}

/** The row's review status right now, or null when it cannot be read. */
async function currentStatus(client: SupabaseClient, id: string): Promise<string | null> {
  try {
    const { data, error } = await client.from('contributions').select('status').eq('id', id).maybeSingle();
    if (error) return null;
    return data ? String((data as { status?: string }).status ?? '') : 'missing';
  } catch {
    return null;
  }
}

async function removeQuietly(client: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  try {
    await client.storage.from(bucket).remove(paths);
  } catch {
    /* best effort */
  }
}

/**
 * Approve a fact, tag, transcription or memory. `edited` (from "Editar y
 * aprobar") is validated like a new contribution and merged into the payload.
 */
export async function approve(c: Pending, edited: Record<string, unknown> | null, client: SupabaseClient | null = getClient()): Promise<Result> {
  if (c.type === 'upload') return { ok: false, key: 'admin.error.valor' };
  let override: Record<string, unknown> | null = null;
  if (edited) {
    const v = validate(c.type, edited);
    if (!v.ok) return v;
    override = v.payload;
  }
  if (!client) return OFFLINE;
  return rpc(client, 'approve_contribution', { cid: c.id, fills_gap: false, payload_override: override });
}

export async function reject(c: Pending, reason: string, client: SupabaseClient | null = getClient()): Promise<Result> {
  const note = (reason ?? '').trim();
  if (!note) return { ok: false, key: 'admin.error.motivo' };
  if (!client) return OFFLINE;
  const res = await rpc(client, 'reject_contribution', { cid: c.id, note });
  // A rejected original is never published or synced: do not keep it.
  const original = c.type === 'upload' ? String(c.payload?.storage_path ?? '') : '';
  if (res.ok && original) await removeQuietly(client, 'uploads', [original]);
  return res;
}

/**
 * Release a restricted item: copy `restricted/<id>/*` to `media/released/<id>/*`
 * (the thumbnail and every page the catalog lists or, for an item without
 * images, its text.txt), then mark it released.
 */
export async function releaseItem(item: RestrictedRef, client: SupabaseClient | null = getClient()): Promise<Result> {
  if (!client) return OFFLINE;
  const text = textOnly(item);
  const names = text ? [TEXT_FILE] : [...(item.thumb ? [base(item.thumb)] : []), ...item.page_paths.map(base)];
  for (const name of names) {
    let blob: Blob;
    try {
      const { data, error } = await client.storage.from('restricted').download(`${item.id}/${name}`);
      if (error || !data) return { ok: false, key: 'admin.error.sin_archivos' };
      blob = data;
    } catch {
      return OFFLINE;
    }
    try {
      const { error } = await client.storage
        .from('media')
        .upload(`released/${item.id}/${name}`, blob, { contentType: text ? TEXT_TYPE : 'image/webp', upsert: true });
      if (error) return OFFLINE;
    } catch {
      return OFFLINE;
    }
  }
  return rpc(client, 'release_item', { item_id: item.id });
}

export async function makeAdmin(uid: string, client: SupabaseClient | null = getClient()): Promise<Result> {
  if (!client) return OFFLINE;
  return rpc(client, 'set_role', { uid, role: 'admin' });
}

/* ---------- reads ---------- */

export async function loadQueue(type: Kind | '' = '', client: SupabaseClient | null = getClient()) {
  return liveQuery<Pending[]>(async (c) => {
    let q = c
      .from('contributions')
      .select('id, user_id, type, festival, year, item_id, payload, created_at, author:profiles!contributions_user_id_fkey(display_name)')
      .eq('status', 'pending');
    if (type) q = q.eq('type', type);
    const { data, error } = await q.order('created_at', { ascending: true }).limit(200);
    const rows = (data ?? []).map((r: any) => ({ ...r, display_name: r.author?.display_name ?? null, author: undefined }));
    return { data: rows as Pending[], error };
  }, [], 8000, client);
}

/** Approved uploads, for fillsGap. */
export async function loadApprovedUploads(client: SupabaseClient | null = getClient()) {
  return liveQuery<ApprovedLike[]>(
    (c) => c.from('contributions').select('type, festival, year, payload').eq('status', 'approved').eq('type', 'upload').limit(5000),
    [],
    8000,
    client,
  );
}

export async function loadReleased(client: SupabaseClient | null = getClient()) {
  return liveQuery<string[]>(async (c) => {
    const { data, error } = await c.from('released_items').select('item_id');
    return { data: (data ?? []).map((r: { item_id: string }) => r.item_id), error };
  }, [], 8000, client);
}

export type UserRow = { id: string; display_name: string | null; role: 'user' | 'admin'; points: number };

/** Profiles whose display name contains `q` (case-insensitive). LIKE wildcards in `q` match literally. */
export async function searchUsers(q: string, client: SupabaseClient | null = getClient()) {
  const term = (q ?? '').trim().replace(/[\\%_]/g, (m) => `\\${m}`);
  return liveQuery<UserRow[]>(
    (c) =>
      c.from('profiles')
        .select('id, display_name, role, points')
        .ilike('display_name', `%${term}%`)
        .order('display_name', { ascending: true })
        .limit(25),
    [],
    8000,
    client,
  );
}
