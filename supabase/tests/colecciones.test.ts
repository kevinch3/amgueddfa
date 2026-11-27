// Migration 20261127000001_colecciones.sql: one vocabulary (docs/superpowers/specs/2026-11-27-reglas-de-datos-design.md).
import { describe, expect, it } from 'vitest';
import colecciones from '../../src/data/colecciones.json';
import { makeDb } from './harness';

const MIGRATION = '20261127000001_colecciones.sql';

describe('collections table and the rename', () => {
  it('rewrites stored rows: festival becomes coleccion, payload category tipo, a tag\'s and a fix\'s festival coleccion', async () => {
    const t = await makeDb({ before: MIGRATION });
    const u = await t.createUser();
    const ins = (type: string, payload: unknown) =>
      t.q('postgres', `insert into public.contributions (user_id, type, festival, year, item_id, payload, status)
                       values ($1, $2, 'chubut', 1990, 'aaaaaaaaaaaa', $3, 'approved')`, [u, type, JSON.stringify(payload)]);
    await ins('upload', { storage_path: `${u}/a.jpg`, category: 'programa', description: 'x' });
    await ins('tag', { year: 1991, category: 'bases', festival: 'mimosa' });
    await ins('report', { objetivo: 'documento', problema: 'otra_edicion', arreglo: { year: 1992, category: 'otros', festival: 'trevelin' } });
    await ins('memory', { text: 'Me acuerdo' });
    await t.migrateRest();
    const rows = await t.q<{ type: string; coleccion: string; payload: Record<string, any> }>(
      'postgres', 'select type, coleccion, payload from public.contributions order by type');
    expect(rows.map((r) => r.coleccion)).toEqual(['chubut', 'chubut', 'chubut', 'chubut']);
    const by = Object.fromEntries(rows.map((r) => [r.type, r.payload]));
    expect(by.upload).toEqual({ storage_path: `${u}/a.jpg`, tipo: 'programa', description: 'x' });
    expect(by.tag).toEqual({ year: 1991, tipo: 'bases', coleccion: 'mimosa' });
    expect(by.report.arreglo).toEqual({ year: 1992, tipo: 'otros', coleccion: 'trevelin' });
    expect(by.memory).toEqual({ text: 'Me acuerdo' });
  });

  it('holds the same collections as src/data/colecciones.json, readable by anyone', async () => {
    const t = await makeDb();
    const rows = await t.q<{ id: string; grupo: string; ganadores_publicos: boolean; texto_de_videos: boolean }>(
      'anon', 'select id, grupo, ganadores_publicos, texto_de_videos from public.colecciones order by id');
    const want = colecciones.colecciones
      .map((c) => ({ id: c.id, grupo: c.grupo, ganadores_publicos: c.ganadores_publicos, texto_de_videos: c.texto_de_videos }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toEqual(want);
    await expect(t.q('anon', `insert into public.colecciones (id, grupo) values ('x', 'y')`)).rejects.toThrow();
  });

  it('a contribution names a listed collection; winners lists are public only where the collection publishes them', async () => {
    const t = await makeDb();
    const u = await t.createUser();
    await expect(t.q(u, `insert into public.contributions (user_id, type, coleccion, year, payload, status)
                         values ($1, 'memory', 'atlantida', 1990, '{"text":"x"}', 'pending')`, [u])).rejects.toThrow(/coleccion_fkey/);
    const tr = (coleccion: string, pub: boolean) =>
      t.q('postgres', `insert into public.transcriptions (id, items, kind, coleccion, text, public)
                       values ('bbbbbbbbbbbb', array['bbbbbbbbbbbb'], 'ganadores', $1, 'Ganadores', $2)`, [coleccion, pub]);
    await expect(tr('juventud', true)).rejects.toThrow(/transcriptions_private_winners/);
    await tr('juventud', false);
    await t.q('postgres', `delete from public.transcriptions`);
    await tr('chubut', true);
  });

  it('video text corrections follow the collection flag', async () => {
    const t = await makeDb();
    const ok = await t.q<{ v: boolean }>('postgres', `select public.video_text_valid('chubut', '{"video":{"id":"abcdef12"},"cambios":[{"t":1,"antes":"a","texto":"b"}]}') as v`);
    const no = await t.q<{ v: boolean }>('postgres', `select public.video_text_valid('mimosa', '{"video":{"id":"abcdef12"},"cambios":[{"t":1,"antes":"a","texto":"b"}]}') as v`);
    expect(no[0].v).toBe(false);
    expect(typeof ok[0].v).toBe('boolean');
  });
});

describe('rollback (docs/renombre-rollback.sql)', () => {
  it('puts back the old names, checks and payload keys', async () => {
    const { readFileSync } = await import('node:fs');
    const t = await makeDb();
    const u = await t.createUser();
    await t.q('postgres', `insert into public.contributions (user_id, type, coleccion, year, item_id, payload, status)
                           values ($1, 'tag', 'chubut', 1990, 'aaaaaaaaaaaa', '{"tipo":"bases","coleccion":"mimosa"}', 'approved')`, [u]);
    await t.db.exec(readFileSync(new URL('../../docs/renombre-rollback.sql', import.meta.url), 'utf8'));
    const rows = await t.q<{ festival: string; payload: Record<string, unknown> }>('postgres', 'select festival, payload from public.contributions');
    expect(rows).toEqual([{ festival: 'chubut', payload: { category: 'bases', festival: 'mimosa' } }]);
    await expect(t.q(u, `insert into public.contributions (user_id, type, festival, year, payload, status)
                         values ($1, 'memory', 'atlantida', 1990, '{"text":"x"}', 'pending')`, [u])).rejects.toThrow(/check/);
    const lb = await t.q('anon', 'select festival_points from public.leaderboard limit 1');
    expect(Array.isArray(lb)).toBe(true);
    await expect(t.q('anon', 'select 1 from public.colecciones')).rejects.toThrow();
  });
});
