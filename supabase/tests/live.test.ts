// Issue #27: admin corrections of catalog items and the transcriptions table.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type TestDb } from './harness';

let t: TestDb;
beforeEach(async () => {
  t = await makeDb();
});

const ITEM = 'e49c26c600a8';
const correct = (who: string, payload: unknown, item = ITEM) =>
  t.q<{ id: string }>(who, 'select public.admin_correct_item($1, $2, $3, $4) as id', [item, 'chubut', 2022, JSON.stringify(payload)]);
const save = (who: string, id: string, items: string[], kind: string, coleccion: string | null, text: string, pub = true) =>
  t.q<{ at: string }>(who, 'select public.admin_save_transcription($1, $2, $3, $4, $5, $6) as at', [id, items, kind, coleccion, text, pub]);
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  return 'ok';
};

describe('admin_correct_item', () => {
  it('stores an approved, pointless tag that the public view shows at once', async () => {
    const admin = await t.createAdmin();
    await correct(admin, { title: 'Horarios 2022', tipo: 'programa-del-dia', no_text: true, caption: '' });
    const pub = await t.q<{ type: string; item_id: string; payload: Record<string, unknown>; reviewed_at: string | null }>(
      'anon', `select type, item_id, payload, reviewed_at from public.public_contributions`);
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ type: 'tag', item_id: ITEM, payload: { title: 'Horarios 2022', tipo: 'programa-del-dia', no_text: true, caption: '' } });
    expect(pub[0].reviewed_at).not.toBeNull();
    const [p] = await t.q<{ points: number }>('postgres', 'select points from public.profiles where id = $1', [admin]);
    expect(p.points).toBe(0);
  });

  it('refuses non-admins, unknown keys and bad values', async () => {
    const admin = await t.createAdmin();
    const user = await t.createUser();
    expect(await err(correct(user, { title: 'x' }))).toMatch(/not_admin/);
    expect(await err(correct(admin, { colour: 'red' }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, {}))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { tipo: 'poster' }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { year: 1700 }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { year: 1990.5 }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { no_text: 'yes' }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { title: '   ' }))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { title: 'x' }, '../etc'))).toMatch(/invalid_value/);
    expect(await err(correct(admin, { year: 1990, hidden: false, rights: '© X' }))).toBe('ok');
  });
});

describe('transcriptions', () => {
  it('admins save and edit; history keeps every version and who made it', async () => {
    const admin = await t.createAdmin();
    await save(admin, 'aaaaaaaaaaaa', ['bbbbbbbbbbbb', 'aaaaaaaaaaaa', 'bbbbbbbbbbbb'], 'programa', 'chubut', '## Lunes\n1. Coro');
    await save(admin, 'aaaaaaaaaaaa', ['bbbbbbbbbbbb'], 'programa', 'chubut', '## Lunes\n1. Côr');
    const [row] = await t.q<{ items: string[]; text: string; updated_by: string }>('postgres', 'select items, text, updated_by from public.transcriptions');
    expect(row).toEqual({ items: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'], text: '## Lunes\n1. Côr', updated_by: admin });
    const hist = await t.q<{ op: string; text: string; changed_by: string }>(admin, 'select op, text, changed_by from public.transcription_history order by id');
    expect(hist.map((h) => h.op)).toEqual(['insert', 'update']);
    expect(hist[0]).toMatchObject({ text: '## Lunes\n1. Coro', changed_by: admin });
    await t.q(admin, 'select public.admin_delete_transcription($1)', ['aaaaaaaaaaaa']);
    const after = await t.q<{ op: string }>(admin, 'select op from public.transcription_history order by id');
    expect(after.map((h) => h.op)).toEqual(['insert', 'update', 'delete']);
  });

  it('an item belongs to one document of a kind', async () => {
    const admin = await t.createAdmin();
    await save(admin, 'aaaaaaaaaaaa', ['bbbbbbbbbbbb'], 'programa', 'chubut', 'x');
    expect(await err(save(admin, 'cccccccccccc', ['bbbbbbbbbbbb'], 'programa', 'chubut', 'y'))).toMatch(/item_in_other_document/);
    expect(await err(save(admin, 'cccccccccccc', ['bbbbbbbbbbbb'], 'ganadores', 'chubut', 'y'))).toBe('ok');
  });

  it('anon reads public documents only, without editors; the table and history are admin-only', async () => {
    const admin = await t.createAdmin();
    const user = await t.createUser();
    await save(admin, 'aaaaaaaaaaaa', [], 'programa', 'chubut', 'public');
    await save(admin, 'cccccccccccc', [], 'ganadores', 'juventud', 'children', false);
    const pub = await t.q<Record<string, unknown>>('anon', 'select * from public.public_transcriptions');
    expect(pub.map((r) => r.id)).toEqual(['aaaaaaaaaaaa']);
    expect(Object.keys(pub[0])).not.toContain('updated_by');
    expect(await t.q('anon', 'select 1 from public.public_transcriptions where id = $1', ['cccccccccccc'])).toHaveLength(0);
    expect(await err(t.q('anon', 'select * from public.transcriptions'))).toMatch(/permission denied/);
    expect(await t.q(user, 'select * from public.transcriptions')).toHaveLength(0);
    expect(await t.q(user, 'select * from public.transcription_history')).toHaveLength(0);
    expect(await err(t.q(user, `insert into public.transcriptions (id, items, kind, text) values ('dddddddddddd', '{dddddddddddd}', 'programa', 'x')`))).toMatch(/permission denied/);
    expect(await err(save(user, 'dddddddddddd', [], 'programa', 'chubut', 'x'))).toMatch(/not_admin/);
    expect(await t.q(admin, 'select * from public.transcriptions')).toHaveLength(2);
  });

  it('Mimosa and Juventud winners can never be public', async () => {
    const admin = await t.createAdmin();
    expect(await err(save(admin, 'aaaaaaaaaaaa', [], 'ganadores', 'mimosa', 'x', true))).toMatch(/transcriptions_private_winners/);
    expect(await err(save(admin, 'aaaaaaaaaaaa', [], 'ganadores', null, 'x', true))).toMatch(/transcriptions_private_winners/);
    expect(await err(save(admin, 'aaaaaaaaaaaa', [], 'ganadores', 'trevelin', 'x', true))).toBe('ok');
  });
});
