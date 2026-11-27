import { mergeApproved, type Contribution, type Kind } from './contrib';
import type { FestivalSlug } from './types';

/** A row of the `leaderboard` view. */
export interface LeaderRow {
  display_name: string;
  points: number;
  coleccion_points: Partial<Record<FestivalSlug, number>> | null;
  /** Public country code, when the contributor set one. */
  country?: string | null;
}
export type Ranked = { rank: number; display_name: string; points: number; country?: string | null };
export type Status = 'pending' | 'approved' | 'rejected';

/** Badge slugs in display order (mirrors public.badges.sort). */
export const BADGES = [
  'primer-aporte',
  'archivista-chubut',
  'archivista-juventud',
  'archivista-mimosa',
  'archivista-trevelin',
  'cazador-de-programas',
  'bardo',
  'ojo-de-lince',
] as const;

/**
 * Points an approved contribution earns. Uploads count the base 20 here: the
 * reviewer decides whether one fills a gap (50), so pending uploads may end up worth more.
 * video_text is worth 2 per change here; pointsFor() is the real rule (it counts the changes and caps at 30).
 */
export const POINTS: Record<Kind, number> = { upload: 20, fact: 10, transcription: 15, tag: 2, memory: 5, report: 10, note: 5, video_text: 2 };

/** Points one contribution earns: video_text 2 per change, at most 30; every other kind its base in POINTS. */
export function pointsFor(type: Kind, payload?: unknown): number {
  if (type !== 'video_text') return POINTS[type] ?? 0;
  const cambios = (payload as { cambios?: unknown } | null | undefined)?.cambios;
  return Array.isArray(cambios) ? Math.min(2 * cambios.length, 30) : 0;
}

/** Points the user would get if every pending contribution were approved. */
export function pendingPoints(rows: { type: Kind; status: Status; payload?: unknown }[]): number {
  return rows.reduce((s, r) => s + (r.status === 'pending' ? pointsFor(r.type, r.payload) : 0), 0);
}

/** i18n key of a contribution status pill. */
export function statusOf(s: Status): string {
  return `perfil.estados.${s}`;
}

/**
 * Overall (festival = null) or per-festival standings, highest first, people
 * with 0 points left out. Ties share a rank (1, 2, 2, 4) and sort by name.
 */
export function rankBy(rows: LeaderRow[], coleccion: FestivalSlug | null): Ranked[] {
  const scored = rows
    .map((r) => ({
      display_name: r.display_name,
      points: coleccion ? Number(r.coleccion_points?.[coleccion] ?? 0) : Number(r.points ?? 0),
      country: r.country ?? null,
    }))
    .filter((r) => r.display_name && r.points > 0)
    .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name, 'es'));
  const out: Ranked[] = [];
  scored.forEach((r, i) => {
    const tied = i > 0 && scored[i - 1].points === r.points;
    out.push({ ...r, rank: tied ? out[i - 1].rank : i + 1 });
  });
  return out;
}

/** The `n` most recently approved contributions, live rows winning over the static export. */
export function latestApproved(stat: Contribution[], live: Contribution[], n: number): Contribution[] {
  const when = (c: Contribution) => c.reviewed_at ?? c.created_at ?? '';
  return mergeApproved(stat, live)
    .sort((a, b) => when(b).localeCompare(when(a)) || b.id.localeCompare(a.id))
    .slice(0, n);
}
