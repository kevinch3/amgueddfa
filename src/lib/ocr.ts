/**
 * Machine text (OCR) of public scans, from scripts/ocr.py: src/data/ocr/<id>.json.
 * A draft for search and transcribers, shown collapsed and labelled as unreviewed;
 * a human transcription always wins (the item page and the Markdown twin only
 * use OCR when there is none).
 */

export type OcrPage = { n: number; text: string; conf: number | null };
export type Ocr = { tool: string; version: string; langs: string; date: string; pages: OcrPage[] };

const FILES = import.meta.glob('../data/ocr/*.json', { import: 'default', eager: true }) as Record<string, Ocr>;

const BY_ID = new Map(Object.entries(FILES).map(([p, v]) => [p.replace(/^.*\/([^/]+)\.json$/, '$1'), v] as const));

/** The item's OCR with only the pages that found some text, or null. */
export function ocrFor(id: string): Ocr | null {
  const o = BY_ID.get(id);
  if (!o) return null;
  const pages = o.pages.filter((p) => p.text.trim().length > 0);
  return pages.length ? { ...o, pages } : null;
}
