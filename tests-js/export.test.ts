import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportApproved, shapeContributions, shapeEditions } from '../scripts/export_approved.mjs';

/** A minimal stand-in for the supabase-js query builder: from(t).select().order().range(). */
function mockClient(tables: Record<string, any[]>, opts: { error?: string; pageLog?: [string, number, number][] } = {}) {
  return {
    from(table: string) {
      const q: any = {
        select: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          opts.pageLog?.push([table, from, to]);
          if (opts.error) return { data: null, error: { message: opts.error } };
          return { data: (tables[table] ?? []).slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  };
}

const rows = [
  {
    id: 'c-b',
    type: 'fact',
    coleccion: 'chubut',
    year: 1990,
    item_id: null,
    payload: { text: 'Jurado: X', email: 'leak@example.com' },
    created_at: '2026-11-01T00:00:00Z',
    reviewed_at: '2026-11-02T00:00:00Z',
    display_name: 'Ana',
    user_id: 'u-1',
    email: 'ana@example.com',
  },
  {
    id: 'c-a',
    type: 'upload',
    coleccion: 'mimosa',
    year: 2001,
    item_id: null,
    payload: { tipo: 'programa', storage_path: 'u-2/x.pdf', meta: { user_id: 'u-2' } },
    created_at: '2026-11-03T00:00:00Z',
    reviewed_at: '2026-11-04T00:00:00Z',
    display_name: 'Beto',
    user_id: 'u-2',
  },
];

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out.push(k), keysDeep(x, out);
  return out;
}

describe('export_approved', () => {
  it('export output has no user_id/email keys and is sorted by id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-'));
    const client = mockClient({
      public_contributions: rows,
      editions: [
        { coleccion: 'trevelin', year: 1999, status: 'not_held', note: null, updated_at: 'x' },
        { coleccion: 'chubut', year: 2020, status: 'not_held', note: 'Pandemia', updated_at: 'y' },
        { coleccion: 'chubut', year: 1965, status: 'held', note: null, updated_at: 'z' },
      ],
    });
    await exportApproved(client, dir);
    const contribs = JSON.parse(readFileSync(join(dir, 'contributions.json'), 'utf8'));
    const editions = JSON.parse(readFileSync(join(dir, 'editions.json'), 'utf8'));

    expect(contribs.map((c: any) => c.id)).toEqual(['c-a', 'c-b']);
    const keys = keysDeep(contribs);
    for (const bad of ['user_id', 'email', 'storage_path']) expect(keys).not.toContain(bad);
    expect(contribs[1]).toEqual({
      id: 'c-b',
      type: 'fact',
      coleccion: 'chubut',
      year: 1990,
      item_id: null,
      payload: { text: 'Jurado: X' },
      created_at: '2026-11-01T00:00:00Z',
      reviewed_at: '2026-11-02T00:00:00Z',
      display_name: 'Ana',
    });

    expect(editions).toEqual([
      { coleccion: 'chubut', year: 1965, status: 'held', note: null },
      { coleccion: 'chubut', year: 2020, status: 'not_held', note: 'Pandemia' },
      { coleccion: 'trevelin', year: 1999, status: 'not_held', note: null },
    ]);
  });

  it('writes byte-identical output regardless of row and key order', () => {
    const a = JSON.stringify(shapeContributions(rows));
    const shuffled = [...rows].reverse().map((r) => Object.fromEntries(Object.entries(r).reverse()));
    expect(JSON.stringify(shapeContributions(shuffled))).toBe(a);
    expect(JSON.stringify(shapeEditions([]))).toBe('[]');
  });

  it('reads every page past the 1000-row API limit', async () => {
    const many = Array.from({ length: 2345 }, (_, i) => ({ ...rows[0], id: `c-${String(i).padStart(5, '0')}` }));
    const pageLog: [string, number, number][] = [];
    const dir = mkdtempSync(join(tmpdir(), 'export-'));
    await exportApproved(mockClient({ public_contributions: many, editions: [] }, { pageLog }), dir);
    expect(JSON.parse(readFileSync(join(dir, 'contributions.json'), 'utf8'))).toHaveLength(2345);
    expect(pageLog.filter(([t]) => t === 'public_contributions').length).toBe(3);
  });

  it('fails loudly on a query error instead of writing an empty export', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-'));
    await expect(exportApproved(mockClient({}, { error: 'paused' }), dir)).rejects.toThrow(/paused/);
    expect(() => readFileSync(join(dir, 'contributions.json'))).toThrow();
  });
});

describe('transcriptions snapshot', () => {
  it('seed → export reproduces every committed file byte for byte', async () => {
    const { readdirSync } = await import('node:fs');
    const { rowsFrom } = await import('../scripts/seed_transcriptions.mjs');
    const { docFile, docFolder } = await import('../scripts/export_approved.mjs');
    const { readDoc } = await import('../src/lib/docmd');
    for (const [folder, kind, coleccion] of [['transcripciones', 'programa', 'chubut'], ['ganadores', 'ganadores', 'chubut']] as const) {
      const dir = join('src', 'data', folder);
      const rows = rowsFrom(dir, kind, true, () => coleccion);
      expect(rows.length).toBe(readdirSync(dir).filter((f: string) => f.endsWith('.md')).length);
      for (const r of rows) {
        const raw = readFileSync(join(dir, `${r.id}.md`), 'utf8');
        expect(docFile(r)).toBe(raw);
        expect(docFolder(r)).toBe(folder);
        expect(readDoc(r.id, raw)).toEqual({ id: r.id, items: r.items, text: r.text });
      }
    }
  });

  it('never publishes private documents or Mimosa and Juventud winners', async () => {
    const { docFolder } = await import('../scripts/export_approved.mjs');
    const r = { id: 'aaaaaaaaaaaa', items: ['aaaaaaaaaaaa'], text: 'x' };
    expect(docFolder({ ...r, kind: 'programa', public: false })).toBeNull();
    expect(docFolder({ ...r, kind: 'ganadores', coleccion: 'juventud', public: true })).toBeNull();
    expect(docFolder({ ...r, kind: 'ganadores', coleccion: 'mimosa', public: true })).toBeNull();
    expect(docFolder({ ...r, kind: 'ganadores', coleccion: 'trevelin', public: true })).toBe('ganadores');
    expect(docFolder({ ...r, id: '../x', kind: 'programa', public: true })).toBeNull();
  });

  it('writes public documents, removes withdrawn ones, and leaves the snapshot alone on an empty read', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
    const { exportTranscriptions } = await import('../scripts/export_approved.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'tr-'));
    mkdirSync(join(dir, 'transcripciones'));
    writeFileSync(join(dir, 'transcripciones', 'bbbbbbbbbbbb.md'), 'old');
    expect(await exportTranscriptions(mockClient({ transcriptions: [] }), dir)).toBeNull();
    expect(existsSync(join(dir, 'transcripciones', 'bbbbbbbbbbbb.md'))).toBe(true);
    const n = await exportTranscriptions(mockClient({ transcriptions: [
      { id: 'aaaaaaaaaaaa', items: ['aaaaaaaaaaaa', 'cccccccccccc'], kind: 'programa', coleccion: 'chubut', text: '## A\n', public: true },
      { id: 'dddddddddddd', items: ['dddddddddddd'], kind: 'ganadores', coleccion: 'juventud', text: 'kids', public: false },
    ] }), dir);
    expect(n).toMatchObject({ written: 1, removed: 1, transcripciones: 1, ganadores: 0 });
    expect(readFileSync(join(dir, 'transcripciones', 'aaaaaaaaaaaa.md'), 'utf8')).toBe('---\nitems: aaaaaaaaaaaa cccccccccccc\n---\n## A\n');
    expect(existsSync(join(dir, 'ganadores', 'dddddddddddd.md'))).toBe(false);
  });
});
