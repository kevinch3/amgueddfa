import { describe, expect, it } from 'vitest';
import {
  addNueva, cambiosFrom, clearDraft, countCambios, DRAFT_KEY, emptyDraft, fitDraft, lineIdioma, loadDraft, removeNueva,
  saveDraft, setLine, undoLine, type Draft,
} from '../src/lib/transcript-draft';
import { withLiveCorrections } from '../src/lib/live-video-corrections';
import { asTranscript, type Transcript } from '../src/lib/video-transcript';

// A reconstructed session as the player shows it: a Spanish announcement, a Welsh line the model labelled Spanish,
// subscription garbage, a sung lyric (never editable) and the verdict.
const tr = (): Transcript => asTranscript({
  src: 'reconstruida', lang: 'es', exportado: '2026-11-22T10:05:00Z',
  seg: [
    [10, 'Buenas noches a todos'],
    [2664, 'Benedicto de la Competencia Número noventa y ocho'],
    [3121.4, '¡Suscríbete al canal!'],
    [3200, 'Calon lân yn llawn daioni'],
    [3300.2, 'Diolch yn fawr i chi gyd'],
  ],
  fuentes: [['whisper_es'], ['whisper_es'], ['yt_es'], ['letra'], ['whisper_es']],
})!;

/** A localStorage stand-in. */
function store() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
/** Storage that refuses everything (a private window, blocked site data). */
const blocked = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError'); },
};

describe('cambiosFrom', () => {
  it('an edit, a quitar, an idioma and an add become four changes on the lines as shown', () => {
    const x = tr();
    let d = emptyDraft('UW0GV9sicGs', x.exportado);
    d = setLine(x, d, 1, { texto: 'Veredicto de la Competencia Número noventa y ocho', idioma: 'es' });
    d = setLine(x, d, 2, { quitar: true });
    d = setLine(x, d, 4, { texto: 'Diolch yn fawr i chi gyd', idioma: 'cy' });
    d = addNueva(d, { t: 3412, texto: ' Gracias a la comisión organizadora. ', idioma: 'es' });
    expect(cambiosFrom(x, d)).toEqual([
      { t: 2664, antes: 'Benedicto de la Competencia Número noventa y ocho', texto: 'Veredicto de la Competencia Número noventa y ocho' },
      { t: 3121.4, antes: '¡Suscríbete al canal!', quitar: true },
      { t: 3300.2, antes: 'Diolch yn fawr i chi gyd', idioma: 'cy' },
      { t: 3412, texto: 'Gracias a la comisión organizadora.', idioma: 'es' },
    ]);
    expect(countCambios(x, d)).toBe(4);
  });

  it('drops an edit that changes nothing (same words, same language), and never records it', () => {
    const x = tr();
    const d = setLine(x, emptyDraft('UW0GV9sicGs'), 0, { texto: '  Buenas noches a todos ', idioma: 'es' });
    expect(d.lines).toEqual({});
    expect(cambiosFrom(x, d)).toEqual([]);
    // A draft written by hand with a no-op entry still sends nothing.
    const hand: Draft = { video: 'UW0GV9sicGs', lines: { 0: { t: 10, antes: 'Buenas noches a todos', texto: 'Buenas noches a todos' } }, nuevas: [] };
    expect(cambiosFrom(x, hand)).toEqual([]);
  });

  it('never targets a lyric line', () => {
    const x = tr();
    expect(setLine(x, emptyDraft('V'), 3, { texto: 'otra cosa' }).lines).toEqual({});
    const hand: Draft = { video: 'V', lines: { 3: { t: 3200, antes: 'Calon lân yn llawn daioni', quitar: true } }, nuevas: [] };
    expect(cambiosFrom(x, hand)).toEqual([]);
  });

  it('quitar excludes the other fields; a blank text is no change of words', () => {
    const x = tr();
    const d = setLine(x, emptyDraft('V'), 2, { texto: 'algo', idioma: 'cy', quitar: true });
    expect(cambiosFrom(x, d)).toEqual([{ t: 3121.4, antes: '¡Suscríbete al canal!', quitar: true }]);
    expect(setLine(x, emptyDraft('V'), 0, { texto: '   ' }).lines).toEqual({});
  });

  it('antes is the line as the player shows it, after the approved corrections it applied live', () => {
    const file = tr();
    const live = withLiveCorrections(file, [{
      id: 'r1', reviewed_at: '2026-11-22T11:00:00Z', display_name: 'Ana',
      payload: { video: { id: 'UW0GV9sicGs' }, cambios: [{ t: 10, antes: 'Buenas noches a todos', texto: 'Buenas noches a todos y todas' }] },
    }]).tr;
    const d = setLine(live, emptyDraft('UW0GV9sicGs'), 0, { texto: 'Buenas noches a todas y todos' });
    expect(cambiosFrom(live, d)).toEqual([{ t: 10, antes: 'Buenas noches a todos y todas', texto: 'Buenas noches a todas y todos' }]);
  });

  it('a change whose line is no longer there (time or words) is not sent to another line', () => {
    const x = tr();
    const d: Draft = { video: 'V', lines: { 1: { t: 2664, antes: 'Otra línea que ya no está', texto: 'x' } }, nuevas: [] };
    expect(cambiosFrom(x, d)).toEqual([]);
  });
});

describe('setLine, undoLine, adds', () => {
  it('records only what differs; undo forgets the line', () => {
    const x = tr();
    let d = setLine(x, emptyDraft('V'), 1, { texto: 'Veredicto', idioma: 'es' });
    expect(d.lines[1]).toEqual({ t: 2664, antes: 'Benedicto de la Competencia Número noventa y ocho', texto: 'Veredicto' });
    expect(d.base).toBe('2026-11-22T10:05:00Z');
    d = setLine(x, d, 1, { texto: 'Benedicto de la Competencia Número noventa y ocho' }); // back to the original
    expect(d.lines).toEqual({});
    d = setLine(x, d, 4, { idioma: 'cy' });
    expect(undoLine(d, 4).lines).toEqual({});
  });

  it("the shown language: idiomas, else Welsh for a line the Welsh model heard, else the transcript's; only es/cy", () => {
    const x = asTranscript({ src: 'reconstruida', lang: 'es', seg: [[1, 'a'], [2, 'b'], [3, 'c']], fuentes: [['cy'], ['yt_es'], ['yt_es']], idiomas: ['cy', 'es', 'en'] })!;
    expect([0, 1, 2].map((i) => lineIdioma(x, i))).toEqual(['cy', 'es', null]);
  });

  it('adds keep their time and language; a blank add is ignored; removeNueva drops one', () => {
    let d = addNueva(emptyDraft('V'), { t: 12.34, texto: 'Hola', idioma: 'es' });
    d = addNueva(d, { t: 5, texto: '  ', idioma: 'cy' });
    d = addNueva(d, { t: 20, texto: 'Bore da', idioma: 'cy' });
    expect(d.nuevas).toEqual([{ t: 12.3, texto: 'Hola', idioma: 'es' }, { t: 20, texto: 'Bore da', idioma: 'cy' }]);
    expect(removeNueva(d, 0).nuevas).toEqual([{ t: 20, texto: 'Bore da', idioma: 'cy' }]);
  });
});

describe('fitDraft: a draft reopened on a transcript that changed', () => {
  it('keeps each change on its own line, follows a line that moved, and drops one whose line is gone', () => {
    const x = tr();
    let d = setLine(x, emptyDraft('V'), 1, { texto: 'Veredicto de la Competencia Número noventa y ocho' });
    d = setLine(x, d, 2, { quitar: true });
    // Same lines, untouched: nothing moves.
    expect(fitDraft(x, d)).toEqual({ draft: d, descartados: 0 });
    // A line added before them (a live correction) and the garbage line rewritten by someone else meanwhile.
    const moved = asTranscript({
      ...x, seg: [[5, 'Bienvenidos'], ...x.seg.map(([s, w]) => [s, s === 3121.4 ? 'Gracias por venir' : w])],
      fuentes: [['colab'], ...x.fuentes!],
    })!;
    const fit = fitDraft(moved, d);
    expect(fit.descartados).toBe(1);
    expect(Object.keys(fit.draft.lines)).toEqual(['2']);
    expect(cambiosFrom(moved, fit.draft)).toEqual([
      { t: 2664, antes: 'Benedicto de la Competencia Número noventa y ocho', texto: 'Veredicto de la Competencia Número noventa y ocho' },
    ]);
  });

  it('a rebuild that moved the line by under 2 s, with the same words, keeps the change (with the new time and text)', () => {
    const x = tr();
    const d = setLine(x, emptyDraft('V'), 2, { quitar: true });
    const rebuilt = asTranscript({ ...x, seg: x.seg.map(([s, w]) => (s === 3121.4 ? [3122.6, 'Suscríbete al canal'] : [s, w])) })!;
    const fit = fitDraft(rebuilt, d);
    expect(fit.descartados).toBe(0);
    expect(cambiosFrom(rebuilt, fit.draft)).toEqual([{ t: 3122.6, antes: 'Suscríbete al canal', quitar: true }]);
  });
});

describe('draft storage (localStorage, a convenience only)', () => {
  it(`is kept per video under ${DRAFT_KEY}<id> and survives closing and reopening the player`, () => {
    const s = store();
    const x = tr();
    let d = setLine(x, emptyDraft('UW0GV9sicGs', x.exportado), 1, { texto: 'Veredicto' });
    d = addNueva(d, { t: 3412, texto: 'Gracias', idioma: 'es' });
    saveDraft(d, s);
    expect([...s.m.keys()]).toEqual(['amg:borrador-video:UW0GV9sicGs']);
    const again = loadDraft('UW0GV9sicGs', s)!;
    expect(again).toEqual(d);
    expect(fitDraft(x, again)).toEqual({ draft: d, descartados: 0 });
    expect(cambiosFrom(x, again)).toHaveLength(2);
    expect(loadDraft('otroVideo1', s)).toBeNull();
  });

  it('an empty draft removes the key; clearDraft removes it', () => {
    const s = store();
    const d = addNueva(emptyDraft('UW0GV9sicGs'), { t: 1, texto: 'x', idioma: 'es' });
    saveDraft(d, s);
    saveDraft(removeNueva(d, 0), s);
    expect(s.m.size).toBe(0);
    saveDraft(d, s);
    clearDraft('UW0GV9sicGs', s);
    expect(s.m.size).toBe(0);
  });

  it('never throws: blocked storage, no storage, broken or foreign JSON', () => {
    const d = addNueva(emptyDraft('UW0GV9sicGs'), { t: 1, texto: 'x', idioma: 'es' });
    expect(() => saveDraft(d, blocked)).not.toThrow();
    expect(loadDraft('UW0GV9sicGs', blocked)).toBeNull();
    expect(() => clearDraft('UW0GV9sicGs', blocked)).not.toThrow();
    expect(() => saveDraft(d, null)).not.toThrow();
    expect(loadDraft('UW0GV9sicGs', null)).toBeNull();
    // Default storage (none in Node, or one whose accessor throws): still no throw.
    expect(() => saveDraft(d)).not.toThrow();
    expect(loadDraft('UW0GV9sicGs')).toBeNull();
    const s = store();
    s.setItem('amg:borrador-video:UW0GV9sicGs', '{not json');
    expect(loadDraft('UW0GV9sicGs', s)).toBeNull();
    s.setItem('amg:borrador-video:UW0GV9sicGs', JSON.stringify({ video: 'otro', lines: {}, nuevas: [{ t: 1, texto: 'x', idioma: 'es' }] }));
    expect(loadDraft('UW0GV9sicGs', s)).toBeNull();
  });

  it('keeps only well-formed entries of a stored draft', () => {
    const s = store();
    s.setItem('amg:borrador-video:UW0GV9sicGs', JSON.stringify({
      video: 'UW0GV9sicGs', base: '2026-11-22T10:05:00Z',
      lines: { 1: { t: 2664, antes: 'B', texto: 'V' }, x: { t: 1, antes: 'a', quitar: true }, 2: { t: 'no', antes: 'a', quitar: true }, 3: { t: 3, antes: 'c', idioma: 'fr' } },
      nuevas: [{ t: 9, texto: 'ok', idioma: 'cy' }, { t: -1, texto: 'no', idioma: 'es' }, { t: 9, texto: 'sin idioma' }],
    }));
    expect(loadDraft('UW0GV9sicGs', s)).toEqual({
      video: 'UW0GV9sicGs', base: '2026-11-22T10:05:00Z',
      lines: { 1: { t: 2664, antes: 'B', texto: 'V' } },
      nuevas: [{ t: 9, texto: 'ok', idioma: 'cy' }],
    });
  });
});
