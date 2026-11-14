import { describe, expect, it } from 'vitest';
import { mergeApproved, ownPending, pendingView, submit, validate, type Contribution } from '../src/lib/contrib';
import { t } from '../src/lib/i18n';

const MB = 1024 * 1024;
const file = (type: string, size: number) => ({ name: 'scan', type, size });

function fakeClient(opts: { uid?: string | null; insertError?: unknown; uploadError?: unknown; rows?: any[]; selectError?: unknown } = {}) {
  const log: string[] = [];
  const uploads: any[] = [];
  const inserts: any[] = [];
  const removed: any[] = [];
  const eqs: [string, unknown][] = [];
  const uid = opts.uid === undefined ? 'user-1' : opts.uid;
  const client: any = {
    auth: {
      getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null }, error: null }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown, o: unknown) => {
          log.push('upload');
          uploads.push({ bucket, path, body, o });
          return opts.uploadError ? { data: null, error: opts.uploadError } : { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: [], error: null };
        },
      }),
    },
    from: (table: string) => ({
      insert: async (row: unknown) => {
        log.push('insert');
        inserts.push({ table, row });
        return { data: null, error: opts.insertError ?? null };
      },
      // Read chain: every .eq() is recorded; awaiting it yields opts.rows.
      select: (_cols: string) => {
        log.push(`select:${table}`);
        const q: any = {
          eq: (col: string, val: unknown) => (eqs.push([col, val]), q),
          in: () => q,
          order: () => q,
          limit: () => q,
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: opts.selectError ? null : (opts.rows ?? []), error: opts.selectError ?? null }).then(ok, ko),
        };
        return q;
      },
    }),
  };
  return { client, log, uploads, inserts, removed, eqs };
}

describe('validate', () => {
  it('upload: accepts images and PDF up to 20 MB, rejects other types and larger files', () => {
    const ok = validate('upload', { file: file('application/pdf', 20 * MB), category: 'programa', alcance: 'completo', description: 'Programa 1975' });
    expect(ok).toEqual({ ok: true, payload: { category: 'programa', alcance: 'completo', description: 'Programa 1975' } });
    expect(validate('upload', { file: file('image/webp', 1000), category: 'otros' }).ok).toBe(true);
    expect(validate('upload', { file: file('image/gif', 1000), category: 'programa' })).toEqual({ ok: false, key: 'contrib.error.tipo_archivo' });
    expect(validate('upload', { file: file('image/jpeg', 20 * MB + 1), category: 'programa' })).toEqual({ ok: false, key: 'contrib.error.muy_grande' });
    expect(validate('upload', { category: 'programa' })).toEqual({ ok: false, key: 'contrib.error.archivo' });
    expect(validate('upload', { file: file('image/png', 10), category: 'nada' })).toEqual({ ok: false, key: 'contrib.error.categoria' });
  });

  it('fact: known fields only, ISO dates, competencia needs numero and descripcion', () => {
    expect(validate('fact', { field: 'venue', value: ' Salón San David ' })).toEqual({ ok: true, payload: { field: 'venue', value: 'Salón San David' } });
    expect(validate('fact', { field: 'start_date', value: '1975-10-28' })).toEqual({ ok: true, payload: { field: 'start_date', value: '1975-10-28' } });
    expect(validate('fact', { field: 'end_date', value: '28/10/1975' })).toEqual({ ok: false, key: 'contrib.error.fecha' });
    expect(validate('fact', { field: 'start_date', value: '1975-02-30' })).toEqual({ ok: false, key: 'contrib.error.fecha' });
    expect(validate('fact', { field: 'email', value: 'x' })).toEqual({ ok: false, key: 'contrib.error.campo' });
    expect(validate('fact', { field: 'venue', value: '  ' })).toEqual({ ok: false, key: 'contrib.error.valor' });
    expect(validate('fact', { field: 'competencia', numero: '12' })).toEqual({ ok: false, key: 'contrib.error.competencia' });
    expect(validate('fact', { field: 'competencia', numero: '12', descripcion: 'Coro mixto', idioma: 'galés' })).toEqual({
      ok: true,
      payload: { field: 'competencia', numero: '12', descripcion: 'Coro mixto', idioma: 'galés' },
    });
    expect(validate('fact', { field: 'edicion_realizada', value: 'no' })).toEqual({ ok: true, payload: { field: 'edicion_realizada', value: 'no' } });
    expect(validate('fact', { field: 'edicion_realizada', value: 'quizás' })).toEqual({ ok: false, key: 'contrib.error.valor' });
  });

  it('upload: programa needs alcance; other categories drop it', () => {
    const f = file('image/jpeg', 10);
    expect(validate('upload', { file: f, category: 'programa' })).toEqual({ ok: false, key: 'contrib.error.alcance' });
    expect(validate('upload', { file: f, category: 'programa', alcance: 'quizás' })).toEqual({ ok: false, key: 'contrib.error.alcance' });
    expect(validate('upload', { file: f, category: 'programa', alcance: 'tapa' })).toEqual({ ok: true, payload: { category: 'programa', alcance: 'tapa' } });
    expect(validate('upload', { file: f, category: 'programa', alcance: 'completo', description: 'Tapa y 12 páginas' }))
      .toEqual({ ok: true, payload: { category: 'programa', alcance: 'completo', description: 'Tapa y 12 páginas' } });
    expect(validate('upload', { file: f, category: 'bases', alcance: 'tapa' })).toEqual({ ok: true, payload: { category: 'bases' } });
  });

  it('tag: needs at least one of year (1865-2026), category or festival', () => {
    expect(validate('tag', {})).toEqual({ ok: false, key: 'contrib.error.etiqueta' });
    expect(validate('tag', { year: 1864 })).toEqual({ ok: false, key: 'contrib.error.ano' });
    expect(validate('tag', { year: 2027 })).toEqual({ ok: false, key: 'contrib.error.ano' });
    expect(validate('tag', { year: '1975' })).toEqual({ ok: true, payload: { year: 1975 } });
    expect(validate('tag', { category: 'bases', festival: 'mimosa' })).toEqual({ ok: true, payload: { category: 'bases', festival: 'mimosa' } });
    expect(validate('tag', { festival: 'gorsedd' })).toEqual({ ok: false, key: 'contrib.error.etiqueta' });
  });

  it('transcription: 10 to 5000 characters', () => {
    expect(validate('transcription', { text: 'corto' })).toEqual({ ok: false, key: 'contrib.error.texto' });
    expect(validate('transcription', { text: 'x'.repeat(5001) })).toEqual({ ok: false, key: 'contrib.error.texto' });
    expect(validate('transcription', { text: '  Cystadleuaeth 1  ' })).toEqual({ ok: true, payload: { text: 'Cystadleuaeth 1' } });
  });

  it('memory: 10 to 5000 characters', () => {
    expect(validate('memory', { text: '' })).toEqual({ ok: false, key: 'contrib.error.texto' });
    expect(validate('memory', { text: 'Fui con mi abuela al Eisteddfod' }).ok).toBe(true);
  });

  it('every error key exists in es-AR.json', () => {
    for (const k of ['tipo_archivo', 'muy_grande', 'archivo', 'categoria', 'fecha', 'campo', 'valor', 'competencia', 'etiqueta', 'ano', 'texto', 'limite', 'sesion', 'alcance']) {
      expect(t(`contrib.error.${k}`)).not.toBe(`contrib.error.${k}`);
    }
  });
});

describe('submit', () => {
  it('submit upload stores then inserts', async () => {
    const { client, log, uploads, inserts } = fakeClient();
    const f = file('image/jpeg', 2 * MB);
    const r = await submit('upload', 'chubut', 1975, null, { file: f, category: 'programa', alcance: 'tapa', description: 'Tapa' }, client);
    expect(r).toEqual({ ok: true });
    expect(log).toEqual(['upload', 'insert']);
    expect(uploads[0].bucket).toBe('uploads');
    expect(uploads[0].path).toMatch(/^user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(uploads[0].body).toBe(f);
    expect(inserts[0]).toEqual({
      table: 'contributions',
      row: {
        user_id: 'user-1', type: 'upload', festival: 'chubut', year: 1975, item_id: null, status: 'pending',
        payload: { category: 'programa', alcance: 'tapa', description: 'Tapa', storage_path: uploads[0].path },
      },
    });
  });

  it('daily_limit maps to i18n key', async () => {
    const { client, removed, uploads } = fakeClient({ insertError: { code: 'P0001', message: 'daily_limit' } });
    expect(await submit('memory', 'mimosa', 2001, null, { text: 'Un recuerdo lindo' }, client)).toEqual({ ok: false, key: 'contrib.error.limite' });
    const up = await submit('upload', 'mimosa', 2001, null, { file: file('application/pdf', 10), category: 'bases' }, client);
    expect(up).toEqual({ ok: false, key: 'contrib.error.limite' });
    expect(removed).toEqual([{ bucket: 'uploads', paths: [uploads[0].path] }]); // no orphaned original
  });

  it('validates before any network call, needs a session, and is offline without a client', async () => {
    const a = fakeClient();
    expect(await submit('memory', 'chubut', 1975, null, { text: 'x' }, a.client)).toEqual({ ok: false, key: 'contrib.error.texto' });
    expect(a.log).toEqual([]);
    expect(await submit('memory', 'chubut', 1975, null, { text: 'Un recuerdo lindo' }, fakeClient({ uid: null }).client)).toEqual({ ok: false, key: 'contrib.error.sesion' });
    expect(await submit('memory', 'chubut', 1975, null, { text: 'Un recuerdo lindo' }, null)).toEqual({ ok: false, key: 'estado.sin_conexion' });
    const b = fakeClient({ uploadError: { message: 'Failed to fetch' } });
    expect(await submit('upload', 'chubut', 1975, null, { file: file('image/png', 10), category: 'otros' }, b.client)).toEqual({ ok: false, key: 'estado.sin_conexion' });
    expect(b.log).toEqual(['upload']);
  });

  it('a tag on an item carries the item id', async () => {
    const { client, inserts } = fakeClient();
    expect(await submit('tag', 'trevelin', 2011, 'abc123def456', { year: 2012 }, client)).toEqual({ ok: true });
    expect(inserts[0].row).toMatchObject({ type: 'tag', item_id: 'abc123def456', festival: 'trevelin', year: 2011, payload: { year: 2012 } });
  });
});

describe('mergeApproved', () => {
  const c = (id: string, value: string, created_at = '2026-01-01T00:00:00Z'): Contribution => ({
    id, type: 'fact', festival: 'chubut', year: 1975, item_id: null, payload: { field: 'venue', value },
    created_at, reviewed_at: created_at, display_name: 'Ana',
  });

  it('mergeApproved dedupes', () => {
    const out = mergeApproved([c('a', 'viejo'), c('b', 'B', '2026-01-02T00:00:00Z')], [c('a', 'nuevo'), c('c', 'C', '2026-01-03T00:00:00Z')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.find((x) => x.id === 'a')!.payload.value).toBe('nuevo');
  });
});

describe('returnPath (/ingresar?volver=…)', () => {
  it('accepts only paths under the site base', async () => {
    const { returnPath } = await import('../src/lib/auth');
    const base = '/amgueddfa-eisteddfod/';
    expect(returnPath('/amgueddfa-eisteddfod/contribuir?f=chubut&y=1975', base)).toBe('/amgueddfa-eisteddfod/contribuir?f=chubut&y=1975');
    expect(returnPath('https://evil.example/', base)).toBeNull();
    expect(returnPath('//evil.example/amgueddfa-eisteddfod/', base)).toBeNull();
    expect(returnPath('/otro/', base)).toBeNull();
    expect(returnPath('/amgueddfa-eisteddfod/\\evil', base)).toBeNull();
    expect(returnPath(null, base)).toBeNull();
  });
});

describe('display helpers', () => {
  it('factDisplay formats dates, yes/no and competition rows', async () => {
    const { factDisplay, jsonForScript } = await import('../src/lib/contrib');
    const mk = (payload: any): Contribution => ({ id: 'x', type: 'fact', festival: 'chubut', year: 1975, item_id: null, payload, created_at: '', reviewed_at: null, display_name: null });
    expect(factDisplay(mk({ field: 'start_date', value: '1975-10-28' }))).toEqual({ label: 'Fecha de inicio', value: '28 de octubre de 1975' });
    expect(factDisplay(mk({ field: 'edicion_realizada', value: 'no' })).value).toBe('No');
    expect(factDisplay(mk({ field: 'competencia', numero: '3', descripcion: 'Coro', idioma: 'galés' })).value).toBe('N.º 3: Coro (galés)');
    expect(jsonForScript([{ text: '</script><b>' }])).not.toContain('</script>');
    expect(JSON.parse(jsonForScript([{ text: '</script>' }]))).toEqual([{ text: '</script>' }]);
  });
});

describe('pending drafts', () => {
  it('ownPending filters on the signed-in user, pending, and the edition', async () => {
    const a = fakeClient({ uid: 'user-1', rows: [{ id: 'p1', type: 'memory', festival: 'chubut', year: 1930, payload: { text: 'x' } }] });
    expect(await ownPending('chubut', 1930, a.client)).toHaveLength(1);
    expect(a.eqs).toEqual(expect.arrayContaining([['user_id', 'user-1'], ['status', 'pending'], ['festival', 'chubut'], ['year', 1930]]));
  });

  it('ownPending is empty signed out, offline, or on a query error', async () => {
    const out = fakeClient({ uid: null });
    expect(await ownPending('chubut', 1930, out.client)).toEqual([]);
    expect(out.log).not.toContain('select:contributions');
    expect(await ownPending('chubut', 1930, null)).toEqual([]);
    expect(await ownPending('chubut', 1930, fakeClient({ selectError: { message: 'boom' } }).client)).toEqual([]);
  });

  it('pendingView sorts each kind into its section and previews only images', () => {
    const mk = (type: string, payload: any) =>
      ({ id: 'x', type, festival: 'chubut', year: 1930, item_id: null, payload, created_at: '', reviewed_at: null, display_name: null }) as Contribution;
    expect(pendingView(mk('upload', { category: 'programa', storage_path: 'u/a.JPG' })))
      .toEqual({ section: 'aportes', text: 'Programa', preview: 'image', path: 'u/a.JPG', label: null });
    expect(pendingView(mk('upload', { category: 'bases', storage_path: 'u/a.pdf', description: 'Bases' })))
      .toEqual({ section: 'aportes', text: 'Bases', preview: 'pdf', path: 'u/a.pdf', label: 'Archivo PDF' });
    expect(pendingView(mk('memory', { text: 'Un recuerdo' }))).toEqual({ section: 'recuerdos', text: 'Un recuerdo', preview: null, path: null, label: null });
    expect(pendingView(mk('fact', { field: 'venue', value: 'Trelew' }))).toMatchObject({ section: 'hechos', preview: null });
    expect(pendingView(mk('fact', { field: 'venue', value: 'Trelew' })).text).toContain('Trelew');
  });
});

