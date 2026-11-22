// The player's edit mode (scripts/editor-transcripcion.ts) is a thin DOM layer over lib/transcript-draft.ts; the
// repository has no DOM library, so what the layer draws is tested here on the model it draws from. The real browser
// check (focus, phone width, a 2,956-line session) is part of the manual pass.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addNueva, cambiosLabel, cambioTexto, editControls, editorAccess, emptyDraft, enviarLabel, loadDraft, nuevaIdioma,
  pendingMarks, puedeEntrar, saveDraft, sendDraft, setLine,
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
