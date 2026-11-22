import { describe, expect, it } from 'vitest';
import { loadApprovedVideoText, reanchor, setVideoTextChanges, withdrawContribution } from '../src/lib/admin';
import {
  avisoTexto, canAddNew, cardNotes, groupByVideo, reanchorOptions, reanchorPreview, reanchoredCambios, retirarTodaLabel,
  sinAnclarList, withdrawnInFile, type ApprovedVideoText,
} from '../src/lib/admin-videos';
import { withLiveCorrections } from '../src/lib/live-video-corrections';
import { applyCorrections, type Cambio, type CorrectionRow } from '../src/lib/video-corrections';
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

describe('rows approved at the same instant', () => {
  it('the Videos tab applies them in the order the player and the export do (by id), whatever order it lists them in', () => {
    const machine = asTranscript({ src: 'reconstruida', lang: 'es', seg: [[20, 'Ma gwybod yn iawn'], [50, 'Hoy cantan los coros']],
      fuentes: [['cy'], ['whisper_es']] })!;
    const lo = row('aaaaaaaa-0000-4000-8000-000000000000', 'V', '20:00', 'Ana', [{ t: 20, antes: 'Ma gwybod yn iawn', texto: 'Mae gwybod yn iawn' }]);
    const hi = row('ffffffff-0000-4000-8000-000000000000', 'V', '20:00', 'Bruno', [{ t: 20, antes: 'Ma gwybod yn iawn', texto: 'Mam gwybod yn iawn' }]);
    // The player gets them oldest first, the tie by id ascending (approvedCorrections); the tab newest first (groupByVideo).
    const player = withLiveCorrections(machine, [lo, hi] as CorrectionRow[]).tr;
    const tab = sinAnclarList(machine, groupByVideo([lo, hi])[0].rows);
    expect(player.seg[0]).toEqual([20, 'Mae gwybod yn iawn']);
    expect(tab.live.seg[0]).toEqual(player.seg[0]);
    expect(tab.items.map((x) => x.row)).toEqual([hi.id]);
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

describe('Re-anclar onto a line a rebuild joined', () => {
  const machine = (seg: [number, string][]) => ({ seg, fuentes: seg.map(() => ['whisper_es']), lang: 'es' });
  const export_ = (seg: [number, string][], cambios: Cambio[]) =>
    applyCorrections(machine(seg), [{ id: 'r', reviewed_at: at('10:00'), payload: { video: { id: 'V' }, cambios } }]).tr.seg;

  it('the Cañaveral case: removing a fragment keeps the rest of the joined line (the next export keeps «Cañaveral»)', () => {
    // A rebuild joined «Cañaveral» and «que risna Azul» (and «cañavera» and «Oh») into one line each.
    const r3: Cambio[] = [
      { t: 68.6, antes: 'flor yo no sé por qué hoy me lere', texto: 'flor, yo no sé por qué hoy me hiere' },
      { t: 150.3, antes: 'que risna Azul', quitar: true },
      { t: 302.5, antes: 'Oh', quitar: true },
    ];
    let next = reanchoredCambios(r3, { index: 1, motivo: 'sin_linea' }, { t: 148.8, text: 'Cañaveral que risna Azul' })!;
    expect(next[1]).toEqual({ t: 148.8, antes: 'Cañaveral que risna Azul', texto: 'Cañaveral' });
    next = reanchoredCambios(next, { index: 2, motivo: 'sin_linea' }, { t: 298.6, text: 'cañavera Oh' })!;
    expect(next).toEqual([r3[0], { t: 148.8, antes: 'Cañaveral que risna Azul', texto: 'Cañaveral' }, { t: 298.6, antes: 'cañavera Oh', texto: 'cañavera' }]);
    expect(export_([[148.8, 'Cañaveral que risna Azul'], [155.1, 'murmuro al cañ'], [298.6, 'cañavera Oh']], next))
      .toEqual([[148.8, 'Cañaveral'], [155.1, 'murmuro al cañ'], [298.6, 'cañavera']]);
  });

  it('a rewrite of a fragment rewrites only its words in the joined line, with their own marks', () => {
    const joined = { t: 10, text: 'Llegaron los coloros galices en 1865 al valle' };
    expect(reanchoredCambios([{ t: 12.4, antes: 'coloros galices', texto: 'colonos galeses' }], { index: 0, motivo: 'sin_linea' }, joined))
      .toEqual([{ t: 10, antes: 'Llegaron los coloros galices en 1865 al valle', texto: 'Llegaron los colonos galeses en 1865 al valle' }]);
    // Folded like the rule: accents and case do not matter; the fragment's ¡…! go with it.
    expect(reanchoredCambios([{ t: 3, antes: '¡bravo!', texto: '¡Bravísimo!' }], { index: 0, motivo: 'sin_linea' }, { t: 2, text: 'Muy bien, ¡Bravo! Gracias' }))
      .toEqual([{ t: 2, antes: 'Muy bien, ¡Bravo! Gracias', texto: 'Muy bien, ¡Bravísimo! Gracias' }]);
    // A removal takes the marks glued to its words and the space after; at the end, the space before.
    expect(reanchoredCambios([{ t: 12.4, antes: 'Eh', quitar: true }], { index: 0, motivo: 'sin_linea' }, { t: 10, text: 'Llegaron los Eh, en 1865' }))
      .toEqual([{ t: 10, antes: 'Llegaron los Eh, en 1865', texto: 'Llegaron los en 1865' }]);
  });

  it('a language change on a joined line sets that line\'s language; a rewrite with a language too', () => {
    const joined = { t: 90, text: 'Bienvenidos a todos, croeso i bawb' };
    expect(reanchoredCambios([{ t: 93, antes: 'croeso i bawb', idioma: 'cy' }], { index: 0, motivo: 'sin_linea' }, joined))
      .toEqual([{ t: 90, antes: 'Bienvenidos a todos, croeso i bawb', idioma: 'cy' }]);
    expect(reanchoredCambios([{ t: 93, antes: 'croeso i bob', texto: 'croeso i bawb', idioma: 'cy' }], { index: 0, motivo: 'sin_linea' },
      { t: 90, text: 'Bienvenidos a todos, croeso i bob' }))
      .toEqual([{ t: 90, antes: 'Bienvenidos a todos, croeso i bob', texto: 'Bienvenidos a todos, croeso i bawb', idioma: 'cy' }]);
  });

  it('a line without the change\'s words, or the same words, takes the change whole', () => {
    expect(reanchoredCambios([{ t: 5, antes: 'coloros galices', texto: 'colonos galeses' }], { index: 0, motivo: 'sin_linea' }, { t: 6, text: 'otra cosa' }))
      .toEqual([{ t: 6, antes: 'otra cosa', texto: 'colonos galeses' }]);
    expect(reanchoredCambios([{ t: 5, antes: 'Que risna, azul', quitar: true }], { index: 0, motivo: 'sin_linea' }, { t: 6, text: '¡Que risna azul!' }))
      .toEqual([{ t: 6, antes: '¡Que risna azul!', quitar: true }]);
    // Words that are not whole words of the line are no run of it.
    expect(reanchoredCambios([{ t: 5, antes: 'cañ', quitar: true }], { index: 0, motivo: 'sin_linea' }, { t: 6, text: 'Cañaveral azul' }))
      .toEqual([{ t: 6, antes: 'Cañaveral azul', quitar: true }]);
  });

  it('refuses a rewrite that would leave the line longer than a change may be (500 characters)', () => {
    const long = { t: 6, text: `${'palabra '.repeat(62)}coloros galices` };
    expect(reanchoredCambios([{ t: 5, antes: 'coloros galices', texto: 'colonos galeses' }], { index: 0, motivo: 'sin_linea' }, long)).toBeNull();
    expect(reanchorPreview([{ t: 5, antes: 'coloros galices', texto: 'colonos galeses' }], { index: 0, motivo: 'sin_linea' }, long)?.avisos)
      .toEqual(['larga']);
  });
});

describe('reanchorPreview', () => {
  const item = { index: 0, motivo: 'sin_linea' as const };
  it('shows the picked line before and after, word by word, and says nothing more when only the change\'s words change', () => {
    const p = reanchorPreview([{ t: 150.3, antes: 'que risna Azul', quitar: true }], item, { t: 148.8, text: 'Cañaveral que risna Azul' })!;
    expect(p).toEqual({
      antes: 'Cañaveral que risna Azul', despues: 'Cañaveral',
      diff: [{ op: 'same', text: 'Cañaveral' }, { op: 'del', text: 'que risna Azul' }], avisos: [],
    });
  });

  it('warns in words when the whole line is replaced, removed, or changes language', () => {
    expect(reanchorPreview([{ t: 5, antes: 'coloros galices', texto: 'colonos galeses' }], item, { t: 6, text: 'otra cosa' })!)
      .toMatchObject({ antes: 'otra cosa', despues: 'colonos galeses', avisos: ['reemplaza'] });
    expect(reanchorPreview([{ t: 5, antes: 'x y z', quitar: true }], item, { t: 6, text: 'otra cosa' })!)
      .toMatchObject({ antes: 'otra cosa', despues: '', avisos: ['quita'] });
    expect(reanchorPreview([{ t: 93, antes: 'croeso i bawb', idioma: 'cy' }], item, { t: 90, text: 'Bienvenidos, croeso i bawb' })!)
      .toMatchObject({ antes: 'Bienvenidos, croeso i bawb', despues: 'Bienvenidos, croeso i bawb', avisos: ['idioma'], idioma: 'cy' });
    expect(reanchorPreview(eli.payload.cambios, { index: 0, motivo: 'idioma_en_linea_unida' }, { t: 90, text: 'Bienvenidos a todos, croeso i bawb' })!)
      .toMatchObject({ despues: 'Bienvenidos a todos, croeso i bawb', avisos: ['idioma'], idioma: 'cy' });
    expect(reanchorPreview(dora.payload.cambios, item, 'nueva')!).toMatchObject({ antes: '', despues: 'Muy bien dicho', avisos: [] });
    expect(reanchorPreview(dora.payload.cambios, item, { t: 61, text: '¡Muy bien!' })!.avisos).toEqual(['reemplaza']);
  });

  it('is null when the choice does not fit the change', () => {
    expect(reanchorPreview([{ t: 3, antes: 'a', quitar: true }], item, 'nueva')).toBeNull();
  });

  it('says each warning in words, the language by name', () => {
    expect(avisoTexto('reemplaza')).toBe('Se reemplaza la línea entera.');
    expect(avisoTexto('quita')).toBe('Se quita la línea entera.');
    expect(avisoTexto('idioma', 'cy')).toBe('Toda la línea pasa a galés.');
    expect(avisoTexto('idioma', 'es')).toBe('Toda la línea pasa a español.');
    expect(avisoTexto('larga')).toBe('La línea quedaría con más de 500 caracteres: elegí otra.');
  });
});

describe('withdrawnInFile', () => {
  it('says when the file holds a row that is no longer approved (the player then shows the file as it is)', () => {
    expect(withdrawnInFile(file(), [ana, eli, dora])).toBe(false);
    expect(withdrawnInFile(file(), [eli, dora])).toBe(true);
    expect(withdrawnInFile(asTranscript({ src: 'youtube', lang: 'es', seg: [[1, 'a']] })!, [])).toBe(false);
  });
});

describe('the Videos tab with unreadable changes', () => {
  it('lists and re-anchors only readable changes, and never throws', () => {
    const odd = row('r7', 'V', '17:00', 'Odd', [null, { t: 45, antes: 5, texto: 'x' }, { t: 46, texto: { a: 1 } }] as unknown as Cambio[]);
    const { items } = sinAnclarList(file(), [ana, eli, dora, odd]);
    expect(items.map((x) => x.row)).not.toContain('r7');
    expect(reanchoredCambios(odd.payload.cambios, { index: 1, motivo: 'sin_linea' }, { t: 33, text: 'Muy bien' })).toBeNull();
    expect(retirarTodaLabel(odd)).toBe('Retirar toda la contribución (3 cambios)');
  });
});

describe('retirarTodaLabel', () => {
  it('Retirar beside one unplaced change says it withdraws the whole contribution, and how many changes it has', () => {
    expect(retirarTodaLabel(dora)).toBe('Retirar toda la contribución (2 cambios)');
    expect(retirarTodaLabel(bruno)).toBe('Retirar la contribución (1 cambio)');
  });
});

describe('cardNotes', () => {
  it('nothing before the file is read while corrections are left; then the pause note while the file holds a withdrawn one', () => {
    expect(cardNotes(undefined, [ana, eli, dora])).toEqual([]);
    expect(cardNotes(file(), [ana, eli, dora])).toEqual([]);
    expect(cardNotes(file(), [eli, dora])).toEqual(['pausa_exportar']);
    expect(cardNotes(null, [ana])).toEqual(['sin_archivo']);
  });

  it('a card whose last correction was withdrawn is never empty: it says so, and that the file still holds it until the export', () => {
    expect(cardNotes(undefined, [])).toEqual(['sin_filas']);
    expect(cardNotes(file(), [])).toEqual(['sin_filas', 'pausa_exportar']);
    expect(cardNotes(asTranscript({ src: 'youtube', lang: 'es', seg: [[1, 'a']] })!, [])).toEqual(['sin_filas']);
    expect(cardNotes(null, [])).toEqual(['sin_filas', 'sin_archivo']);
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
