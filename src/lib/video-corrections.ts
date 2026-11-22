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
const PALABRAS = 3; // words `antes` needs to be looked for anywhere but on an equal line within 2 s

// Spaces are spelled out (not \s, not trim) so that the Python twin treats exactly the same characters as spaces.
const NO_BLANCO = /[^\t\n\v\f\r\p{Zs}]/u;
const BLANCO_FINAL = /[\t\n\v\f\r\p{Zs}]+$/u;
// What a removed run takes along: the marks glued before its first word, except a closing one (the end of the
// fragment before it), and the marks glued after its last word, except an opening ¡ ¿ ( « “ (the next fragment's),
// then the space after it.
const CABEZA = /[^\t\n\v\f\r\p{Zs}\p{L}\p{N}\p{M}.,;:!?…\p{Pe}\p{Pf}]*$/u;
const COLA = /^[^\t\n\v\f\r\p{Zs}\p{L}\p{N}\p{M}¡¿\p{Ps}\p{Pi}]*[\t\n\v\f\r\p{Zs}]*/u;

type Palabra = { a: number; b: number; w: string };
type Linea = { t: number; text: string; fu: string[]; idioma: string | null; autores: string[] | null };
/** The words an applied change took from a line (rewrote or removed), at the change's time. */
type Huella = { t: number; w: string[] };
/** Where a change landed: line i, whole (`run` null) or a run of a longer line. A texto replaces [a, b) (the words with
 * `antes`' own marks); a quitar removes [qa, qb) (the words with the marks glued to them and the space after). */
type Lugar = { i: number; run: { a: number; b: number; qa: number; qb: number } | null };

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

/** Where the words `busca` first run in `ws`, or -1. */
function donde(ws: string[], busca: string[]): number {
  for (let k = 0; k + busca.length <= ws.length; k++) if (busca.every((w, j) => ws[k + j] === w)) return k;
  return -1;
}

/** Whether `t` falls on sung text: a lyric line is the nearest line within 2 s (or as near as the nearest), or `t` lies
 * between two consecutive lyric lines. What a change there was made on was most likely replaced by the lyrics. */
function enLetra(lines: Linea[], t: number): boolean {
  let cerca = Infinity;
  let letra = false;
  for (const l of lines) {
    const d = Math.abs(l.t - t);
    if (d > EXACTA || d > cerca) continue;
    const es = l.fu.includes('letra');
    letra = d < cerca ? es : letra || es;
    cerca = d;
  }
  if (letra) return true;
  for (let i = 0; i + 1 < lines.length; i++) {
    const x = lines[i];
    const y = lines[i + 1];
    if (x.fu.includes('letra') && y.fu.includes('letra') && Math.min(x.t, y.t) <= t && t <= Math.max(x.t, y.t)) return true;
  }
  return false;
}

/** The line a change with `antes` targets, nearest in time first and never a lyric line: an equal line within 2 s,
 * else `antes` as a run of whole words inside a line within 5 s (a rebuild joined fragments). 'tomada' when the
 * nearest match is text an earlier change already took: the change repeats an approved one, and trying the next
 * candidate would land it on a twin line or inside that change's new text. At equal distance the taken text counts first.
 * Only an equal line within 2 s is sure: the rest is looked for only when `antes` has three words or more (one or two,
 * like "Gracias." or "¡Bravo!", stand in many lines nearby) and `t` is not on sung text (see enLetra); otherwise the
 * change found no line, whatever stands nearby. */
function ubicar(lines: Linea[], huellas: Huella[], t: number, antes: string): Lugar | 'tomada' | null {
  const cand = [
    ...huellas.flatMap((h, i) => (Math.abs(h.t - t) <= CERCA ? [{ d: Math.abs(h.t - t), k: 0, i }] : [])),
    ...lines.flatMap((l, i) =>
      Math.abs(l.t - t) <= CERCA && !l.fu.includes('letra') ? [{ d: Math.abs(l.t - t), k: 1, i }] : []),
  ].sort((x, y) => x.d - y.d || x.k - y.k || x.i - y.i);
  const busca = palabras(antes);
  const bw = busca.map((p) => p.w);
  const folded = bw.join(' ');
  for (const { d, k, i } of cand) {
    if (d > EXACTA) break;
    if (k === 0 && huellas[i].w.join(' ') === folded) return 'tomada';
    if (k === 1 && foldLine(lines[i].text) === folded) return { i, run: null };
  }
  if (busca.length < PALABRAS || enLetra(lines, t)) return null;
  // The fragment's own opening and closing marks ("¡…!", "….") go with a texto's run when the line has them around it.
  const pre = antes.slice(0, busca[0].a);
  const post = antes.slice(busca[busca.length - 1].b);
  for (const { k, i } of cand) {
    if (k === 0) {
      if (donde(huellas[i].w, bw) >= 0) return 'tomada';
      continue;
    }
    const text = lines[i].text;
    const ws = palabras(text);
    const at = donde(ws.map((p) => p.w), bw);
    if (at < 0) continue;
    const wa = ws[at].a;
    const wb = ws[at + bw.length - 1].b;
    let a = wa;
    let b = wb;
    if (pre && a >= pre.length && text.slice(a - pre.length, a) === pre) a -= pre.length;
    if (post && text.slice(b, b + post.length) === post) b += post.length;
    const qa = wa - CABEZA.exec(text.slice(0, wa))![0].length;
    const qb = wb + COLA.exec(text.slice(wb))![0].length;
    return { i, run: { a, b, qa, qb } };
  }
  return null;
}

/** Whether the change that wrote `texto` near `t` landed: `texto` stands in a line there (equal within 2 s, a run of
 * whole words within 5 s; never a lyric line), or a later change took it from there, all of it or some of its words. */
function quedo(lines: Linea[], huellas: Huella[], t: number, texto: string): boolean {
  const bw = palabras(texto).map((p) => p.w);
  // Equal within 2 s is a run within 5 s, so one test covers both windows.
  return lines.some((l) => Math.abs(l.t - t) <= CERCA && !l.fu.includes('letra') && donde(palabras(l.text).map((p) => p.w), bw) >= 0)
    || huellas.some((h) => Math.abs(h.t - t) <= CERCA && (donde(h.w, bw) >= 0 || (h.w.length > 0 && donde(bw, h.w) >= 0)));
}

/** The transcript with `rows` applied in `reviewed_at` order (a tie by id), and what came of them: `applied` lists the
 * rows that changed something (the export records them so the player never applies one twice), `sinAnclar` the changes
 * not applied, and
 * `autores` the display names behind each changed line of the result (an empty list when the rows had none). A line
 * whose text a correction wrote gets "colab" in its fuentes; once a correction sets a language, `idiomas` covers every line.
 * A change whose text an earlier change already took (two collaborators fixed the same original line) is not placed.
 *
 * `baked` (the player only; the export always starts from the machine text) names rows the file already holds (its
 * `correcciones`): they are not applied again, but each of their changes leaves the text it took, as at the export, so
 * a duplicate approved after the export is reported instead of landing on a twin line. A removal leaves its `antes` at
 * `t`; a rewrite leaves it when its `texto` is still there, or a later baked change took it or some of its words
 * (they are replayed newest first). */
export function applyCorrections<T extends Corregible>(
  tr: T,
  rows: CorrectionRow[],
  opts: { baked?: ReadonlySet<string> } = {},
): { tr: T; applied: string[]; sinAnclar: SinAnclar[]; autores: Record<number, string[]> } {
  const idiomas = Array.isArray(tr.idiomas) && tr.idiomas.length === tr.seg.length ? tr.idiomas : null;
  const lines: Linea[] = tr.seg.map(([t, text], i) => ({
    t, text, fu: [...(tr.fuentes?.[i] ?? [])], idioma: idiomas?.[i] ?? null, autores: null,
  }));
  const huellas: Huella[] = [];
  let conIdiomas = !!idiomas;
  const applied: string[] = [];
  const sinAnclar: SinAnclar[] = [];
  // Approval order; rows approved at the same instant (approved together) by id, so the order never depends on the caller.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ordered = [...rows].sort((x, y) =>
    cmp(String(x.reviewed_at ?? ''), String(y.reviewed_at ?? '')) || cmp(String(x.id ?? ''), String(y.id ?? '')));
  const baked = opts.baked;
  const cambiosOf = (row: CorrectionRow) => (Array.isArray(row.payload?.cambios) ? row.payload.cambios : []);
  // The rows the file already holds leave what they took before any other row runs; newest first, so that a line
  // rewritten twice leads back to its first text.
  if (baked?.size) {
    for (const row of [...ordered].reverse()) {
      if (!baked.has(row.id)) continue;
      for (const c of [...cambiosOf(row)].reverse()) {
        if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t) || typeof c.antes !== 'string') continue; // an add takes nothing
        const huella: Huella = { t: c.t, w: palabras(c.antes).map((p) => p.w) };
        const texto = typeof c.texto === 'string' && NO_BLANCO.test(c.texto) ? c.texto : null;
        if (c.quitar === true) huellas.push(huella);
        else if (texto !== null && foldLine(texto) !== huella.w.join(' ') && quedo(lines, huellas, c.t, texto)) huellas.push(huella);
      }
    }
  }
  for (const row of ordered) {
    if (baked?.has(row.id)) continue;
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
    for (const c of cambiosOf(row)) {
      if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t)) {
        sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        continue;
      }
      const texto = typeof c.texto === 'string' && NO_BLANCO.test(c.texto) ? c.texto : null;
      const idioma = c.idioma === 'es' || c.idioma === 'cy' ? c.idioma : null;
      if (typeof c.antes !== 'string') {
        // An add; the same text already within 2 s means it is there (an earlier export or row put it there).
        // Text an earlier change took from there is not put back: it repeats an approved add, and is reported.
        const cerca = (x: number) => Math.abs(x - c.t) <= EXACTA;
        const ya = texto !== null && lines.some((l) => cerca(l.t) && foldLine(l.text) === foldLine(texto));
        const tomada = texto !== null && huellas.some((h) => cerca(h.t) && h.w.join(' ') === foldLine(texto));
        if (texto === null || (tomada && !ya)) sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        else if (!ya) {
          const at = lines.findIndex((l) => l.t > c.t);
          const nueva: Linea = { t: c.t, text: texto, fu: ['colab'], idioma, autores: null };
          lines.splice(at < 0 ? lines.length : at, 0, nueva);
          credit(nueva);
          if (idioma) conIdiomas = true;
          hizo = true;
        }
        continue;
      }
      const lugar = ubicar(lines, huellas, c.t, c.antes);
      if (!lugar || lugar === 'tomada') {
        sinAnclar.push({ id: row.id, cambio: c, motivo: 'sin_linea' });
        continue;
      }
      const l = lines[lugar.i];
      const run = lugar.run;
      const huella: Huella = { t: c.t, w: palabras(c.antes).map((p) => p.w) };
      if (c.quitar === true) {
        let resto = '';
        if (run && run.qb === l.text.length) resto = l.text.slice(0, run.qa).replace(BLANCO_FINAL, '');
        else if (run) resto = l.text.slice(0, run.qa) + l.text.slice(run.qb);
        if (foldLine(resto)) {
          l.text = resto;
          colab(l);
        } else lines.splice(lugar.i, 1);
        huellas.push(huella);
        hizo = true;
        continue;
      }
      if (texto !== null) {
        l.text = run ? l.text.slice(0, run.a) + texto + l.text.slice(run.b) : texto;
        colab(l);
        if (foldLine(texto) !== huella.w.join(' ')) huellas.push(huella);
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
