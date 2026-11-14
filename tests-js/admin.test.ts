import { describe, expect, it } from 'vitest';
import {
  adminAddFacts,
  approve,
  approveAll,
  approveUpload,
  editionKeys,
  fillsGap,
  gapChoice,
  gapOverride,
  groupQueue,
  recordApprovedUpload,
  reject,
  rejectAll,
  releaseItem,
  restrictedPreview,
  reviewFlags,
  searchUsers,
  type Pending,
} from '../src/lib/admin';

const catalog = editionKeys([
  { festival: 'chubut', year: 1990, category: 'programa' },
  { festival: 'chubut', year: 1991, category: 'resultados' },
  { festival: 'chubut', year: null, category: 'programa' },
]);

function fakeClient(opts: { rpcError?: unknown; uploadError?: unknown; downloadError?: unknown; status?: string } = {}) {
  const log: string[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const uploads: { bucket: string; path: string; body: unknown; o: any }[] = [];
  const rpcs: { fn: string; args: any }[] = [];
  const client: any = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          log.push(`sign:${bucket}/${path}`);
          return { data: { signedUrl: `https://x.test/${bucket}/${path}?ttl=${ttl}` }, error: null };
        },
        download: async (path: string) => {
          log.push(`download:${bucket}/${path}`);
          if (opts.downloadError) return { data: null, error: opts.downloadError };
          return { data: new Blob([path], { type: 'image/webp' }), error: null };
        },
        upload: async (path: string, body: unknown, o: unknown) => {
          log.push(`upload:${bucket}/${path}`);
          uploads.push({ bucket, path, body, o });
          return opts.uploadError ? { data: null, error: opts.uploadError } : { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          log.push(`remove:${bucket}`);
          removed.push({ bucket, paths });
          return { data: [], error: null };
        },
      }),
    },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            log.push(`status:${table}/${id}`);
            return { data: { status: opts.status ?? 'pending' }, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      log.push(`rpc:${fn}`);
      rpcs.push({ fn, args });
      return { data: 20, error: opts.rpcError ?? null };
    },
  };
  return { client, log, uploads, rpcs, removed };
}

const upload: Pending = {
  id: 'c1',
  user_id: 'u1',
  type: 'upload',
  festival: 'chubut',
  year: 1992,
  item_id: null,
  payload: { category: 'programa', storage_path: 'u1/abc.pdf' },
  created_at: '2026-11-13T10:00:00Z',
};

describe('fillsGap', () => {
  it('fillsGap true for empty category, false when static has item, false when live approved upload exists', () => {
    expect(fillsGap('chubut', 1992, 'programa', { catalog, approved: [] })).toBe(true);
    expect(fillsGap('chubut', 1991, 'programa', { catalog, approved: [] })).toBe(true);
    expect(fillsGap('chubut', 1990, 'programa', { catalog, approved: [] })).toBe(false);
    const live = [{ type: 'upload', festival: 'chubut', year: 1992, payload: { category: 'programa', complete: true } }];
    expect(fillsGap('chubut', 1992, 'programa', { catalog, approved: live })).toBe(false);
    expect(fillsGap('chubut', 1992, 'bases', { catalog, approved: live })).toBe(true);
    // a fact for the edition is not an upload in that category
    const fact = [{ type: 'fact', festival: 'chubut', year: 1992, payload: { category: 'programa' } }];
    expect(fillsGap('chubut', 1992, 'programa', { catalog, approved: fact })).toBe(true);
  });

  it('a programa gap stays open until a confirmed-complete programa is approved', () => {
    const tapa = [{ type: 'upload', festival: 'chubut', year: 1992, payload: { category: 'programa', tapa: true, complete: false } }];
    expect(fillsGap('chubut', 1992, 'programa', { catalog, approved: tapa })).toBe(true);
    const ctx = { catalog, approved: [] as any[] };
    const pending = (payload: any): Pending => ({ ...upload, year: 1992, payload: { storage_path: 'u1/x.jpg', category: 'programa', ...payload } });
    recordApprovedUpload(pending({ alcance: 'tapa' }), ctx, [], { complete: false, tapa: true });
    expect(fillsGap('chubut', 1992, 'programa', ctx)).toBe(true);
    recordApprovedUpload(pending({ alcance: 'completo' }), ctx, [], { complete: true, tapa: false });
    expect(fillsGap('chubut', 1992, 'programa', ctx)).toBe(false);
  });

  it('no edition (year null) never fills a gap', () => {
    expect(fillsGap('mimosa', null, 'programa', { catalog, approved: [] })).toBe(false);
  });
});

describe('reviewFlags', () => {
  const p = (payload: any): Pending => ({ ...upload, payload: { storage_path: 'u1/x.jpg', ...payload } });
  it('defaults from what the contributor said', () => {
    expect(reviewFlags(p({ category: 'programa', alcance: 'completo' }))).toEqual({ complete: true, tapa: false });
    expect(reviewFlags(p({ category: 'programa', alcance: 'tapa' }))).toEqual({ complete: false, tapa: true });
    expect(reviewFlags(p({ category: 'programa', alcance: 'parcial' }))).toEqual({ complete: false, tapa: false });
    expect(reviewFlags(p({ category: 'programa' }))).toEqual({ complete: false, tapa: false });
    expect(reviewFlags(p({ category: 'bases' }))).toBeNull();
  });
});

describe('approveUpload', () => {
  it('approveUpload calls storage then rpc with media payload', async () => {
    const { client, log, uploads, rpcs } = fakeClient();
    const fetched: string[] = [];
    const fetchFn = async (u: string) => {
      fetched.push(u);
      log.push('fetch');
      return { ok: true, blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }) } as any;
    };
    const make = async (_f: Blob, mime: string) => {
      log.push(`make:${mime}`);
      return { pages: [new Blob(['p1']), new Blob(['p2'])], thumb: new Blob(['t']) };
    };
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r).toEqual({ ok: true });
    expect(fetched[0]).toContain('uploads/u1/abc.pdf');
    expect(log).toEqual([
      'status:contributions/c1',
      'sign:uploads/u1/abc.pdf',
      'fetch',
      'make:application/pdf',
      'upload:media/uploads/c1/thumb.webp',
      'upload:media/uploads/c1/p01.webp',
      'upload:media/uploads/c1/p02.webp',
      'rpc:approve_contribution',
    ]);
    expect(uploads.every((u) => u.o.contentType === 'image/webp' && u.o.upsert === true)).toBe(true);
    expect(rpcs[0].args).toEqual({
      cid: 'c1',
      fills_gap: true,
      payload_override: { media: { thumb: 'uploads/c1/thumb.webp', pages: ['uploads/c1/p01.webp', 'uploads/c1/p02.webp'] } },
    });
  });

  it('approveUpload merges the admin flags into the payload', async () => {
    const { client, rpcs } = fakeClient();
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p1']), new Blob(['p2'])], thumb: new Blob(['t']) });
    await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] }, flags: { complete: true, tapa: false } });
    expect(rpcs[0].args.payload_override).toEqual({
      media: { thumb: 'uploads/c1/thumb.webp', pages: ['uploads/c1/p01.webp', 'uploads/c1/p02.webp'] },
      complete: true,
      tapa: false,
    });
  });

  it('an explicit gap choice wins over the computed one', async () => {
    const { client, rpcs } = fakeClient();
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] }, fillsGap: false });
    expect(rpcs[0].args.fills_gap).toBe(false);
  });

  it('a second upload for the same gap is recomputed after the first is approved', async () => {
    const { client, rpcs } = fakeClient();
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    const gap = { catalog, approved: [] as any[] };
    const second: Pending = { ...upload, id: 'c2', user_id: 'u2', payload: { category: 'programa', storage_path: 'u2/x.jpg' } };
    const other: Pending = { ...upload, id: 'c3', payload: { category: 'bases', storage_path: 'u1/b.jpg' } };
    const a = gapChoice(upload, gap);
    const b = gapChoice(second, gap);
    const o = gapChoice(other, gap);
    expect([a.checked, b.checked, o.checked]).toEqual([true, true, true]);

    const confirmed = { complete: true, tapa: false };
    await approveUpload(upload, { client, fetchFn, make, gap, fillsGap: gapOverride(a), flags: confirmed });
    recordApprovedUpload(upload, gap, [b, o], confirmed);
    expect(b.checked).toBe(false);
    expect(o.checked).toBe(true);
    await approveUpload(second, { client, fetchFn, make, gap, fillsGap: gapOverride(b) });
    expect(rpcs.map((r) => r.args.fills_gap)).toEqual([true, false]);
  });

  it('an untouched choice is no override; a touched one survives recomputation', () => {
    const gap = { catalog, approved: [] as any[] };
    const b = gapChoice(upload, gap);
    expect(gapOverride(b)).toBeUndefined();
    b.touched = true;
    recordApprovedUpload(upload, gap, [b]);
    expect(b.checked).toBe(true);
    expect(gapOverride(b)).toBe(true);
  });

  it('a failed media upload never calls the rpc', async () => {
    const { client, rpcs } = fakeClient({ uploadError: { message: 'boom' } });
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r.ok).toBe(false);
    expect(rpcs).toEqual([]);
  });

  it('a derivative failure is reported, nothing uploaded', async () => {
    const { client, uploads, rpcs } = fakeClient();
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => {
      throw new Error('webp_unsupported');
    };
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r).toEqual({ ok: false, key: 'admin.error.derivados' });
    expect(uploads).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('approving an already reviewed row maps not_pending and removes the public derivatives', async () => {
    const { client, removed } = fakeClient({ rpcError: { message: 'not_pending' } });
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r).toEqual({ ok: false, key: 'admin.error.ya_revisado' });
    expect(removed).toEqual([{ bucket: 'media', paths: ['uploads/c1/thumb.webp', 'uploads/c1/p01.webp'] }]);
  });

  it('a row another admin already reviewed is never derived or published', async () => {
    const { client, uploads, rpcs, log } = fakeClient({ status: 'rejected' });
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r).toEqual({ ok: false, key: 'admin.error.ya_revisado' });
    expect(uploads).toEqual([]);
    expect(rpcs).toEqual([]);
    expect(log).toEqual(['status:contributions/c1']);
  });

  it('a media upload failing midway removes what was already published', async () => {
    let n = 0;
    const { client, removed } = fakeClient();
    const up = client.storage.from;
    client.storage.from = (b: string) => {
      const o = up(b);
      return { ...o, upload: async (p: string, body: unknown, x: unknown) => (++n === 2 ? { data: null, error: { message: 'boom' } } : o.upload(p, body, x)) };
    };
    const fetchFn = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
    const make = async () => ({ pages: [new Blob(['p'])], thumb: new Blob(['t']) });
    const r = await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] } });
    expect(r.ok).toBe(false);
    expect(removed).toEqual([{ bucket: 'media', paths: ['uploads/c1/thumb.webp', 'uploads/c1/p01.webp'] }]);
  });
});

describe('approve / reject', () => {
  const fact: Pending = { ...upload, id: 'c2', type: 'fact', payload: { field: 'venue', value: 'Salón' } };

  it('approve sends fills_gap false and the validated override', async () => {
    const { client, rpcs } = fakeClient();
    expect(await approve(fact, { field: 'venue', value: ' Salón San David ' }, client)).toEqual({ ok: true });
    expect(rpcs[0]).toEqual({
      fn: 'approve_contribution',
      args: { cid: 'c2', fills_gap: false, payload_override: { field: 'venue', value: 'Salón San David' } },
    });
  });

  it('approve rejects an invalid edited payload without calling the rpc', async () => {
    const { client, rpcs } = fakeClient();
    const r = await approve(fact, { field: 'email', value: 'x' }, client);
    expect(r).toEqual({ ok: false, key: 'contrib.error.campo' });
    expect(rpcs).toEqual([]);
  });

  it('non-admin approve maps not_admin', async () => {
    const { client } = fakeClient({ rpcError: { message: 'not_admin' } });
    expect(await approve(fact, null, client)).toEqual({ ok: false, key: 'admin.error.no_admin' });
  });

  it('reject needs a reason', async () => {
    const { client, rpcs } = fakeClient();
    expect(await reject(fact, '   ', client)).toEqual({ ok: false, key: 'admin.error.motivo' });
    expect(rpcs).toEqual([]);
    expect(await reject(fact, ' Duplicado ', client)).toEqual({ ok: true });
    expect(rpcs[0]).toEqual({ fn: 'reject_contribution', args: { cid: 'c2', note: 'Duplicado' } });
  });

  it('rejecting an upload deletes its original; a failed reject keeps it', async () => {
    const ok = fakeClient();
    expect(await reject(upload, 'Datos personales', ok.client)).toEqual({ ok: true });
    expect(ok.removed).toEqual([{ bucket: 'uploads', paths: ['u1/abc.pdf'] }]);
    const bad = fakeClient({ rpcError: { message: 'not_pending' } });
    expect(await reject(upload, 'Datos personales', bad.client)).toEqual({ ok: false, key: 'admin.error.ya_revisado' });
    expect(bad.removed).toEqual([]);
  });
});

describe('releaseItem', () => {
  it('copies restricted/<id>/* to media/released/<id>/* then calls release_item', async () => {
    const { client, log, rpcs } = fakeClient();
    const r = await releaseItem({ id: 'abc123def456', thumb: 'abc123def456/thumb.webp', page_paths: ['abc123def456/p01.webp', 'abc123def456/p02.webp'] }, client);
    expect(r).toEqual({ ok: true });
    expect(log).toEqual([
      'download:restricted/abc123def456/thumb.webp',
      'upload:media/released/abc123def456/thumb.webp',
      'download:restricted/abc123def456/p01.webp',
      'upload:media/released/abc123def456/p01.webp',
      'download:restricted/abc123def456/p02.webp',
      'upload:media/released/abc123def456/p02.webp',
      'rpc:release_item',
    ]);
    expect(rpcs[0].args).toEqual({ item_id: 'abc123def456' });
  });

  it('a missing restricted file stops before release_item', async () => {
    const { client, rpcs } = fakeClient({ downloadError: { message: 'Object not found' } });
    const r = await releaseItem({ id: 'abc123def456', thumb: 'abc123def456/thumb.webp', page_paths: ['abc123def456/p01.webp'] }, client);
    expect(r).toEqual({ ok: false, key: 'admin.error.sin_archivos' });
    expect(rpcs).toEqual([]);
  });
});

describe('releaseItem (text-only items)', () => {
  const doc = { id: 'abc123def456', thumb: null, page_paths: [] as string[] };

  it('copies restricted/<id>/text.txt to media/released/<id>/text.txt then calls release_item', async () => {
    const { client, log, rpcs, uploads } = fakeClient();
    expect(await releaseItem(doc, client)).toEqual({ ok: true });
    expect(log).toEqual(['download:restricted/abc123def456/text.txt', 'upload:media/released/abc123def456/text.txt', 'rpc:release_item']);
    expect(uploads[0].o).toEqual({ contentType: 'text/plain; charset=utf-8', upsert: true });
    expect(rpcs[0].args).toEqual({ item_id: 'abc123def456' });
  });

  it('copying again (an item already released without its text) re-uploads text.txt with upsert', async () => {
    const { client, log, uploads } = fakeClient();
    expect(await releaseItem(doc, client)).toEqual({ ok: true });
    expect(await releaseItem(doc, client)).toEqual({ ok: true });
    expect(log.filter((l) => l.startsWith('upload:'))).toEqual([
      'upload:media/released/abc123def456/text.txt',
      'upload:media/released/abc123def456/text.txt',
    ]);
    expect(uploads.every((u) => u.o.upsert === true)).toBe(true);
  });

  it('image items still upload as webp', async () => {
    const { client, uploads } = fakeClient();
    await releaseItem({ id: 'abc123def456', thumb: 'abc123def456/thumb.webp', page_paths: ['abc123def456/p01.webp'] }, client);
    expect(uploads.map((u) => [u.path, u.o.contentType])).toEqual([
      ['released/abc123def456/thumb.webp', 'image/webp'],
      ['released/abc123def456/p01.webp', 'image/webp'],
    ]);
  });

  it('neither images nor text: sin_archivos, nothing released', async () => {
    const { client, rpcs, uploads } = fakeClient({ downloadError: { message: 'Object not found' } });
    expect(await releaseItem(doc, client)).toEqual({ ok: false, key: 'admin.error.sin_archivos' });
    expect(uploads).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('preview reads text.txt (no signed images) for an item without pages', async () => {
    const { client, log } = fakeClient();
    expect(await restrictedPreview(doc, client)).toEqual({ thumb: null, pages: [], text: 'abc123def456/text.txt' });
    expect(log).toEqual(['download:restricted/abc123def456/text.txt']);
    const missing = fakeClient({ downloadError: { message: 'Object not found' } });
    expect(await restrictedPreview(doc, missing.client)).toBeNull();
  });
});

describe('restrictedPreview', () => {
  it('signs restricted/<id>/thumb and every page for 10 minutes', async () => {
    const { client, log } = fakeClient();
    const r = await restrictedPreview({ id: 'abc123abc123', thumb: 'abc123abc123/thumb.webp', page_paths: ['abc123abc123/p01.webp', 'abc123abc123/p02.webp'] }, client);
    expect(log).toEqual([
      'sign:restricted/abc123abc123/thumb.webp',
      'sign:restricted/abc123abc123/p01.webp',
      'sign:restricted/abc123abc123/p02.webp',
    ]);
    expect(r).toEqual({
      thumb: 'https://x.test/restricted/abc123abc123/thumb.webp?ttl=600',
      pages: ['https://x.test/restricted/abc123abc123/p01.webp?ttl=600', 'https://x.test/restricted/abc123abc123/p02.webp?ttl=600'],
      text: null,
    });
  });

  it('null offline or when nothing could be signed', async () => {
    expect(await restrictedPreview({ id: 'a', thumb: null, page_paths: [] }, null)).toBeNull();
    const client: any = { storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'Object not found' } }) }) } };
    expect(await restrictedPreview({ id: 'a', thumb: 'a/thumb.webp', page_paths: ['a/p01.webp'] }, client)).toBeNull();
  });
});

describe('searchUsers', () => {
  function usersClient() {
    const calls: string[] = [];
    const q: any = {
      ilike: (col: string, v: string) => (calls.push(`ilike:${col}:${v}`), q),
      order: (col: string) => (calls.push(`order:${col}`), q),
      limit: (n: number) => (calls.push(`limit:${n}`), q),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'a', display_name: null, role: 'user', points: 0 }], error: null }).then(ok),
    };
    return { calls, client: { from: () => ({ select: () => q }) } as any };
  }

  it('an empty search lists everyone, including people without a name yet', async () => {
    const { calls, client } = usersClient();
    const r = await searchUsers('', client);
    expect(r.data).toHaveLength(1);
    expect(calls.some((c) => c.startsWith('ilike'))).toBe(false);
  });

  it('a search term filters by name', async () => {
    const { calls, client } = usersClient();
    await searchUsers('  meir ', client);
    expect(calls).toContain('ilike:display_name:%meir%');
  });
});

describe('fact groups in the queue', () => {
  const fact = (id: string, lote?: string): Pending => ({
    id, user_id: 'u1', type: 'fact', festival: 'chubut', year: 1937, item_id: null, created_at: '',
    payload: { field: 'venue', value: id, ...(lote ? { lote } : {}) },
  } as Pending);

  it('groupQueue keeps queue order and groups facts sent together', () => {
    const [a, b, c, d] = [fact('a', 'L'), fact('b'), fact('c', 'L'), fact('d', 'M')];
    expect(groupQueue([a, b, c, d])).toEqual([
      { lote: 'L', items: [a, c] },
      { lote: null, items: [b] },
      { lote: null, items: [d] },
    ]);
  });

  it('approveAll approves each and keeps going after a failure', async () => {
    let n = 0;
    const calls: any[] = [];
    const client: any = { rpc: async (fn: string, args: any) => (calls.push([fn, args.cid]), ++n === 2 ? { data: null, error: { message: 'invalid_value' } } : { data: 10, error: null }) };
    const r = await approveAll([fact('a', 'L'), fact('b', 'L'), fact('c', 'L')], client);
    expect(r.done).toEqual(['a', 'c']);
    expect(r.failed).toEqual([{ id: 'b', key: expect.stringMatching(/^admin\.error\./) }]);
    expect(calls.map((c) => c[1])).toEqual(['a', 'b', 'c']);
  });

  it('rejectAll needs a reason before calling anything', async () => {
    const calls: any[] = [];
    const client: any = { rpc: async (...a: any[]) => (calls.push(a), { data: null, error: null }) };
    const r = await rejectAll([fact('a', 'L'), fact('b', 'L')], '  ', client);
    expect(r.done).toEqual([]);
    expect(r.failed.map((f) => f.key)).toEqual(['admin.error.motivo', 'admin.error.motivo']);
    expect(calls).toHaveLength(0);
    expect((await rejectAll([fact('a', 'L')], 'Duplicado', client)).done).toEqual(['a']);
  });
});

describe('adminAddFacts', () => {
  const rpcClient = (error: unknown = null) => {
    const calls: any[] = [];
    return { calls, client: { rpc: async (fn: string, args: any) => (calls.push({ fn, args }), { data: 20, error }) } as any };
  };
  const U = 'aea0d3f8-855c-41dc-82bf-b43f84696f82';

  it('sends validated facts with a shared lote and fuente, credited to the target', async () => {
    const { calls, client } = rpcClient();
    const r = await adminAddFacts(U, 'chubut', 1937, [{ field: 'venue', value: 'Salón San David' }, { field: 'ganador_silla', value: 'E. M. Roberts' }], 'Libro', client);
    expect(r).toEqual({ ok: true, points: 20 });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('admin_add_facts');
    const a = calls[0].args;
    expect([a.target, a.p_festival, a.p_year]).toEqual([U, 'chubut', 1937]);
    expect(a.facts).toHaveLength(2);
    expect(a.facts[0].lote).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.facts[1].lote).toBe(a.facts[0].lote);
    expect(a.facts.every((f: any) => f.fuente === 'Libro')).toBe(true);
  });

  it('reports the failing fact, refuses 0 or more than 50, and maps rpc errors', async () => {
    const { calls, client } = rpcClient();
    expect(await adminAddFacts(U, 'chubut', 1937, [{ field: 'venue', value: 'X' }, { field: 'start_date', value: '1937-02-30' }], '', client))
      .toEqual({ ok: false, key: 'contrib.error.fecha', index: 1 });
    expect(await adminAddFacts(U, 'chubut', 1937, [], '', client)).toEqual({ ok: false, key: 'contrib.error.campo' });
    expect(await adminAddFacts(U, 'chubut', 1937, Array(51).fill({ field: 'venue', value: 'X' }), '', client)).toEqual({ ok: false, key: 'contrib.error.demasiados' });
    expect(calls).toHaveLength(0);
    expect(await adminAddFacts(U, 'chubut', 1937, [{ field: 'venue', value: 'X' }], '', rpcClient({ message: 'not_admin' }).client))
      .toEqual({ ok: false, key: 'admin.error.no_admin' });
    expect(await adminAddFacts('', 'chubut', 1937, [{ field: 'venue', value: 'X' }], '', client)).toEqual({ ok: false, key: 'admin.error.acreditar' });
  });
});

