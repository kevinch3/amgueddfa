// Pure helpers for the video player's transcription panel (scripts/reproductor.ts).
// The files come from scripts/export_video_transcripts.py: public/transcripciones-video/<id>.json.

/** Where a transcription comes from: subtitles someone uploaded, YouTube's automatic ones, Whisper. */
export type TranscriptSource = 'subida' | 'youtube' | 'whisper' | 'reconstruida';
/** A sung piece whose known lyric replaced the automatic lines in [desde, hasta) (scripts/align_lyrics.py). */
export type Letra = { desde: number; hasta: number; titulo: string; autor: string; idioma: string; derechos?: string; fuente?: string };
/** How the player credits a lyric: one line per piece. `fuente` is the file's "url, aportado por …" split. */
export type Credito = { titulo: string; autor: string; derechos: string; fuente: { href?: string; host?: string; texto: string } };
/** A collaborator's change the export could not place on a line (the player never applies it live). */
export type SinAnclarArchivo = { id: string; t: number; antes?: string; motivo?: string };
export type Transcript = {
  src: TranscriptSource; lang: string; seg: [number, string][]; letras?: Letra[]; fuentes?: string[][];
  /** One language per line, written by the export only where the source would mislead (the Welsh model heard Spanish). */
  idiomas?: string[];
  /** The approved corrections (contribution ids) the export applied to this file, so the player does not apply them again. */
  correcciones?: string[];
  /** When the export wrote this file (ISO time). */
  exportado?: string;
  sin_anclar?: SinAnclarArchivo[];
};

/** The lyric span a line starting at `t` belongs to, or null. */
export function letraAt(tr: Transcript, t: number): Letra | null {
  return tr.letras?.find((l) => t >= l.desde && t < l.hasta) ?? null;
}

/** One credit per piece sung (a piece sung twice is credited once), in the order first sung. */
export function creditos(tr: Transcript): Credito[] {
  const seen = new Set<string>();
  const out: Credito[] = [];
  for (const l of [...(tr.letras ?? [])].sort((a, b) => a.desde - b.desde)) {
    const key = `${l.titulo}\u0000${l.autor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = (l.fuente ?? '').trim();
    const m = /^(https?:\/\/\S+?)[,;]?(?:\s+(.*))?$/.exec(f);
    let fuente: Credito['fuente'] = { texto: f };
    if (m) {
      try {
        fuente = { href: m[1], host: new URL(m[1]).hostname.replace(/^www\./, ''), texto: (m[2] ?? '').trim() };
      } catch {
        /* not a real URL: keep it as text */
      }
    }
    out.push({ titulo: l.titulo, autor: l.autor, derechos: l.derechos ?? '', fuente });
  }
  return out;
}

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
  if (!d || !Array.isArray(d.seg) || !['subida', 'youtube', 'whisper', 'reconstruida'].includes(String(d.src))) return null;
  const seg = d.seg.filter((x): x is [number, string] => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string');
  if (!seg.length) return null;
  const letras = (Array.isArray(d.letras) ? d.letras : []).filter(
    (l): l is Letra => !!l && typeof l.desde === 'number' && typeof l.hasta === 'number' && typeof l.titulo === 'string',
  ).map((l) => ({ desde: l.desde, hasta: l.hasta, titulo: l.titulo, autor: String(l.autor ?? ''), idioma: String(l.idioma ?? ''),
    ...(l.derechos ? { derechos: String(l.derechos) } : {}), ...(l.fuente ? { fuente: String(l.fuente) } : {}) }));
  // Per-line sources of a reconstruction: kept only when there is one list per line.
  const f = (d as { fuentes?: unknown }).fuentes;
  const fuentes = Array.isArray(f) && f.length === seg.length && f.every((x) => Array.isArray(x) && x.every((y) => typeof y === 'string'))
    ? (f as string[][]) : null;
  const g = (d as { idiomas?: unknown }).idiomas;
  const idiomas = Array.isArray(g) && g.length === seg.length && g.every((x) => typeof x === 'string') ? (g as string[]) : null;
  // What the export says about collaborators' corrections: each entry that can still be matched is kept.
  const c = (d as { correcciones?: unknown }).correcciones;
  const correcciones = (Array.isArray(c) ? c : []).filter((x): x is string => typeof x === 'string');
  const e = (d as { exportado?: unknown }).exportado;
  const u = (d as { sin_anclar?: unknown }).sin_anclar;
  const sinAnclar = (Array.isArray(u) ? u : []).filter(
    (x): x is SinAnclarArchivo => !!x && typeof x.id === 'string' && typeof x.t === 'number' && Number.isFinite(x.t),
  ).map((x) => ({ id: x.id, t: x.t, ...(typeof x.antes === 'string' ? { antes: x.antes } : {}),
    ...(typeof x.motivo === 'string' ? { motivo: x.motivo } : {}) }));
  return { src: d.src as TranscriptSource, lang: String(d.lang ?? ''), seg, ...(letras.length ? { letras } : {}), ...(fuentes ? { fuentes } : {}),
    ...(idiomas ? { idiomas } : {}), ...(correcciones.length ? { correcciones } : {}), ...(typeof e === 'string' ? { exportado: e } : {}),
    ...(sinAnclar.length ? { sin_anclar: sinAnclar } : {}) };
}

/** The language of line i: a lyric's own, else the export's `idiomas`, else Welsh for a line the Welsh model heard,
 * else the transcript's. */
export function lineLang(tr: Transcript, i: number, letra?: Letra | null): string {
  return letra?.idioma || tr.idiomas?.[i] || (tr.fuentes?.[i]?.includes('cy') ? 'cy' : tr.lang);
}
