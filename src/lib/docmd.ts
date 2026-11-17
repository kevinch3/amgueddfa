/**
 * One transcription per document. A document can span several catalog items
 * (a programa photographed page by page): its file is named after the first
 * item and lists the others in a front matter line,
 *
 *   ---
 *   items: 58897881813d 74ba4c04b85f
 *   ---
 *
 * Every member item shows the same text; an edition page lists the document once.
 * Used for programa transcriptions and published winners lists alike.
 */

export interface DocText {
  /** File name: the document's first item. */
  id: string;
  /** Every item the document covers, the file id first. */
  items: string[];
  /** The transcription, without front matter. */
  text: string;
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function readDoc(id: string, raw: string): DocText {
  const m = raw.match(FRONT);
  if (!m) return { id, items: [id], text: raw };
  const line = m[1].split(/\r?\n/).find((l) => /^items:/.test(l.trim())) ?? '';
  const listed = line.replace(/^\s*items:/, '').split(/[\s,]+/).filter(Boolean);
  return { id, items: [id, ...listed.filter((x) => x !== id)], text: raw.slice(m[0].length) };
}

/** Index an import.meta.glob of <id>.md files by every member item. */
export function indexDocs(files: Record<string, string>): { byMember: Map<string, DocText>; docs: DocText[] } {
  const docs = Object.entries(files)
    .map(([path, raw]) => readDoc(path.split('/').pop()!.replace(/\.md$/, ''), raw))
    .sort((a, b) => a.id.localeCompare(b.id));
  const byMember = new Map<string, DocText>();
  for (const d of docs) {
    for (const it of d.items) {
      const prev = byMember.get(it);
      if (prev) throw new Error(`item ${it} is in two transcriptions: ${prev.id}.md and ${d.id}.md`);
      byMember.set(it, d);
    }
  }
  return { byMember, docs };
}

/**
 * 32-bit FNV-1a of a document's text, hex: baked next to a rendered
 * transcription so the live script (scripts/live-transcripciones.ts) only
 * re-renders a document whose text changed since the build.
 */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
