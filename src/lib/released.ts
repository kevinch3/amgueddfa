import { releasedPath } from './paths';

/** The text derivative of a released item without page images. */
export const RELEASED_TEXT = 'text.txt';

export type ReleasedSource = { kind: 'pages'; urls: string[] } | { kind: 'text'; url: string };

/**
 * What a released restricted item shows from the public `media` bucket: its
 * page images, or, when the catalog lists none (Word docs, archived web
 * pages), its `released/<id>/text.txt`.
 */
export function releasedSource(id: string, files: string[], publicUrl: (path: string) => string): ReleasedSource {
  return files.length
    ? { kind: 'pages', urls: files.map((f) => publicUrl(releasedPath(id, f))) }
    : { kind: 'text', url: publicUrl(releasedPath(id, RELEASED_TEXT)) };
}

type FetchText = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** The released text, or null when it is missing, empty or unreachable. */
export async function fetchReleasedText(url: string, fetchFn: FetchText = (u) => fetch(u)): Promise<string | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}
