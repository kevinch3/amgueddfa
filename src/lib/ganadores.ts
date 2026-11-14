/**
 * Published winners lists, one file per result document: src/data/ganadores/<item id>.md.
 * Only Chubut and Trevelin are published (whole festivals, mostly adult
 * competitions); Mimosa and Juventud winners stay in the private archive. The
 * result documents themselves stay restricted: only this transcription shows,
 * folded under Resultados on the edition page. Same format as the programa
 * transcriptions (.claude/skills/programa-transcription/SKILL.md).
 */
import type { FestivalSlug } from './types';

/** Festivals whose winners are public. */
export const PUBLIC_WINNERS: readonly FestivalSlug[] = ['chubut', 'trevelin'];

const FILES = import.meta.glob('../data/ganadores/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const BY_ID = new Map<string, string>(
  Object.entries(FILES).map(([path, text]) => [path.split('/').pop()!.replace(/\.md$/, ''), text]),
);

/** Ids of the result documents that have a published winners list. */
export function winnerIds(): string[] {
  return [...BY_ID.keys()].sort();
}

export function winnersFor(id: string): string | null {
  return BY_ID.get(id) ?? null;
}
