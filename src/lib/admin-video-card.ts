// The review card of a video_text contribution as plain data: the DOM layer only draws it.
import { foldLine, type Cambio } from './video-corrections';
import { wordDiff, type DiffPart } from './word-diff';

export type VideoCardRow = {
  /** Position in the contribution's `cambios`. */
  index: number;
  t: number;
  kind: 'corregir' | 'quitar' | 'idioma' | 'agregar';
  link: string;
  /** The line as it reads now (or the contributor's `antes` when the file no longer has it); '' for an added line. */
  antes: string;
  /** The text after the change ('' for a removal). */
  despues: string;
  diff: DiffPart[];
  idioma?: 'es' | 'cy';
  /** The published line no longer reads `antes`. */
  stale: boolean;
};

export const timeLink = (id: string, t: number): string => `https://www.youtube.com/watch?v=${id}&t=${Math.floor(t)}s`;

/** Nearest line within 2 s whose folded text equals the folded `antes`. */
function currentLine(seg: [number, string][], t: number, antes: string): string | null {
  const want = foldLine(antes);
  let best: { d: number; text: string } | null = null;
  for (const [lt, text] of seg) {
    const d = Math.abs(lt - t);
    if (d <= 2 && foldLine(text) === want && (!best || d < best.d)) best = { d, text };
  }
  return best ? best.text : null;
}

/** One row per change. `seg` is the published file's lines, or null when it could not be read (no warning then). */
export function videoCardRows(videoId: string, cambios: Cambio[], seg: [number, string][] | null): VideoCardRow[] {
  return cambios.map((c, index) => {
    const kind: VideoCardRow['kind'] = c.quitar ? 'quitar' : c.antes === undefined ? 'agregar' : c.texto === undefined ? 'idioma' : 'corregir';
    let antes = c.antes ?? '';
    let stale = false;
    if (c.antes !== undefined && seg) {
      const now = currentLine(seg, c.t, c.antes);
      if (now === null) stale = true;
      else antes = now;
    }
    const despues = c.quitar ? '' : (c.texto ?? antes);
    return {
      index, t: c.t, kind, link: timeLink(videoId, c.t), antes, despues,
      diff: kind === 'idioma' ? [] : wordDiff(antes, despues),
      ...(c.idioma ? { idioma: c.idioma } : {}), stale,
    };
  });
}

/** The changes whose box is ticked, in order. */
export function keptCambios(cambios: Cambio[], ticked: boolean[]): Cambio[] {
  return cambios.filter((_, i) => ticked[i]);
}
