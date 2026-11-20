// Automatic competition markers of long session videos (scripts/video_markers.py,
// public/marcadores-video/<id>.json): which competition starts where.

export type MarkerFile = { auto?: boolean; markers: [number, string, string, string][] };
export type PlayAt = { v: string; t: number };

/** Competition number → its start in the first of the given videos (in order) that marks it; ceremonies left out. */
export function playMap(files: Record<string, MarkerFile | null | undefined>, videoIds: string[]): Record<string, PlayAt> {
  const out: Record<string, PlayAt> = {};
  for (const v of videoIds) {
    const f = files[v];
    if (!f || !Array.isArray(f.markers)) continue;
    for (const m of f.markers) {
      if (!Array.isArray(m) || m[3] !== 'comp' || typeof m[0] !== 'number') continue;
      const n = String(m[1]);
      if (!out[n] || (out[n].v === v && m[0] < out[n].t)) out[n] = { v, t: m[0] };
    }
  }
  return out;
}
