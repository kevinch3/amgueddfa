/**
 * Standardized programa transcriptions, one file per catalog item:
 * src/data/transcripciones/<item id>.md. Only competitions (by discipline and
 * age group) and jurados; rules, disclaimers, schedules and sponsors are left
 * out. The format is described in .claude/skills/programa-transcription/SKILL.md.
 */

const FILES = import.meta.glob('../data/transcripciones/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const BY_ID = new Map<string, string>(
  Object.entries(FILES).map(([path, text]) => [path.split('/').pop()!.replace(/\.md$/, ''), text]),
);

export type Block =
  | { type: 'section'; text: string }
  | { type: 'group'; text: string }
  | { type: 'item'; n: string | null; text: string }
  | { type: 'text'; text: string };

/** Ids of the catalog items that have a transcription. */
export function transcribedIds(): string[] {
  return [...BY_ID.keys()].sort();
}

export function transcriptionFor(id: string): string | null {
  return BY_ID.get(id) ?? null;
}

/** "## Sección", "### Grupo", "12. Competencia" / "12a. …", "- Sin número", anything else is text. */
export function parseTranscription(src: string): Block[] {
  const out: Block[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.+)$/))) out.push({ type: 'group', text: m[1] });
    else if ((m = line.match(/^##\s+(.+)$/))) out.push({ type: 'section', text: m[1] });
    else if ((m = line.match(/^(\d+[a-zA-Z]?)\.\s+(.+)$/))) out.push({ type: 'item', n: m[1], text: m[2] });
    else if ((m = line.match(/^-\s+(.+)$/))) out.push({ type: 'item', n: null, text: m[1] });
    else out.push({ type: 'text', text: line });
  }
  return out;
}
