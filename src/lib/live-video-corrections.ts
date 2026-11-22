// Collaborators' approved transcript corrections, live in the video player (scripts/reproductor.ts): every visitor
// sees an approved correction at once, before the next export writes it into public/transcripciones-video/<id>.json
// (docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md, "Player: live corrections for everyone").
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatList, t } from './i18n';
import { liveQuery } from './live';
import { getClient } from './supabase';
import { applyCorrections, type CorrectionRow } from './video-corrections';
import { asTranscript, type Transcript } from './video-transcript';

export type Approved = { rows: CorrectionRow[]; offline: boolean };
/** A transcript as the player shows it: the lines, who corrected each line live, and everyone credited in the footer. */
export type LiveTranscript = { tr: Transcript; autores: Record<number, string[]>; nombres: string[] };

// Per client (the page has one), per video: asked once per page view; an answer that did not come is asked again.
const cache = new WeakMap<SupabaseClient, Map<string, Promise<Approved>>>();

const usable = (r: unknown): r is CorrectionRow => {
  const x = r as CorrectionRow | null;
  return !!x && typeof x.id === 'string' && !!x.payload && typeof x.payload === 'object';
};

/** The approved `video_text` corrections of one video, oldest approval first; no rows and offline when the database
 * cannot answer (never throws). */
export function approvedCorrections(videoId: string, client: SupabaseClient | null = getClient()): Promise<Approved> {
  if (!client) return Promise.resolve({ rows: [], offline: true });
  let byVideo = cache.get(client);
  if (!byVideo) cache.set(client, (byVideo = new Map()));
  const hit = byVideo.get(videoId);
  if (hit) return hit;
  const asked = liveQuery<unknown[]>(
    (c) =>
      c.from('public_contributions')
        .select('id, reviewed_at, display_name, payload')
        .eq('type', 'video_text')
        .eq('payload->video->>id', videoId)
        // Many rows share one reviewed_at (approved together): the id keeps their order the same on every visit.
        .order('reviewed_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1000),
    [],
    6000,
    client,
  ).then(({ data, offline }): Approved => ({ rows: (Array.isArray(data) ? data : []).filter(usable), offline }));
  byVideo.set(videoId, asked);
  void asked.then((r) => {
    if (r.offline) byVideo.delete(videoId);
  });
  return asked;
}

/** The file with the approved corrections it does not hold yet, and the names behind each line they changed. A row in
 * the file's `correcciones` is not applied again (it leaves its traces, so a later duplicate is reported, not landed on a
 * twin line); a change in its `sin_anclar` is never applied: the export found no line for it. The file itself when
 * nothing new applies. */
export function withLiveCorrections(tr: Transcript, rows: CorrectionRow[]): { tr: Transcript; autores: Record<number, string[]> } {
  const baked = new Set(tr.correcciones ?? []);
  const unplaced = new Set((tr.sin_anclar ?? []).map((u) => `${u.id}\u0000${u.t}`));
  let nuevos = false;
  const live = rows.map((r) => {
    if (baked.has(r.id)) return r;
    const cambios = (Array.isArray(r.payload?.cambios) ? r.payload.cambios : []).filter((c) => !unplaced.has(`${r.id}\u0000${c?.t}`));
    nuevos ||= cambios.length > 0;
    return { ...r, payload: { ...r.payload, cambios } };
  });
  if (!nuevos) return { tr, autores: {} };
  const out = applyCorrections({ ...tr, fuentes: tr.fuentes ?? tr.seg.map(() => []) }, live, { baked });
  return out.applied.length ? { tr: out.tr, autores: out.autores } : { tr, autores: {} };
}

/** Who the footer credits: each contributor once, in the order approved, for the rows the file holds and the ones that
 * changed a line live. */
export function correctionCredits(file: Transcript, rows: CorrectionRow[], autores: Record<number, string[]>): string[] {
  const baked = new Set(file.correcciones ?? []);
  const live = new Set(Object.values(autores).flat());
  const out: string[] = [];
  for (const r of rows) {
    const n = r.display_name?.trim();
    if (n && (baked.has(r.id) || live.has(n)) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** How the player marks a line: `colab` when a collaborator corrected it, and its title, the line's sources with
 * "Corregida por …" for the names a live correction gives (a line already corrected in the file has no names). */
export function lineCredit(fuentes: string[] | undefined, nombres: string[] | undefined): { colab: boolean; title: string } {
  const fu = fuentes ?? [];
  const por = nombres?.length ? t('reproductor.corregida_por', { nombres: formatList(nombres) }) : '';
  const parts = fu.map((x) => (x === 'colab' && por ? por : t(`reproductor.origen.${x}`)));
  if (por && !fu.includes('colab')) parts.push(por); // a language-only correction: the words are still the machine's
  return { colab: fu.includes('colab') || nombres !== undefined, title: parts.join(' + ') };
}

/** The transcript of video `id` as the player renders it, or null when it has none. `file` gives the published file's
 * JSON (null for a 404); the corrections are asked for only when there is a file, and without an answer the file shows
 * as it is. */
export async function liveTranscript(
  id: string,
  file: (id: string) => Promise<unknown>,
  approved: (id: string) => Promise<Approved> = approvedCorrections,
): Promise<LiveTranscript | null> {
  let tr: Transcript | null = null;
  try {
    tr = asTranscript(await file(id));
  } catch {
    /* offline, or not a file: the panel says there is none */
  }
  if (!tr) return null;
  const { rows } = await approved(id);
  const live = withLiveCorrections(tr, rows);
  return { ...live, nombres: correctionCredits(tr, rows, live.autores) };
}
