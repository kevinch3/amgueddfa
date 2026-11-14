import type { EditionState } from './types';

/** An approved contribution as far as media and coverage need it (export or live row). */
export type UploadLike = {
  id?: string;
  type: string;
  festival: string | null;
  year: number | null;
  payload: Record<string, any> | null;
  reviewed_at?: string | null;
};

/** Derivative object names approveUpload writes in the `media` bucket. */
const MEDIA_RE = /^uploads\/([0-9a-f-]{36})\/(thumb|p\d{2,})\.webp$/;

function ownPath(p: unknown, id: string | undefined, kind: 'thumb' | 'page'): p is string {
  if (typeof p !== 'string') return false;
  const m = MEDIA_RE.exec(p);
  if (!m) return false;
  if (id && m[1] !== id) return false;
  return kind === 'thumb' ? m[2] === 'thumb' : m[2] !== 'thumb';
}

/**
 * The validated derivative paths of an approved upload (payload.media), or
 * null when it has none. Anything not under `uploads/<this id>/` is dropped.
 */
export function uploadMedia(c: UploadLike): { thumb: string | null; pages: string[] } | null {
  if (c.type !== 'upload') return null;
  const m = c.payload?.media;
  if (!m || typeof m !== 'object') return null;
  const thumb = ownPath(m.thumb, c.id, 'thumb') ? m.thumb : null;
  const pages = Array.isArray(m.pages) ? m.pages.filter((p: unknown): p is string => ownPath(p, c.id, 'page')) : [];
  return thumb || pages.length ? { thumb, pages } : null;
}

/** Public URL of an object in the `media` bucket, built from PUBLIC_SUPABASE_URL; null without one. */
export function mediaUrl(base: string | undefined | null, path: string): string | null {
  const b = (base ?? '').trim().replace(/\/+$/, '');
  if (!b) return null;
  return `${b}/storage/v1/object/public/media/${path}`;
}

const RANK: Record<EditionState, number> = { none: 0, some: 1, full: 2 };

export function maxState(a: EditionState, b: EditionState): EditionState {
  return RANK[b] > RANK[a] ? b : a;
}

function stateOf(c: UploadLike): EditionState {
  if (c.type !== 'upload') return 'none';
  // Full only when an admin confirmed the programa is complete (a cover alone is not).
  if (c.payload?.category === 'programa' && c.payload?.complete === true && (uploadMedia(c)?.pages.length ?? 0) > 0) return 'full';
  return 'some';
}

/** What approved uploads say about one edition: a confirmed-complete programa with pages is full, anything else some. */
export function uploadState(list: UploadLike[], festival: string, year: number): EditionState {
  let s: EditionState = 'none';
  for (const c of list ?? []) if (c.festival === festival && c.year === year) s = maxState(s, stateOf(c));
  return s;
}

/** "festival:year" -> best state from approved uploads (editions without uploads are absent). */
export function uploadStates(list: UploadLike[]): Map<string, EditionState> {
  const out = new Map<string, EditionState>();
  for (const c of list ?? []) {
    if (c.type !== 'upload' || !c.festival || c.year === null) continue;
    const k = `${c.festival}:${c.year}`;
    out.set(k, maxState(out.get(k) ?? 'none', stateOf(c)));
  }
  return out;
}
