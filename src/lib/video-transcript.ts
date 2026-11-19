// Pure helpers for the video player's transcription panel (scripts/reproductor.ts).
// The files come from scripts/export_video_transcripts.py: public/transcripciones-video/<id>.json.

/** Where a transcription comes from: subtitles someone uploaded, YouTube's automatic ones, Whisper. */
export type TranscriptSource = 'subida' | 'youtube' | 'whisper';
export type Transcript = { src: TranscriptSource; lang: string; seg: [number, string][] };

/** The line playing at `t` seconds: the last one that starts at or before it; -1 before the first. */
export function lineAt(seg: [number, string][], t: number): number {
  let lo = 0;
  let hi = seg.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (seg[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Lower case without accents or diacritics: "Glyndŵr" and "glyndwr" match, so do "Canción" and "cancion". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Indices of the lines that contain `query` (accents and case ignored); none for a blank query. */
export function findLines(seg: [number, string][], query: string): number[] {
  const q = fold(query.trim());
  if (!q) return [];
  return seg.flatMap(([, text], i) => (fold(text).includes(q) ? [i] : []));
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function fmtTime(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A parsed transcription file, or null when it is not one (a 404 page, a broken file). */
export function asTranscript(data: unknown): Transcript | null {
  const d = data as Partial<Transcript> | null;
  if (!d || !Array.isArray(d.seg) || !['subida', 'youtube', 'whisper'].includes(String(d.src))) return null;
  const seg = d.seg.filter((x): x is [number, string] => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string');
  return seg.length ? { src: d.src as TranscriptSource, lang: String(d.lang ?? ''), seg } : null;
}
