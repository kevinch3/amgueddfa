/**
 * Admin curation from the item page (scripts/admin-item.ts): corrections of an
 * item (the overlay, src/lib/tags.ts) and the document's transcription. Both
 * are public the moment they are saved; the static pages catch up through the
 * export workflow (issue #27).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './supabase';

export type Result = { ok: true } | { ok: false; key: string };
const OK: Result = { ok: true };
const OFFLINE: Result = { ok: false, key: 'estado.sin_conexion' };

/** The fields an admin edits; `caption` is the item's public note (note_public). */
export type OverlayValues = {
  title: string; category: string; festival: string; year: number | null;
  rights: string; caption: string; no_text: boolean; hidden: boolean;
};

/** Only what changed, as a tag payload; an empty object means nothing to save. */
export function correctionPayload(now: OverlayValues, next: OverlayValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const title = next.title.trim();
  if (title && title !== now.title) out.title = title;
  if (next.category !== now.category) out.category = next.category;
  if (next.festival !== now.festival) out.festival = next.festival;
  if (next.year !== null && next.year !== now.year) out.year = next.year;
  for (const k of ['rights', 'caption'] as const) if (next[k].trim() !== now[k].trim()) out[k] = next[k].trim();
  for (const k of ['no_text', 'hidden'] as const) if (next[k] !== now[k]) out[k] = next[k];
  return out;
}

/** Item ids from free text ("a1b2…, c3d4…" or one per line): lower case, once each, in order; null if one is not an id. */
export function parseItems(s: string): string[] | null {
  const ids = s.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (ids.some((x) => !/^[0-9a-f]{12}$/.test(x))) return null;
  return [...new Set(ids)];
}

/** rpc error → message key. */
export function curationError(e: { message?: string; code?: string } | null | undefined): Result {
  const m = e?.message ?? '';
  if (m.includes('not_admin')) return { ok: false, key: 'admin.error.no_admin' };
  if (m.includes('item_in_other_document')) return { ok: false, key: 'admin_item.error_otro_documento' };
  if (m.includes('transcriptions_private_winners')) return { ok: false, key: 'admin_item.error_ganadores_privados' };
  if (m.includes('invalid_value') || e?.code === '23514') return { ok: false, key: 'admin.error.valor' };
  return OFFLINE;
}

async function call(client: SupabaseClient | null, fn: string, args: Record<string, unknown>): Promise<Result> {
  if (!client) return OFFLINE;
  try {
    const { error } = await client.rpc(fn, args);
    return error ? curationError(error as { message?: string; code?: string }) : OK;
  } catch {
    return OFFLINE;
  }
}

export function saveCorrection(item: string, festival: string, year: number | null, payload: Record<string, unknown>, client = getClient()): Promise<Result> {
  return call(client, 'admin_correct_item', { p_item: item, p_festival: festival, p_year: year, p_payload: payload });
}

export type DocRow = { id: string; items: string[]; kind: 'programa' | 'ganadores'; festival: string | null; text: string; public: boolean; updated_at: string };

/** Every document (any kind, private ones too: admins only) that covers this item. */
export async function docsFor(item: string, client = getClient()): Promise<DocRow[] | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.from('transcriptions').select('id, items, kind, festival, text, public, updated_at').contains('items', [item]);
    return error ? null : ((data ?? []) as DocRow[]);
  } catch {
    return null;
  }
}

export function saveTranscription(d: Omit<DocRow, 'updated_at'>, client = getClient()): Promise<Result> {
  return call(client, 'admin_save_transcription', {
    p_id: d.id, p_items: d.items, p_kind: d.kind, p_festival: d.festival, p_text: d.text, p_public: d.public,
  });
}

export type Version = { changed_at: string; op: 'insert' | 'update' | 'delete'; who: string | null; text: string };

/** The document's versions, newest first, with the editor's display name. */
export async function historyOf(id: string, client = getClient(), limit = 20): Promise<Version[] | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.from('transcription_history').select('changed_at, op, changed_by, text')
      .eq('transcription_id', id).order('changed_at', { ascending: false }).limit(limit);
    if (error) return null;
    const ids = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const p = await client.from('profiles').select('id, display_name').in('id', ids);
      for (const r of p.data ?? []) names.set(r.id, r.display_name);
    }
    return (data ?? []).map((r) => ({ changed_at: r.changed_at, op: r.op, text: r.text, who: r.changed_by ? (names.get(r.changed_by) ?? null) : null }));
  } catch {
    return null;
  }
}
