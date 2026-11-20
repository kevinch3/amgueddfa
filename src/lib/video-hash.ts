// A moment of a video in the address of its edition page: /chubut/2025/#v=h5zX7SaZJt8&t=98
// (scripts/reproductor.ts opens the player from it; search results and shared links use it).

export type VideoMoment = { id: string; t: number };

/** "#v=h5zX7SaZJt8&t=98" → { id, t: 98 }; no `t` means the start. Null when the hash is not a video. */
export function parseVideoHash(hash: string): VideoMoment | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const id = p.get('v') ?? '';
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  const t = Number(p.get('t'));
  return { id, t: Number.isFinite(t) && t > 0 ? Math.floor(t) : 0 };
}

/** { id, t: 98 } → "#v=h5zX7SaZJt8&t=98"; the start has no `t`. */
export function videoHash(id: string, t = 0): string {
  const s = Math.floor(t);
  return `#v=${id}${s > 0 ? `&t=${s}` : ''}`;
}
