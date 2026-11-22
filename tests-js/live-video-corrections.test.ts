import { describe, expect, it } from 'vitest';
import {
  approvedCorrections, correctionCredits, lineCredit, loadTranscriptLive, withLiveCorrections, type LiveTranscript,
} from '../src/lib/live-video-corrections';
import type { CorrectionRow } from '../src/lib/video-corrections';
import { asTranscript, type Transcript } from '../src/lib/video-transcript';

const row = (id: string, at: string, display_name: string | null, cambios: CorrectionRow['payload']['cambios']): CorrectionRow =>
  ({ id, reviewed_at: `2026-11-22T${at}:00+00:00`, display_name, payload: { video: { id: 'TESTVIDEO01' }, cambios } });

// A published file after the export applied Ana's row r1 (removed the twin at 31, rewrote 61).
const file = (): Transcript => asTranscript({
  src: 'reconstruida', lang: 'es',
  seg: [[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo!'], [61, '¡Muy bien!']],
  fuentes: [['whisper_es'], ['whisper_es'], ['whisper_es'], ['whisper_es', 'colab']],
  correcciones: ['r1'], exportado: '2026-11-22T15:00:00+00:00',
  // r9's change at 33 and r7's add at 45 found no line at the export (an add's antes is null).
  sin_anclar: [{ id: 'r9', t: 33, antes: 'Muy bien', motivo: 'sin_linea' }, { id: 'r7', t: 45, antes: null, motivo: 'sin_linea' }],
})!;
const ana = row('r1', '10:00', 'Ana', [{ t: 31, antes: '¡Bravo!', quitar: true }, { t: 61, antes: '¡Bravo!', texto: '¡Muy bien!' }]);

/** A Supabase client that records the query it is asked and answers with `answer`. */
function fakeClient(answer: () => Promise<{ data: unknown; error: unknown }>) {
  const calls: string[][] = [];
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    q[m] = (...a: unknown[]) => {
      calls.at(-1)!.push(`${m}(${a.map((x) => JSON.stringify(x)).join(', ')})`);
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => answer().then(ok, ko);
  const client: any = { from: (table: string) => (calls.push([`from(${JSON.stringify(table)})`]), q) };
  return { client, calls };
}

describe('approvedCorrections', () => {
  it("asks for the video's approved transcript corrections in the order they were approved", async () => {
    const { client, calls } = fakeClient(async () => ({ data: [ana], error: null }));
    const r = await approvedCorrections('VID_A', client);
    expect(r).toEqual({ rows: [ana], offline: false });
    expect(calls).toHaveLength(1);
    const c = calls[0].join('.');
    expect(c).toContain('from("public_contributions")');
    expect(c).toContain('eq("type", "video_text")');
    expect(c).toContain('eq("payload->video->>id", "VID_A")');
    // reviewed_at, then id: many rows were approved in the same instant.
    expect(c.indexOf('order("reviewed_at"')).toBeGreaterThan(-1);
    expect(c.indexOf('order("id"')).toBeGreaterThan(c.indexOf('order("reviewed_at"'));
  });

  it('asks once per video for the page view', async () => {
    const { client, calls } = fakeClient(async () => ({ data: [ana], error: null }));
    await approvedCorrections('VID_B', client);
    await approvedCorrections('VID_B', client);
    await approvedCorrections('VID_C', client);
    expect(calls).toHaveLength(2);
  });

  it('is offline with no rows when the database cannot answer, and asks again next time', async () => {
    const { client, calls } = fakeClient(async () => ({ data: null, error: { message: 'paused' } }));
    expect(await approvedCorrections('VID_D', client)).toEqual({ rows: [], offline: true });
    await approvedCorrections('VID_D', client);
    expect(calls).toHaveLength(2);
    expect(await approvedCorrections('VID_E', null)).toEqual({ rows: [], offline: true });
  });

  it('drops rows it cannot use', async () => {
    const { client } = fakeClient(async () => ({ data: [ana, null, { id: 5, payload: {} }, { id: 'x' }], error: null }));
    expect((await approvedCorrections('VID_F', client)).rows).toEqual([ana]);
  });
});

describe('withLiveCorrections', () => {
  it('does not apply again a row the file already holds, and applies a new one', () => {
    const carla = row('r3', '16:00', 'Carla', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien, gracias' }]);
    const before = file();
    const out = withLiveCorrections(before, [ana, carla]);
    expect(out.tr.seg).toEqual([[30, '¡Bravo!'], [33, 'Muy bien, gracias'], [60, '¡Bravo!'], [61, '¡Muy bien!']]);
    expect(out.tr.fuentes?.[1]).toEqual(['whisper_es', 'colab']);
    expect(out.tr.fuentes?.[3]).toEqual(['whisper_es', 'colab']);
    expect(out.autores).toEqual({ 1: ['Carla'] });
    expect(before).toEqual(file());
  });

  it('reports, instead of landing on the twin line, a duplicate of a row the file holds', () => {
    const bruno = row('r2', '16:00', 'Bruno', [{ t: 31, antes: '¡Bravo!', quitar: true }]);
    const out = withLiveCorrections(file(), [ana, bruno]);
    expect(out.tr).toEqual(file());
    expect(out.autores).toEqual({});
  });

  it('never applies a change the export could not place', () => {
    // r9's change at 33 is in the file's sin_anclar; from the file it would now land on line 33. So is r7's add.
    const r9 = row('r9', '11:00', 'Dora', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien dicho' }, { t: 60, antes: '¡Bravo!', texto: '¡Bravo, bravo!' }]);
    const r7 = row('r7', '11:30', 'Fede', [{ t: 45, texto: 'Aplausos' }]);
    const out = withLiveCorrections(file(), [ana, r9, r7]);
    expect(out.tr.seg).toEqual([[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo, bravo!'], [61, '¡Muy bien!']]);
    expect(out.autores).toEqual({ 2: ['Dora'] });
  });

  it('applies at once a change an admin re-anchored after the export (same row and time, new antes or none)', () => {
    // Task 8's re-anchor keeps the row id and replaces its changes: r9's listed change (t 33, antes "Muy bien") became
    // an add at the same time ("agregar como línea nueva en t"), or a change of another part of the line.
    const asAdd = withLiveCorrections(file(), [ana, row('r9', '11:00', 'Dora', [{ t: 33, texto: 'Muy bien dicho' }])]);
    expect(asAdd.tr.seg).toEqual([[30, '¡Bravo!'], [33, 'Muy bien'], [33, 'Muy bien dicho'], [60, '¡Bravo!'], [61, '¡Muy bien!']]);
    expect(asAdd.autores).toEqual({ 2: ['Dora'] });
    const asRun = withLiveCorrections(file(), [ana, row('r9', '11:00', 'Dora', [{ t: 33, antes: 'bien', texto: 'bien dicho' }])]);
    expect(asRun.tr.seg[1]).toEqual([33, 'Muy bien dicho']);
    // r7's add, listed with antes null, stays out while it is the same add.
    const r7 = withLiveCorrections(file(), [ana, row('r7', '11:30', 'Fede', [{ t: 45, texto: 'Aplausos' }])]);
    expect(r7.tr).toEqual(file());
  });

  it('returns the file itself when nothing new applies', () => {
    const f = file();
    expect(withLiveCorrections(f, []).tr).toBe(f);
    expect(withLiveCorrections(f, [ana]).tr).toBe(f);
  });

  it('works on a file without per-line sources', () => {
    const f = asTranscript({ src: 'youtube', lang: 'es', seg: [[5, 'hola'], [9, 'chau']] })!;
    const out = withLiveCorrections(f, [row('r4', '16:00', 'Eli', [{ t: 9, antes: 'chau', texto: 'Chau' }])]);
    expect(out.tr.seg).toEqual([[5, 'hola'], [9, 'Chau']]);
    expect(out.tr.fuentes).toEqual([[], ['colab']]);
    expect(out.autores).toEqual({ 1: ['Eli'] });
  });
});

describe('loadTranscriptLive (what the player renders)', () => {
  const published = () => JSON.parse(JSON.stringify(file()));
  type Call = [LiveTranscript | null, boolean];
  const carla = row('r3', '16:00', 'Carla', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien, gracias' }]);

  it('renders the file at once, without waiting for the corrections', async () => {
    const calls: Call[] = [];
    let rendered!: () => void;
    const first = new Promise<void>((r) => (rendered = r));
    void loadTranscriptLive('VID', async () => published(), (shown, update) => {
      calls.push([shown, update]);
      rendered();
    }, { approved: () => new Promise(() => {}) }); // the database never answers
    await first;
    expect(calls).toEqual([[{ tr: file(), autores: {}, nombres: [] }, false]]);
  });

  it('renders again when the corrections arrive and change the text', async () => {
    const calls: Call[] = [];
    let answer!: (a: { rows: CorrectionRow[]; offline: boolean }) => void;
    const done = loadTranscriptLive('VID', async () => published(), (shown, update) => calls.push([shown, update]),
      { approved: () => new Promise((r) => (answer = r)) });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(1);
    answer({ rows: [ana, carla], offline: false });
    await done;
    expect(calls).toHaveLength(2);
    const [shown, update] = calls[1];
    expect(update).toBe(true);
    expect(shown?.tr.seg[1]).toEqual([33, 'Muy bien, gracias']);
    expect(shown?.autores).toEqual({ 1: ['Carla'] });
    expect(shown?.nombres).toEqual(['Ana', 'Carla']);
  });

  it('renders the file only once when the corrections cannot be read or there are none (Review Focus 4)', async () => {
    for (const a of [{ rows: [], offline: true }, { rows: [], offline: false }]) {
      const calls: Call[] = [];
      await loadTranscriptLive('VID', async () => published(), (s, u) => calls.push([s, u]), { approved: async () => a });
      expect(calls).toEqual([[{ tr: file(), autores: {}, nombres: [] }, false]]);
    }
  });

  it('with only rows the file holds, keeps the lines and adds their credit', async () => {
    const calls: Call[] = [];
    await loadTranscriptLive('VID', async () => published(), (s, u) => calls.push([s, u]),
      { approved: async () => ({ rows: [ana], offline: false }) });
    expect(calls).toHaveLength(2);
    expect(calls[1][0]?.tr).toBe(calls[0][0]?.tr);
    expect(calls[1][0]?.nombres).toEqual(['Ana']);
  });

  it('has nothing for a video without a file, and then does not ask for corrections', async () => {
    let asked = 0;
    const approved = async () => (asked++, { rows: [ana], offline: false });
    for (const f of [async () => null, async () => ({ error: 'not a transcript' }), () => Promise.reject(new TypeError('Failed to fetch'))]) {
      const calls: Call[] = [];
      await loadTranscriptLive('VID', f, (s, u) => calls.push([s, u]), { approved });
      expect(calls).toEqual([[null, false]]);
    }
    expect(asked).toBe(0);
  });

  it('drops a reply for a video the visitor already left', async () => {
    const calls: Call[] = [];
    let left = true;
    await loadTranscriptLive('VID', async () => published(), (s, u) => calls.push([s, u]),
      { approved: async () => ({ rows: [ana, carla], offline: false }), stale: () => left });
    expect(calls).toEqual([]);
    // Left while the corrections were on their way: the file stays, the corrections are dropped.
    let answer!: (a: { rows: CorrectionRow[]; offline: boolean }) => void;
    left = false;
    const done = loadTranscriptLive('VID', async () => published(), (s, u) => calls.push([s, u]),
      { approved: () => new Promise((r) => (answer = r)), stale: () => left });
    await new Promise((r) => setTimeout(r, 0));
    left = true;
    answer({ rows: [ana, carla], offline: false });
    await done;
    expect(calls).toHaveLength(1);
  });

  it('says once when the text is final: after the corrected draw, or when the corrections change nothing or cannot come', async () => {
    // The edit mode resumes a draft only then, so a line an approved correction changed is not taken for gone.
    const log: string[] = [];
    const go = (approved: () => Promise<{ rows: CorrectionRow[]; offline: boolean }>, f: () => Promise<unknown> = async () => published(), stale = () => false) =>
      loadTranscriptLive('VID', f, (_s, u) => log.push(u ? 'corregida' : 'archivo'), { approved, stale, settled: () => log.push('final') });
    await go(async () => ({ rows: [ana, carla], offline: false }));
    expect(log.splice(0)).toEqual(['archivo', 'corregida', 'final']);
    await go(async () => ({ rows: [], offline: false }));
    expect(log.splice(0)).toEqual(['archivo', 'final']);
    await go(async () => ({ rows: [], offline: true }));
    expect(log.splice(0)).toEqual(['archivo', 'final']);
    await go(async () => ({ rows: [row('r9', '11:00', null, [])], offline: false })); // a row that changes nothing
    expect(log.splice(0)).toEqual(['archivo', 'final']);
    await go(async () => ({ rows: [], offline: false }), async () => null); // no file
    expect(log.splice(0)).toEqual(['archivo', 'final']);
    // Not while the corrections are on their way, and never for a video the visitor left.
    let answer!: (a: { rows: CorrectionRow[]; offline: boolean }) => void;
    let left = false;
    const done = go(() => new Promise((r) => (answer = r)), undefined, () => left);
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(['archivo']);
    left = true;
    answer({ rows: [carla], offline: false });
    await done;
    expect(log).toEqual(['archivo']);
  });
});

describe('credits', () => {
  it('lists each contributor once, in the order approved, only for rows that changed the text', () => {
    const f = file();
    const rows = [ana, row('r9', '11:00', 'Dora', []), row('r3', '16:00', 'Carla', []), row('r5', '17:00', 'Ana', []), row('r6', '18:00', null, [])];
    expect(correctionCredits(f, rows, { 1: ['Carla'] })).toEqual(['Ana', 'Carla']);
    expect(correctionCredits(f, [], {})).toEqual([]);
  });

  it("marks a corrected line and names who corrected it in its title", () => {
    expect(lineCredit(['yt_es'], undefined)).toEqual({ colab: false, title: 'YouTube automático' });
    expect(lineCredit(undefined, undefined)).toEqual({ colab: false, title: '' });
    expect(lineCredit(['yt_es', 'colab'], undefined)).toEqual({ colab: true, title: 'YouTube automático + corrección de colaboradores' });
    expect(lineCredit(['yt_es', 'colab'], ['Ana', 'Bruno'])).toEqual({ colab: true, title: 'YouTube automático + Corregida por Ana y Bruno' });
    expect(lineCredit(['colab'], ['Ana'])).toEqual({ colab: true, title: 'Corregida por Ana' });
    // A language-only correction: the text is still the machine's.
    expect(lineCredit(['cy'], ['Gwen'])).toEqual({ colab: true, title: 'reconocimiento de galés + Corregida por Gwen' });
    // A correction by someone without a display name still marks the line.
    expect(lineCredit(['colab'], [])).toEqual({ colab: true, title: 'corrección de colaboradores' });
  });
});
