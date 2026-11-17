/**
 * Standardized programa transcriptions, one file per document:
 * src/data/transcripciones/<first item id>.md, listing the document's other
 * images in front matter (lib/docmd.ts). Only competitions (by discipline and
 * age group) and jurados; rules, disclaimers, schedules and sponsors are left
 * out. The format is described in .claude/skills/programa-transcription/SKILL.md.
 */

import { indexDocs, type DocText } from './docmd';

const FILES = import.meta.glob('../data/transcripciones/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const { byMember: BY_ID } = indexDocs(FILES);

export type Block =
  | { type: 'section'; text: string }
  | { type: 'group'; text: string }
  | { type: 'item'; n: string | null; text: string }
  | { type: 'text'; text: string };

/** Ids of the catalog items that have a transcription (every image of a document). */
export function transcribedIds(): string[] {
  return [...BY_ID.keys()].sort();
}

export function transcriptionFor(id: string): string | null {
  return BY_ID.get(id)?.text ?? null;
}

/** The whole document an item belongs to: its text and every item it covers. */
export function transcriptionDoc(id: string): DocText | null {
  return BY_ID.get(id) ?? null;
}

/** Headings and runs of competitions, as components/Transcripcion.astro and scripts/live-transcripciones.ts render them. */
export type Run = { kind: 'heading'; block: Block } | { kind: 'list'; items: Extract<Block, { type: 'item' }>[] };

export function transcriptionRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const b of parseTranscription(text)) {
    const last = runs[runs.length - 1];
    if (b.type === 'item') {
      if (last?.kind === 'list') last.items.push(b);
      else runs.push({ kind: 'list', items: [b] });
    } else runs.push({ kind: 'heading', block: b });
  }
  return runs;
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
