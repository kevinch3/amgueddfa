import { describe, expect, it } from 'vitest';
import { taskQueue } from '../src/lib/tasks';
import { latestApproved, pendingPoints, rankBy, statusOf, type LeaderRow } from '../src/lib/game';
import type { Item } from '../src/lib/types';

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, festival: 'chubut', year: 1990, undated: false, category: 'programa', title: id, kind: 'image',
    src_path: `x/${id}.jpg`, alt_paths: [], source_url: null, source_label: 'x', retrieved: '2026-11-13',
    note_public: '', year_inferred: true, restricted: false, pages: 1, thumb: `${id}/thumb.webp`,
    page_paths: [`${id}/p01.webp`], text_excerpt: null, table: null, ...over,
  };
}

const ids = (list: Item[]) => list.map((i) => i.id);
const many = Array.from({ length: 30 }, (_, n) => item(`a${String(n).padStart(11, '0')}`));

describe('taskQueue', () => {
  it('queue excludes restricted and done', () => {
    const list = [item('aaa'), item('bbb', { restricted: true }), item('ccc'), item('ddd')];
    const q = taskQueue(list, new Set(['ccc']), 'user-1');
    expect(ids(q).sort()).toEqual(['aaa', 'ddd']);
  });

  it('same seed same order, different seed different order', () => {
    const a = taskQueue(many, new Set(), 'user-1');
    const b = taskQueue([...many].reverse(), new Set(), 'user-1');
    const c = taskQueue(many, new Set(), 'user-2');
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(c));
    expect(ids(a).sort()).toEqual(ids(c).sort());
    expect(ids(a)).not.toEqual(ids(many)); // actually shuffled
  });

  it('only year_inferred images', () => {
    const list = [
      item('img'),
      item('known', { year_inferred: false }),
      item('pdf', { kind: 'pdf' }),
      item('doc', { kind: 'doc' }),
    ];
    expect(ids(taskQueue(list, new Set(), 's'))).toEqual(['img']);
  });

  it('does not mutate its input', () => {
    const copy = ids(many);
    taskQueue(many, new Set(), 'user-1');
    expect(ids(many)).toEqual(copy);
  });
});

describe('game helpers', () => {
  const rows: LeaderRow[] = [
    { display_name: 'Ana', points: 120, festival_points: { chubut: 100, trevelin: 20 } },
    { display_name: 'Beto', points: 90, festival_points: { trevelin: 90 } },
    { display_name: 'Ceci', points: 90, festival_points: { chubut: 5 } },
  ];

  it('rankBy overall shares ranks on ties', () => {
    expect(rankBy(rows, null).map((r) => [r.rank, r.display_name, r.points])).toEqual([
      [1, 'Ana', 120], [2, 'Beto', 90], [2, 'Ceci', 90],
    ]);
  });

  it('rankBy festival uses festival points and drops zero', () => {
    expect(rankBy(rows, 'trevelin').map((r) => [r.rank, r.display_name, r.points])).toEqual([
      [1, 'Beto', 90], [2, 'Ana', 20],
    ]);
    expect(rankBy(rows, 'mimosa')).toEqual([]);
  });

  it('pendingPoints counts only pending rows at base rates', () => {
    expect(pendingPoints([
      { type: 'upload', status: 'pending' },
      { type: 'fact', status: 'pending' },
      { type: 'transcription', status: 'pending' },
      { type: 'tag', status: 'pending' },
      { type: 'memory', status: 'pending' },
      { type: 'fact', status: 'approved' },
      { type: 'fact', status: 'rejected' },
    ])).toBe(20 + 10 + 15 + 2 + 5);
  });

  it('statusOf maps to pill keys', () => {
    expect(statusOf('pending')).toBe('perfil.estados.pending');
    expect(statusOf('approved')).toBe('perfil.estados.approved');
    expect(statusOf('rejected')).toBe('perfil.estados.rejected');
  });
});

describe('latestApproved', () => {
  const row = (id: string, reviewed: string | null, created = '2026-01-01T00:00:00Z') => ({
    id, type: 'fact' as const, festival: 'chubut' as const, year: 1990, item_id: null, payload: {},
    created_at: created, reviewed_at: reviewed, display_name: 'Ana',
  });

  it('merges static and live, newest approval first, capped', () => {
    const stat = [row('s1', '2026-01-02T00:00:00Z'), row('dup', '2026-01-03T00:00:00Z')];
    const live = [row('dup', '2026-01-05T00:00:00Z'), row('l1', null, '2026-01-04T00:00:00Z'), row('l2', '2026-01-06T00:00:00Z')];
    expect(latestApproved(stat, live, 3).map((c) => c.id)).toEqual(['l2', 'dup', 'l1']);
  });
});
