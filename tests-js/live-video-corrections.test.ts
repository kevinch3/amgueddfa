import { describe, expect, it } from 'vitest';
import {
  approvedCorrections, correctionCredits, lineCredit, liveTranscript, withLiveCorrections,
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
  sin_anclar: [{ id: 'r9', t: 33, antes: 'Muy bein', motivo: 'sin_linea' }],
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
    // r9's change is in the file's sin_anclar; from the file it would now land on line 33.
    const r9 = row('r9', '11:00', 'Dora', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien dicho' }, { t: 60, antes: '¡Bravo!', texto: '¡Bravo, bravo!' }]);
    const out = withLiveCorrections(file(), [ana, r9]);
    expect(out.tr.seg).toEqual([[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo, bravo!'], [61, '¡Muy bien!']]);
    expect(out.autores).toEqual({ 2: ['Dora'] });
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

describe('liveTranscript (what the player renders)', () => {
  const published = () => JSON.parse(JSON.stringify(file()));

  it('renders the file unchanged when the corrections cannot be read (Review Focus 4)', async () => {
    const out = await liveTranscript('VID', async () => published(), async () => ({ rows: [], offline: true }));
    expect(out?.tr).toEqual(file());
    expect(out?.autores).toEqual({});
    expect(out?.nombres).toEqual([]);
  });

  it('has nothing for a video without a file, and then does not ask for corrections', async () => {
    let asked = 0;
    const approved = async () => (asked++, { rows: [ana], offline: false });
    expect(await liveTranscript('VID', async () => null, approved)).toBeNull(); // 404
    expect(await liveTranscript('VID', async () => ({ error: 'not a transcript' }), approved)).toBeNull();
    expect(await liveTranscript('VID', () => Promise.reject(new TypeError('Failed to fetch')), approved)).toBeNull();
    expect(asked).toBe(0);
  });

  it('applies the approved corrections the file does not hold yet, and credits everyone behind the text', async () => {
    const carla = row('r3', '16:00', 'Carla', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien, gracias' }]);
    const out = await liveTranscript('VID', async () => published(), async () => ({ rows: [ana, carla], offline: false }));
    expect(out?.tr.seg[1]).toEqual([33, 'Muy bien, gracias']);
    expect(out?.autores).toEqual({ 1: ['Carla'] });
    expect(out?.nombres).toEqual(['Ana', 'Carla']);
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
