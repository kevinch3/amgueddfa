import { describe, expect, it } from 'vitest';
import { loadApprovedVideoText, reanchor, setVideoTextChanges, withdrawContribution } from '../src/lib/admin';
import {
  canAddNew, groupByVideo, reanchorOptions, reanchoredCambios, sinAnclarList, withdrawnInFile, type ApprovedVideoText,
} from '../src/lib/admin-videos';
import type { Cambio } from '../src/lib/video-corrections';
import { asTranscript, type Transcript } from '../src/lib/video-transcript';

const at = (hhmm: string) => `2026-11-22T${hhmm}:00+00:00`;
const row = (id: string, video: string, reviewed: string, nombre: string | null, cambios: Cambio[], title?: string): ApprovedVideoText => ({
  id, user_id: `u-${id}`, festival: 'chubut', year: 2025, created_at: at('09:00'), reviewed_at: at(reviewed), display_name: nombre,
  payload: { video: { id: video, ...(title ? { title } : {}) }, cambios },
});

/** A Supabase client that records rpc calls and answers each with `error`. */
function rpcClient(error: { message: string } | null = null) {
  const calls: [string, unknown][] = [];
  const client: any = { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { data: null, error }) };
  return { client, calls };
}

describe('reanchorOptions', () => {
  const tr = asTranscript({
    src: 'reconstruida', lang: 'es',
    seg: [[10, 'lejos antes'], [40, 'justo un minuto'], [50, 'cincuenta'], [100, 'la misma'], [130, 'Calon lân yn llawn daioni'],
      [159, 'casi un minuto'], [161, 'pasado el minuto']],
    fuentes: [['whisper_es'], ['whisper_es'], ['whisper_es'], ['whisper_es', 'colab'], ['letra'], ['cy'], ['whisper_es']],
  })!;

  it('lists the lines within a minute of the time, nearest first, never a lyric line', () => {
    expect(reanchorOptions(tr, 100)).toEqual([
      { i: 3, t: 100, text: 'la misma' },
      { i: 2, t: 50, text: 'cincuenta' },
      { i: 5, t: 159, text: 'casi un minuto' },
      { i: 1, t: 40, text: 'justo un minuto' },
    ]);
  });

  it('works on a file without per-line sources, and is empty far from every line', () => {
    const plain = asTranscript({ src: 'youtube', lang: 'es', seg: [[5, 'hola'], [9, 'chau']] })!;
    expect(reanchorOptions(plain, 8)).toEqual([{ i: 1, t: 9, text: 'chau' }, { i: 0, t: 5, text: 'hola' }]);
    expect(reanchorOptions(plain, 500)).toEqual([]);
  });
});

describe('groupByVideo', () => {
  it('groups the approved corrections by video, newest first, and the videos by their newest correction', () => {
    const r1 = row('r1', 'VID_A', '10:00', 'Ana', [{ t: 1, antes: 'a', texto: 'A' }], 'Sesión de la tarde');
    const r2 = row('r2', 'VID_B', '12:00', 'Bruno', [{ t: 2, antes: 'b', texto: 'B' }]);
    const r3 = row('r3', 'VID_A', '14:00', 'Carla', [{ t: 3, antes: 'c', texto: 'C' }]);
    const r4 = row('r4', 'VID_B', '12:00', 'Dora', [{ t: 4, antes: 'd', texto: 'D' }]); // approved in the same instant as r2
    const sinVideo = { ...row('r5', '', '15:00', 'Eli', []), payload: { cambios: [] } } as ApprovedVideoText;
    const groups = groupByVideo([r1, r2, r3, r4, sinVideo]);
    expect(groups.map((g) => g.id)).toEqual(['VID_A', 'VID_B']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['r3', 'r1']);
    expect(groups[1].rows.map((r) => r.id)).toEqual(['r4', 'r2']);
    expect(groups[0].title).toBe('Sesión de la tarde');
    expect(groups[1].title).toBe('VID_B');
    expect(groups[0]).toMatchObject({ festival: 'chubut', year: 2025 });
  });
});

describe('withdrawContribution', () => {
  it('asks for a reason first and sends nothing without one', async () => {
    const { client, calls } = rpcClient();
    expect(await withdrawContribution('c1', '   ', client)).toEqual({ ok: false, key: 'admin.error.motivo' });
    expect(calls).toEqual([]);
  });

  it('withdraws with the reason given', async () => {
    const { client, calls } = rpcClient();
    expect(await withdrawContribution('c1', '  Duplica otra corrección ', client)).toEqual({ ok: true });
    expect(calls).toEqual([['admin_withdraw_contribution', { cid: 'c1', note: 'Duplica otra corrección' }]]);
  });

  it('says why the database refused', async () => {
    expect(await withdrawContribution('c1', 'x', rpcClient({ message: 'not_approved' }).client)).toEqual({ ok: false, key: 'admin.error.no_aprobada' });
    expect(await withdrawContribution('c1', 'x', rpcClient({ message: 'forbidden' }).client)).toEqual({ ok: false, key: 'admin.error.no_admin' });
    expect(await withdrawContribution('c1', 'x', rpcClient({ message: 'wrong_type' }).client)).toEqual({ ok: false, key: 'admin.error.valor' });
    expect(await withdrawContribution('c1', 'x', null)).toEqual({ ok: false, key: 'estado.sin_conexion' });
  });
});

describe('setVideoTextChanges', () => {
  const cambios: Cambio[] = [{ t: 10, antes: 'a', texto: 'A' }];
  it('replaces the changes of an approved correction', async () => {
    const { client, calls } = rpcClient();
    expect(await setVideoTextChanges('c1', cambios, client)).toEqual({ ok: true });
    expect(calls).toEqual([['admin_set_video_text_changes', { cid: 'c1', cambios }]]);
  });

  it('sends nothing the database would refuse (none, or more than 200)', async () => {
    const { client, calls } = rpcClient();
    expect(await setVideoTextChanges('c1', [], client)).toEqual({ ok: false, key: 'admin.error.valor' });
    expect(await setVideoTextChanges('c1', Array.from({ length: 201 }, (_, i) => ({ t: i, texto: 'x' })), client)).toEqual({ ok: false, key: 'admin.error.valor' });
    expect(calls).toEqual([]);
    expect(await setVideoTextChanges('c1', cambios, rpcClient({ message: 'invalid' }).client)).toEqual({ ok: false, key: 'admin.error.valor' });
  });
});

describe('loadApprovedVideoText', () => {
  it("reads every approved transcript correction, newest first, with its author's name", async () => {
    const calls: string[] = [];
    const q: any = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      q[m] = (...a: unknown[]) => (calls.push(`${m}(${a.map((x) => JSON.stringify(x)).join(', ')})`), q);
    }
    const data = [{ ...row('r1', 'VID_A', '10:00', null, []), author: { display_name: 'Ana' } }];
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
    const client: any = { from: (table: string) => (calls.push(`from(${JSON.stringify(table)})`), q) };
    const r = await loadApprovedVideoText(client);
    expect(r.offline).toBe(false);
    expect(r.data[0].display_name).toBe('Ana');
    expect(r.data[0].reviewed_at).toBe(at('10:00'));
    const c = calls.join('.');
    expect(c).toContain('from("contributions")');
    expect(c).toContain('eq("status", "approved")');
    expect(c).toContain('eq("type", "video_text")');
    expect(c).toContain('order("reviewed_at", {"ascending":false})');
    expect(await loadApprovedVideoText(null)).toEqual({ data: [], offline: true });
  });
});

// The published file after an export that applied Ana's r1 and Eli's r5. r5 wrote "croeso i bawb" into a joined line,
// but its language could not go on that line; r9's change at 33 found no line; r8 (since withdrawn) found none either.
const file = (): Transcript => asTranscript({
  src: 'reconstruida', lang: 'es',
  seg: [[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo!'], [61, '¡Muy bien!'], [90, 'Bienvenidos a todos, croeso i bawb'], [120, 'Gracias']],
  fuentes: [['whisper_es'], ['whisper_es'], ['whisper_es'], ['whisper_es', 'colab'], ['whisper_es', 'cy', 'colab'], ['whisper_es', 'colab']],
  correcciones: ['r1', 'r5'],
  sin_anclar: [
    { id: 'r9', t: 33, antes: 'Muy bien', motivo: 'sin_linea' },
    { id: 'r5', t: 93, antes: 'croeso i bob', motivo: 'idioma_en_linea_unida' },
    { id: 'r8', t: 70, antes: 'algo', motivo: 'sin_linea' },
  ],
})!;
const ana = row('r1', 'V', '10:00', 'Ana', [{ t: 31, antes: '¡Bravo!', quitar: true }, { t: 61, antes: '¡Bravo!', texto: '¡Muy bien!' }]);
const eli = row('r5', 'V', '10:30', 'Eli', [{ t: 93, antes: 'croeso i bob', texto: 'croeso i bawb', idioma: 'cy' }, { t: 120, antes: 'gracias', texto: 'Gracias' }]);
const dora = row('r9', 'V', '11:00', 'Dora', [{ t: 33, antes: 'Muy bien', texto: 'Muy bien dicho' }, { t: 60, antes: '¡Bravo!', texto: '¡Bravo, bravo!' }]);
// Approved after the export, so not in the file yet.
const bruno = row('r2', 'V', '16:00', 'Bruno', [{ t: 31, antes: '¡Bravo!', quitar: true }]); // repeats Ana's removal
const carla = row('r3', 'V', '16:30', 'Carla', [{ t: 45, antes: 'Aplausos', texto: 'Aplausos fuertes' }]); // no such line

describe('sinAnclarList', () => {
  it("lists, in time order, the file's unplaced changes of rows still approved and those the browser cannot place", () => {
    const { items, live } = sinAnclarList(file(), [ana, eli, dora, bruno, carla]);
    expect(items.map((x) => [x.row, x.index, x.motivo, x.baked])).toEqual([
      ['r2', 0, 'sin_linea', false], // the repeat of a row the file holds is reported, not landed on the twin at 30
      ['r9', 0, 'sin_linea', false],
      ['r3', 0, 'sin_linea', false],
      ['r5', 0, 'idioma_en_linea_unida', true],
    ]);
    expect(items[0].cambio).toBe(bruno.payload.cambios[0]);
    // What the player shows: Dora's other change applies live; the listed one does not.
    expect(live.seg.slice(0, 3)).toEqual([[30, '¡Bravo!'], [33, 'Muy bien'], [60, '¡Bravo, bravo!']]);
  });

  it('drops a change once it was re-anchored, or once its row was withdrawn', () => {
    const moved = { ...dora, payload: { ...dora.payload, cambios: [{ t: 33, texto: 'Muy bien dicho' }, dora.payload.cambios[1]] } };
    const eliMoved = { ...eli, payload: { ...eli.payload, cambios: [{ t: 93, antes: 'croeso i bob', texto: 'croeso i bawb' }, eli.payload.cambios[1],
      { t: 90, antes: 'Bienvenidos a todos, croeso i bawb', idioma: 'cy' as const }] } };
    expect(sinAnclarList(file(), [ana, eliMoved, moved]).items).toEqual([]);
    expect(sinAnclarList(file(), [ana, eli]).items.map((x) => x.row)).toEqual(['r5']);
  });
});

describe('reanchoredCambios', () => {
  const pick = { t: 61, text: '¡Muy bien!' };

  it("replaces the change's time and antes with the picked line's, every other change as it was", () => {
    expect(reanchoredCambios(dora.payload.cambios, { index: 0, motivo: 'sin_linea' }, pick)).toEqual([
      { t: 61, antes: '¡Muy bien!', texto: 'Muy bien dicho' },
      dora.payload.cambios[1],
    ]);
    expect(reanchoredCambios(bruno.payload.cambios, { index: 0, motivo: 'sin_linea' }, { t: 30, text: '¡Bravo!' }))
      .toEqual([{ t: 30, antes: '¡Bravo!', quitar: true }]);
  });

  it('adds the words as a new line at its time, only for a change that has words and was looking for a line', () => {
    expect(reanchoredCambios(dora.payload.cambios, { index: 0, motivo: 'sin_linea' }, 'nueva')).toEqual([
      { t: 33, texto: 'Muy bien dicho' },
      dora.payload.cambios[1],
    ]);
    expect(canAddNew(dora.payload.cambios[0], 'sin_linea')).toBe(true);
    for (const c of [{ t: 3, antes: 'a', quitar: true }, { t: 3, texto: 'ya es un agregado' }, { t: 3, antes: 'a', idioma: 'cy' as const }]) {
      expect(canAddNew(c, 'sin_linea')).toBe(false);
      expect(reanchoredCambios([c], { index: 0, motivo: 'sin_linea' }, 'nueva')).toBeNull();
    }
  });

  it('a language that fell inside a joined line: the words it wrote stay, only the language goes to the picked line', () => {
    const joined = { t: 90, text: 'Bienvenidos a todos, croeso i bawb' };
    expect(reanchoredCambios(eli.payload.cambios, { index: 0, motivo: 'idioma_en_linea_unida' }, joined)).toEqual([
      { t: 93, antes: 'croeso i bob', texto: 'croeso i bawb' },
      eli.payload.cambios[1],
      { t: 90, antes: 'Bienvenidos a todos, croeso i bawb', idioma: 'cy' },
    ]);
    // A language-only change has nothing applied to keep.
    expect(reanchoredCambios([{ t: 93, antes: 'croeso', idioma: 'cy' }], { index: 0, motivo: 'idioma_en_linea_unida' }, joined))
      .toEqual([{ t: 90, antes: 'Bienvenidos a todos, croeso i bawb', idioma: 'cy' }]);
    expect(canAddNew(eli.payload.cambios[0], 'idioma_en_linea_unida')).toBe(false);
    expect(reanchoredCambios(eli.payload.cambios, { index: 0, motivo: 'idioma_en_linea_unida' }, 'nueva')).toBeNull();
  });
});

describe('withdrawnInFile', () => {
  it('says when the file holds a row that is no longer approved (the player then shows the file as it is)', () => {
    expect(withdrawnInFile(file(), [ana, eli, dora])).toBe(false);
    expect(withdrawnInFile(file(), [eli, dora])).toBe(true);
    expect(withdrawnInFile(asTranscript({ src: 'youtube', lang: 'es', seg: [[1, 'a']] })!, [])).toBe(false);
  });
});

describe('a language that fell inside a joined line, live (row not in the file yet)', () => {
  it('re-anchored on the joined line, the words stay and the line takes the language', () => {
    const machine = asTranscript({ src: 'reconstruida', lang: 'es', seg: [[90, 'Bienvenidos a todos, croeso i bob'], [99, 'Gracias']],
      fuentes: [['whisper_es', 'cy'], ['whisper_es']] })!;
    const gwen = row('r6', 'V', '17:00', 'Gwen', [{ t: 93, antes: 'croeso i bob', texto: 'croeso i bawb', idioma: 'cy' }]);
    const before = sinAnclarList(machine, [gwen]);
    expect(before.items.map((x) => [x.row, x.motivo, x.baked])).toEqual([['r6', 'idioma_en_linea_unida', false]]);
    const [line] = reanchorOptions(before.live, 93);
    expect(line).toEqual({ i: 0, t: 90, text: 'Bienvenidos a todos, croeso i bawb' });
    const cambios = reanchoredCambios(gwen.payload.cambios!, before.items[0], line)!;
    const after = sinAnclarList(machine, [{ ...gwen, payload: { ...gwen.payload, cambios } }]);
    expect(after.items).toEqual([]);
    expect(after.live.seg[0]).toEqual([90, 'Bienvenidos a todos, croeso i bawb']);
    expect(after.live.idiomas?.[0]).toBe('cy');
  });
});

describe('reanchor (Re-anclar → setVideoTextChanges)', () => {
  it('sends the row with that change on the picked line and the rest unchanged', async () => {
    const { client, calls } = rpcClient();
    const item = sinAnclarList(file(), [ana, eli, dora]).items.find((x) => x.row === 'r9')!;
    const r = await reanchor(dora, item, { t: 61, text: '¡Muy bien!' }, client);
    const cambios = [{ t: 61, antes: '¡Muy bien!', texto: 'Muy bien dicho' }, dora.payload.cambios[1]];
    expect(r).toEqual({ ok: true, cambios });
    expect(calls).toEqual([['admin_set_video_text_changes', { cid: 'r9', cambios }]]);
  });

  it('a re-anchored change of a row not in the file yet applies at once', async () => {
    const { client } = rpcClient();
    const item = sinAnclarList(file(), [ana, eli, carla]).items.find((x) => x.row === 'r3')!;
    const r = await reanchor(carla, item, { t: 33, text: 'Muy bien' }, client);
    expect(r.ok).toBe(true);
    const now = { ...carla, payload: { ...carla.payload, cambios: (r as { cambios: Cambio[] }).cambios } };
    const after = sinAnclarList(file(), [ana, eli, now]);
    expect(after.items.map((x) => x.row)).toEqual(['r5']);
    expect(after.live.seg[1]).toEqual([33, 'Aplausos fuertes']);
  });

  it('sends nothing for a choice that does not fit the change', async () => {
    const { client, calls } = rpcClient();
    expect(await reanchor(bruno, { index: 0, motivo: 'sin_linea' }, 'nueva', client)).toEqual({ ok: false, key: 'admin.error.valor' });
    expect(calls).toEqual([]);
  });
});
