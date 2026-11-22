// The player's edit mode (scripts/editor-transcripcion.ts) is a thin DOM layer over lib/transcript-draft.ts; the
// repository has no DOM library, so what the layer draws is tested here on the model it draws from. The real browser
// check (focus, phone width, a 2,956-line session) is part of the manual pass.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addNueva, cambiosLabel, cambioTexto, editControls, editorAccess, emptyDraft, enviarLabel, loadDraft, momentoNueva,
  nuevaIdioma, parseTiempo, pendingMarks, puedeEntrar, saveDraft, sendDraft, setLine, tiempoNueva,
} from '../src/lib/transcript-draft';
import { asTranscript, type Transcript } from '../src/lib/video-transcript';

const video = { id: 'hVtD63KLlsw', title: 'Eisteddfod del Chubut - Sesión día sábado', festival: 'chubut', year: 2024 };

/** The largest session on the site has 2,956 lines. */
const long = (n = 2956): Transcript => asTranscript({
  src: 'reconstruida', lang: 'es',
  seg: Array.from({ length: n }, (_, i) => [i * 3, `línea ${i}`]),
  fuentes: Array.from({ length: n }, () => ['whisper_es']),
})!;

const small = (): Transcript => asTranscript({
  src: 'reconstruida', lang: 'es', exportado: '2026-11-22T10:05:00Z',
  seg: [[10, 'Buenas noches'], [20, 'Calon lân'], [24, 'yn llawn daioni'], [30, 'Gracias'], [40, '¡Bravo!'], [41, '¡Bravo!']],
  fuentes: [['whisper_es'], ['letra'], ['letra'], ['whisper_es'], ['yt_es'], ['yt_es']],
})!;

function store() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('who gets the edit button', () => {
  const tr = small();
  const signedIn = { profile: { display_name: 'Ana' } };
  it('only Chubut and Trevelin videos with a transcript, for a signed-in profile with a display name', () => {
    expect(editorAccess('chubut', tr, signedIn)).toEqual({ boton: true, ingresar: null });
    expect(editorAccess('trevelin', tr, signedIn)).toEqual({ boton: true, ingresar: null });
    expect(editorAccess('juventud', tr, signedIn)).toEqual({ boton: false, ingresar: null });
    expect(editorAccess('mimosa', tr, signedIn)).toEqual({ boton: false, ingresar: null });
    expect(editorAccess('chubut', null, signedIn)).toEqual({ boton: false, ingresar: null });
  });
  it('signed out (or without a name) gets the sign-in link instead; offline, nothing', () => {
    expect(editorAccess('chubut', tr, { profile: null, reason: 'signed_out' })).toEqual({ boton: false, ingresar: 'signed_out' });
    expect(editorAccess('chubut', tr, { profile: null, reason: 'no_name' })).toEqual({ boton: false, ingresar: 'no_name' });
    expect(editorAccess('chubut', tr, { profile: null, reason: 'offline' })).toEqual({ boton: false, ingresar: null });
    expect(editorAccess('juventud', tr, { profile: null, reason: 'signed_out' })).toEqual({ boton: false, ingresar: null });
    expect(editorAccess('chubut', null, { profile: null, reason: 'signed_out' })).toEqual({ boton: false, ingresar: null });
  });
});

describe('a signed-out visitor never gets into edit mode (B1)', () => {
  const ready = { tr: small(), video, editando: false, asentada: true, puede: true };
  it('edit mode starts only for a visitor who may edit, once the text is final, and not twice', () => {
    expect(puedeEntrar(ready)).toBe(true);
    expect(puedeEntrar({ ...ready, puede: false })).toBe(false); // signed out, no name, offline, another festival
    expect(puedeEntrar({ ...ready, asentada: false })).toBe(false);
    expect(puedeEntrar({ ...ready, editando: true })).toBe(false);
    expect(puedeEntrar({ ...ready, tr: null })).toBe(false);
    expect(puedeEntrar({ ...ready, video: null })).toBe(false);
  });

  it('inside the player, the hidden attribute always wins: no display rule can show the edit button it hides', () => {
    // `.rep-acciones .btn-link { display: inline-flex }` came after `.rep-acciones [hidden] { display: none }` with the
    // same specificity, so the hidden "Editar transcripción" showed to signed-out visitors.
    const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/(^|[\s,}])\.reproductor \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    // No other player rule may out-shout it.
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/display\s*:[^;]*!important/.test(body) && /\.rep-|\.reproductor|data-rep|data-editor/.test(sel)) {
        expect(sel.trim()).toBe('.reproductor [hidden]');
      }
    }
  });
});

describe('edit mode on the lines (Review Focus 5)', () => {
  it('a 2,956-line session gets one ✎ control per line and no input until a line is opened', () => {
    const tr = long();
    const ctrls = editControls(tr);
    expect(ctrls).toHaveLength(2956);
    expect(ctrls.every((c, i) => c.i === i && c.t === tr.seg[i][0] && c.editable && !c.nota)).toBe(true);
    expect(ctrls.filter((c) => c.abierta)).toHaveLength(0);
    const open = editControls(tr, 1234);
    expect(open.filter((c) => c.abierta).map((c) => c.i)).toEqual([1234]);
    expect(open.filter((c) => c.editable)).toHaveLength(2956);
  });

  it('lyric lines have no ✎: the first of each sung passage carries the lyrics note instead', () => {
    const ctrls = editControls(small(), 1);
    expect(ctrls.map((c) => [c.editable, c.nota ?? null, c.abierta])).toEqual([
      [true, null, false], [false, 'letra', false], [false, null, false], [true, null, false], [true, null, false], [true, null, false],
    ]);
  });
});

describe('the counter and the send button', () => {
  it('read "{n} cambios" and "Enviar {n} correcciones", singular for one', () => {
    expect(cambiosLabel(2)).toBe('2 cambios');
    expect(cambiosLabel(1)).toBe('1 cambio');
    expect(cambiosLabel(0)).toBe('0 cambios');
    expect(enviarLabel(2)).toBe('Enviar 2 correcciones');
    expect(enviarLabel(1)).toBe('Enviar 1 corrección');
  });

  it('the counter is a polite live region in the player markup', () => {
    const astro = readFileSync(join(__dirname, '..', 'src', 'components', 'VideoPlayer.astro'), 'utf8');
    expect(astro).toMatch(/<p[^>]*data-editor-n[^>]*aria-live="polite"|<p[^>]*aria-live="polite"[^>]*data-editor-n/);
    // The edit button sits in the action bar, and only Chubut and Trevelin pages render it.
    expect(astro).toMatch(/class="rep-acciones[^"]*"[\s\S]*data-rep-editar[\s\S]*data-rep-copiado/);
    expect(astro).toMatch(/\{editable && <button[^>]*data-rep-editar/);
  });

  it('keeps a compact bar (counter, Enviar, Cancelar) and folds its help under «Cómo funciona» (B9, phone width)', () => {
    const astro = readFileSync(join(__dirname, '..', 'src', 'components', 'VideoPlayer.astro'), 'utf8');
    // One bar that wraps as it must: the counter, Enviar and Cancelar first, then «+ Agregar» and «Cómo funciona», which
    // discloses the help; the help starts hidden (it no longer always takes the list's room).
    expect(astro).toMatch(/<div class="rep-ed-barra">\s*<p[^>]*data-editor-n[^>]*><\/p>\s*<button[^>]*data-editor-enviar[^>]*><\/button>\s*<button[^>]*data-editor-cancelar[^>]*>[^<]*<\/button>\s*<button[^>]*data-editor-agregar[^>]*><\/button>\s*<button[^>]*data-editor-como aria-expanded="false" aria-controls="rep-ed-ayuda">\{t\('editor\.como_funciona'\)\}<\/button>\s*<\/div>/);
    expect(astro).toMatch(/<p class="muted small rep-ed-ayuda" id="rep-ed-ayuda" data-editor-ayuda hidden>\{t\('editor\.ayuda'\)\}<\/p>/);
  });

  it('on a phone, edit mode gives the transcript room for its bar and a list of at least max(200 px, 40% of the screen)', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Every block of the phone layout (max-width 59.99rem), braces matched.
    const blocks: string[] = [];
    for (let at = css.indexOf('@media (max-width: 59.99rem)'); at >= 0; at = css.indexOf('@media (max-width: 59.99rem)', at + 1)) {
      let depth = 0;
      let k = css.indexOf('{', at);
      const start = k;
      for (; k < css.length; k++) {
        if (css[k] === '{') depth++;
        else if (css[k] === '}' && --depth === 0) break;
      }
      blocks.push(css.slice(start + 1, k));
    }
    const phone = blocks.join('\n');
    const rule = (sel: string) => phone.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const edit = '.rep-tr:has(> .rep-editor:not([hidden]))';
    // The transcript grows with what it holds (its 50dvh floor squeezed the list to 8-198 px under the editor's panel)...
    expect(rule(edit)).toMatch(/min-height:\s*auto/);
    // ...and the list keeps its own floor; it scrolls inside, the player's body scrolls around it.
    expect(rule(`${edit} > .rep-lineas`)).toMatch(/flex:\s*1 0 max\(12\.5rem,\s*40dvh\)/);
  });

  it('describes a change in words: the new text, a removal, a language', () => {
    expect(cambioTexto({ texto: 'Veredicto' })).toBe('«Veredicto»');
    expect(cambioTexto({ quitar: true })).toBe('Quitar esta línea');
    expect(cambioTexto({ texto: 'Diolch', idioma: 'cy' })).toBe('«Diolch» · Cymraeg');
  });

  it('a new line takes the language of the line playing there, else Spanish', () => {
    const tr = asTranscript({ src: 'reconstruida', lang: 'es', seg: [[10, 'a'], [20, 'b']], fuentes: [['whisper_es'], ['cy']] })!;
    expect([nuevaIdioma(tr, 5), nuevaIdioma(tr, 15), nuevaIdioma(tr, 25)]).toEqual(['es', 'es', 'cy']);
    expect(nuevaIdioma(asTranscript({ src: 'reconstruida', lang: 'en', seg: [[1, 'x']] })!, 3)).toBe('es');
  });
});

describe('the moment of a line added («+ Agregar una línea»)', () => {
  it("is the player's time; without one (a video that cannot play in the site), the address's t, else the last ✎ used", () => {
    expect(momentoNueva({ reproductor: 83.27, enlace: 98, ultimo: 40 })).toBe(83.3);
    expect(momentoNueva({ reproductor: 0, enlace: 98, ultimo: 40 })).toBe(0); // a player at the start has a time
    expect(momentoNueva({ reproductor: null, enlace: 98, ultimo: 40 })).toBe(98);
    expect(momentoNueva({ reproductor: null, enlace: null, ultimo: 40.5 })).toBe(40.5);
    expect(momentoNueva({ reproductor: null, enlace: 0, ultimo: 40 })).toBe(40); // #v=…, no t: the start is no moment
    expect(momentoNueva({ reproductor: Number.NaN, enlace: null, ultimo: null })).toBe(0);
    expect(momentoNueva({ reproductor: null, enlace: null, ultimo: null })).toBe(0);
  });

  it('reads the mm:ss field: minutes:seconds or hours:minutes:seconds', () => {
    expect(parseTiempo('12:05')).toBe(725);
    expect(parseTiempo(' 0:07 ')).toBe(7);
    expect(parseTiempo('75:00')).toBe(4500);
    expect(parseTiempo('1:02:03')).toBe(3723);
    for (const bad of ['', 'abc', '12', '12:5', '12:60', '1:60:00', '-1:00', '1:2:3', '12:05.5']) expect(parseTiempo(bad), bad).toBeNull();
  });

  it('takes the field as prefilled (to the tenth) or as written, never past the end of the video when its length is known', () => {
    expect(tiempoNueva('1:23', { prefill: 83.3, duracion: 600 })).toEqual({ ok: true, t: 83.3 });
    expect(tiempoNueva('9:59', { prefill: 83.3, duracion: 600 })).toEqual({ ok: true, t: 599 });
    expect(tiempoNueva('10:01', { prefill: 83.3, duracion: 600 })).toEqual({ ok: false, key: 'editor.error_tiempo_fin', duracion: '10:00' });
    expect(tiempoNueva('99:00', { prefill: 0, duracion: null })).toEqual({ ok: true, t: 5940 });
    expect(tiempoNueva('doce', { prefill: 0, duracion: null })).toEqual({ ok: false, key: 'editor.error_tiempo' });
  });
});

describe('sending', () => {
  it('calls submit once with every change, as one video_text contribution, and clears the draft', async () => {
    const tr = small();
    const s = store();
    let d = setLine(tr, emptyDraft(video.id, tr.exportado), 0, { texto: 'Buenas noches a todos' });
    d = setLine(tr, d, 4, { quitar: true });
    d = addNueva(d, { t: 33, texto: 'Bore da', idioma: 'cy' });
    saveDraft(d, s);
    const calls: unknown[][] = [];
    const r = await sendDraft(tr, d, video, async (...a) => (calls.push(a), { ok: true }), s);
    expect(r).toEqual({ ok: true });
    expect(calls).toEqual([[
      'video_text', 'chubut', 2024, null,
      {
        video: { id: video.id, title: video.title }, base: '2026-11-22T10:05:00Z',
        cambios: [
          { t: 10, antes: 'Buenas noches', texto: 'Buenas noches a todos' },
          { t: 33, texto: 'Bore da', idioma: 'cy' },
          { t: 40, antes: '¡Bravo!', quitar: true },
        ],
      },
    ]]);
    expect(loadDraft(video.id, s)).toBeNull();
  });

  it('keeps the draft when the database says no (daily limit, signed out)', async () => {
    const tr = small();
    const s = store();
    const d = setLine(tr, emptyDraft(video.id), 0, { texto: 'Buenas noches a todos' });
    saveDraft(d, s);
    const r = await sendDraft(tr, d, video, async () => ({ ok: false, key: 'contrib.error.limite' }), s);
    expect(r).toEqual({ ok: false, key: 'contrib.error.limite' });
    expect(loadDraft(video.id, s)).toEqual(d);
  });

  it('sends nothing for a draft with no real change', async () => {
    let n = 0;
    const r = await sendDraft(small(), emptyDraft(video.id), video, async () => (n++, { ok: true }), store());
    expect(r).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
    expect(n).toBe(0);
  });
});

describe("the author's own pending changes (data-pendiente)", () => {
  it('mark the line each change was made on, and place each add after the line playing at its time', () => {
    const tr = small();
    const rows = [
      { payload: { cambios: [{ t: 10, antes: 'Buenas noches', texto: 'Buenas noches a todos' }, { t: 41, antes: '¡Bravo!', quitar: true }] } },
      { payload: { cambios: [{ t: 31, texto: 'Bore da', idioma: 'cy' }, { t: 5, texto: 'Antes de todo', idioma: 'es' }] } },
    ];
    expect(pendingMarks(tr, rows)).toEqual({
      lineas: { 0: { texto: 'Buenas noches a todos' }, 5: { quitar: true } },
      nuevas: [{ despues: 3, t: 31, texto: 'Bore da', idioma: 'cy' }, { despues: -1, t: 5, texto: 'Antes de todo', idioma: 'es' }],
    });
  });

  it('never mark a lyric line nor a line whose words changed since; ignore malformed rows', () => {
    const tr = small();
    const rows = [
      { payload: { cambios: [{ t: 20, antes: 'Calon lân', texto: 'x' }, { t: 30, antes: 'Otra cosa', texto: 'y' }, null, { t: 'no' }] } },
      { payload: null }, {},
    ];
    expect(pendingMarks(tr, rows as never)).toEqual({ lineas: {}, nuevas: [] });
  });
});
