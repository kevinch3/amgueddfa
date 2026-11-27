/**
 * Published winners lists, one file per result document: src/data/ganadores/<item id>.md.
 * Only Chubut and Trevelin are published (whole festivals, mostly adult
 * competitions); Mimosa and Juventud winners stay in the private archive. The
 * result documents themselves stay restricted: only this transcription shows,
 * folded under Resultados on the edition page. Same format as the programa
 * transcriptions (.claude/skills/programa-transcription/SKILL.md).
 */
import { PUBLIC_WINNERS } from './colecciones';

/** Festivals whose winners are public. */
export { PUBLIC_WINNERS };

import { indexDocs, type DocText } from './docmd';

const FILES = import.meta.glob('../data/ganadores/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// One file per document; a list spanning several result images names them in front matter (lib/docmd.ts).
const { byMember: BY_ID } = indexDocs(FILES);

/** Ids of the result documents that have a published winners list. */
export function winnerIds(): string[] {
  return [...BY_ID.keys()].sort();
}

export function winnersFor(id: string): string | null {
  return BY_ID.get(id)?.text ?? null;
}

export function winnersDoc(id: string): DocText | null {
  return BY_ID.get(id) ?? null;
}
