// The one rule that places collaborators' approved transcript corrections on their lines and applies them
// (docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md, "Anchoring and applying").
// The player applies it live; scripts/video_corrections.py is its twin for the export. Both run the vectors in
// tests/fixtures/video-corrections/, so a change here is a change there.
//
// No fuzzy similarity: a correction on the wrong public line is worse than one left unplaced and reported.

/** One change of a `video_text` contribution: with `antes` it targets the line that read so; without it, it adds a line at `t`. */
export type Cambio = { t: number; antes?: string; texto?: string; idioma?: 'es' | 'cy'; quitar?: boolean };
/** An approved `video_text` contribution, as public_contributions and data/approved/contributions.json give it. */
export type CorrectionRow = {
  id: string; reviewed_at: string; display_name?: string | null; payload: { video: { id: string }; cambios: Cambio[] };
};
/** A change not applied: no line for it, or a language change that landed inside a joined line (it may hold other speech). */
export type SinAnclar = { id: string; cambio: Cambio; motivo: 'sin_linea' | 'idioma_en_linea_unida' };
export type Corregible = { seg: [number, string][]; fuentes: string[][]; idiomas?: string[]; lang: string };

const CERCA = 5; // s around a change's time where its line may now start
const EXACTA = 2; // s within which an equal line is the same line (and an add is already there)

type Palabra = { a: number; b: number; w: string };
type Linea = { t: number; text: string; fu: string[]; idioma: string | null; autores: string[] | null };
/** Where a change landed: line i, whole (`run` null) or the run [a, b) of a longer line; `fin` is where the next word starts. */
type Lugar = { i: number; run: { a: number; b: number; fin: number } | null };

/** A line's words and where each sits in it: runs of letters, digits and marks, folded. */
function palabras(s: string): Palabra[] {
  const out: Palabra[] = [];
  for (const m of s.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const w = m[0].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (w) out.push({ a: m.index!, b: m.index! + m[0].length, w });
  }
  return out;
}

/** Lower case without accents, circumflexes or punctuation, single spaces: "¡Gracias, Señor ŵ!" → "gracias senor w". */
export function foldLine(s: string): string {
  return palabras(s).map((p) => p.w).join(' ');
}

/** The line a change with `antes` targets, nearest in time first and never a lyric line: an equal line within 2 s,
 * else `antes` as a run of whole words inside a line within 5 s (a rebuild joined fragments). */
function ubicar(lines: Linea[], t: number, antes: string): Lugar | null {
  const cand = lines
    .flatMap((l, i) => {
      const d = Math.abs(l.t - t);
      return d <= CERCA && !l.fu.includes('letra') ? [{ i, d }] : [];
    })
    .sort((x, y) => x.d - y.d || x.i - y.i);
  const busca = palabras(antes);
  const folded = busca.map((p) => p.w).join(' ');
  for (const { i, d } of cand) if (d <= EXACTA && foldLine(lines[i].text) === folded) return { i, run: null };
  if (!busca.length) return null;
  // The fragment's own opening and closing marks ("¡…!", "….") go with its run when the line has them around it.
  const pre = antes.slice(0, busca[0].a);
  const post = antes.slice(busca[busca.length - 1].b);
  for (const { i } of cand) {
    const text = lines[i].text;
    const ws = palabras(text);
    for (let k = 0; k + busca.length <= ws.length; k++) {
      if (!busca.every((p, j) => ws[k + j].w === p.w)) continue;
      let a = ws[k].a;
      let b = ws[k + busca.length - 1].b;
      if (pre && a >= pre.length && text.slice(a - pre.length, a) === pre) a -= pre.length;
      if (post && text.slice(b, b + post.length) === post) b += post.length;
      const fin = k + busca.length < ws.length ? ws[k + busca.length].a : text.length;
      return { i, run: { a, b, fin } };
    }
  }
  return null;
}

/** The transcript with `rows` applied in `reviewed_at` order, and what came of them: `applied` lists the rows that changed
 * something (the export records them so the player never applies one twice), `sinAnclar` the changes not applied, and
 * `autores` the display names behind each changed line of the result (an empty list when the rows had none). A line
 * whose text a correction wrote gets "colab" in its fuentes; once a correction sets a language, `idiomas` covers every line. */
export function applyCorrections<T extends Corregible>(
  tr: T,
  rows: CorrectionRow[],
): { tr: T; applied: string[]; sinAnclar: SinAnclar[]; autores: Record<number, string[]> } {
  const idiomas = Array.isArray(tr.idiomas) && tr.idiomas.length === tr.seg.length ? tr.idiomas : null;
  const lines: Linea[] = tr.seg.map(([t, text], i) => ({
    t, text, fu: [...(tr.fuentes?.[i] ?? [])], idioma: idiomas?.[i] ?? null, autores: null,
  }));
  let conIdiomas = !!idiomas;
  const applied: string[] = [];
  const sinAnclar: SinAnclar[] = [];
  const key = (r: CorrectionRow) => String(r.reviewed_at ?? '');
  for (const row of [...rows].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))) {
    const nombre = row.display_name?.trim() || '';
    const credit = (l: Linea) => {
      l.autores ??= [];
      if (nombre && !l.autores.includes(nombre)) l.autores.push(nombre);
    };
    const colab = (l: Linea) => {
      if (!l.fu.includes('colab')) l.fu.push('colab');
      credit(l);
    };
    let hizo = false;
    for (const c of Array.isArray(row.payload?.cambios) ? row.payload.cambios : []) {
      if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t)) {
        sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        continue;
      }
      const texto = typeof c.texto === 'string' && c.texto.trim() ? c.texto : null;
      const idioma = c.idioma === 'es' || c.idioma === 'cy' ? c.idioma : null;
      if (typeof c.antes !== 'string') {
        // An add; the same text already within 2 s means it is there (an earlier export or row put it there).
        if (texto === null) sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        else if (!lines.some((l) => Math.abs(l.t - c.t) <= EXACTA && foldLine(l.text) === foldLine(texto))) {
          const at = lines.findIndex((l) => l.t > c.t);
          const nueva: Linea = { t: c.t, text: texto, fu: ['colab'], idioma, autores: null };
          lines.splice(at < 0 ? lines.length : at, 0, nueva);
          credit(nueva);
          if (idioma) conIdiomas = true;
          hizo = true;
        }
        continue;
      }
      const lugar = ubicar(lines, c.t, c.antes);
      if (!lugar) {
        sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        continue;
      }
      const l = lines[lugar.i];
      const run = lugar.run;
      if (c.quitar === true) {
        const resto = run ? (l.text.slice(0, run.a) + l.text.slice(run.fin)).trim() : '';
        if (foldLine(resto)) {
          l.text = resto;
          colab(l);
        } else lines.splice(lugar.i, 1);
        hizo = true;
        continue;
      }
      if (texto !== null) {
        l.text = run ? l.text.slice(0, run.a) + texto + l.text.slice(run.b) : texto;
        colab(l);
        hizo = true;
      }
      if (idioma && run) sinAnclar.push({ id: row.id, cambio: c, motivo: 'idioma_en_linea_unida' });
      else if (idioma) {
        l.idioma = idioma;
        conIdiomas = true;
        credit(l);
        hizo = true;
      }
    }
    if (hizo) applied.push(row.id);
  }
  const out: T = { ...tr, seg: lines.map((l): [number, string] => [l.t, l.text]), fuentes: lines.map((l) => l.fu) };
  if (conIdiomas) out.idiomas = lines.map((l) => l.idioma ?? (l.fu.includes('cy') ? 'cy' : tr.lang));
  else delete out.idiomas;
  const autores: Record<number, string[]> = {};
  lines.forEach((l, i) => {
    if (l.autores) autores[i] = l.autores;
  });
  return { tr: out, applied, sinAnclar, autores };
}
