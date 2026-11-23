import { describe, expect, it } from 'vitest';
import { approvedForEdition, approvedNotes, isoFromParts, longDate, mergeApproved, ownPending, pendingView, sourceLine, splitFuente, submit, submitFacts, validate, type Contribution } from '../src/lib/contrib';
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

  it('transcription: 10 to 15000 characters', () => {
    expect(validate('transcription', { text: 'corto' })).toEqual({ ok: false, key: 'contrib.error.texto_transcripcion' });
    expect(validate('transcription', { text: 'x'.repeat(15000) }).ok).toBe(true);
    expect(validate('transcription', { text: 'x'.repeat(15001) })).toEqual({ ok: false, key: 'contrib.error.texto_transcripcion' });
    expect(validate('transcription', { text: '  Cystadleuaeth 1  ' })).toEqual({ ok: true, payload: { text: 'Cystadleuaeth 1' } });
  });

  it('memory: 10 to 5000 characters', () => {
    expect(validate('memory', { text: '' })).toEqual({ ok: false, key: 'contrib.error.texto' });
    expect(validate('memory', { text: 'Fui con mi abuela al Eisteddfod' }).ok).toBe(true);
    expect(validate('memory', { text: 'x'.repeat(5001) })).toEqual({ ok: false, key: 'contrib.error.texto' });
  });

  const video = { id: 'MKRCg__AXC8', title: 'Patagonia 150 - Lucy Taylor @ Eisteddfod Genedlaethol 2015 (1/2)', channel: 'Y Wladfa 150', kind: 'sesion' };
  const texto = 'Es del Eisteddfod Genedlaethol de Gales';

  it('report: a video that is not from an eisteddfod of the Patagonia keeps a copy of the video, no fix', () => {
    expect(validate('report', { objetivo: 'video', problema: 'no_corresponde', texto: `  ${texto} `, video, actual: { festival: 'chubut', year: 2015 } }))
      .toEqual({ ok: true, payload: { objetivo: 'video', problema: 'no_corresponde', texto, video } });
  });

  it('report: otra_edicion needs a fix that changes something; years become numbers', () => {
    const base = { objetivo: 'video', problema: 'otra_edicion', texto, video, actual: { festival: 'chubut', year: 2015 } };
    expect(validate('report', base)).toEqual({ ok: false, key: 'contrib.error.arreglo' });
    expect(validate('report', { ...base, arreglo: { festival: 'chubut', year: 2015 } })).toEqual({ ok: false, key: 'contrib.error.arreglo' });
    expect(validate('report', { ...base, arreglo: { year: '15' } })).toEqual({ ok: false, key: 'contrib.error.arreglo' });
    expect(validate('report', { ...base, arreglo: { festival: 'nada' } })).toEqual({ ok: false, key: 'contrib.error.arreglo' });
    expect(validate('report', { ...base, arreglo: { year: '2014' } })).toEqual({ ok: true, payload: { objetivo: 'video', problema: 'otra_edicion', texto, video, arreglo: { year: 2014 } } });
    // a video has no section: a category is dropped
    expect(validate('report', { ...base, arreglo: { year: 2014, category: 'bases' } })).toMatchObject({ ok: true, payload: { arreglo: { year: 2014 } } });
  });

  it('report: a document fix may change its section; otro needs no fix', () => {
    const doc = { objetivo: 'documento', texto, actual: { festival: 'chubut', year: 1996, category: 'programa' } };
    expect(validate('report', { ...doc, problema: 'otra_edicion', arreglo: { category: 'bases', festival: '' } }))
      .toEqual({ ok: true, payload: { objetivo: 'documento', problema: 'otra_edicion', texto, arreglo: { category: 'bases' } } });
    expect(validate('report', { ...doc, problema: 'otra_edicion', arreglo: { category: 'programa' } })).toEqual({ ok: false, key: 'contrib.error.arreglo' });
    expect(validate('report', { ...doc, problema: 'otro', arreglo: { year: 2000 } })).toEqual({ ok: true, payload: { objetivo: 'documento', problema: 'otro', texto } });
  });

  it('report: needs a known target and problem, a video id, and 10 to 1000 characters', () => {
    expect(validate('report', { objetivo: 'video', problema: 'no_corresponde', texto: 'corto', video })).toEqual({ ok: false, key: 'contrib.error.texto_informe' });
    expect(validate('report', { objetivo: 'video', problema: 'no_corresponde', texto: 'x'.repeat(1001), video })).toEqual({ ok: false, key: 'contrib.error.texto_informe' });
    expect(validate('report', { objetivo: 'video', problema: 'x', texto, video })).toEqual({ ok: false, key: 'contrib.error.problema' });
    expect(validate('report', { objetivo: 'x', problema: 'otro', texto })).toEqual({ ok: false, key: 'contrib.error.objetivo' });
    expect(validate('report', { objetivo: 'video', problema: 'otro', texto, video: { title: 'sin id' } })).toEqual({ ok: false, key: 'contrib.error.objetivo' });
  });

  it('note: 10 to 1000 characters', () => {
    expect(validate('note', { text: 'x'.repeat(9) })).toEqual({ ok: false, key: 'contrib.error.texto_informe' });
    expect(validate('note', { text: 'x'.repeat(1001) })).toEqual({ ok: false, key: 'contrib.error.texto_informe' });
    expect(validate('note', { text: ' Faltan las páginas 3 y 4. ' })).toEqual({ ok: true, payload: { text: 'Faltan las páginas 3 y 4.' } });
  });

  it('every error key exists in es-AR.json', () => {
    for (const k of ['tipo_archivo', 'muy_grande', 'archivo', 'categoria', 'fecha', 'campo', 'valor', 'competencia', 'etiqueta', 'ano', 'texto', 'texto_transcripcion', 'limite', 'sesion', 'alcance', 'objetivo', 'problema', 'texto_informe', 'arreglo']) {
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

describe('approvedForEdition', () => {
  it('reads the public view for one edition', async () => {
    const a = fakeClient({ rows: [{ id: 'f1', type: 'fact', festival: 'chubut', year: 1937, payload: { field: 'venue', value: 'Salón San David' } }] });
    const r = await approvedForEdition('chubut', 1937, a.client);
    expect(r).toEqual({ offline: false, data: [expect.objectContaining({ id: 'f1' })] });
    expect(a.log).toContain('select:public_contributions');
    expect(a.eqs).toEqual(expect.arrayContaining([['festival', 'chubut'], ['year', 1937]]));
  });

  it('is offline without a client or on error', async () => {
    expect(await approvedForEdition('chubut', 1937, null)).toEqual({ offline: true, data: [] });
    expect(await approvedForEdition('chubut', 1937, fakeClient({ selectError: { message: 'x' } }).client)).toEqual({ offline: true, data: [] });
  });
});

describe('date from explicit day / month / year', () => {
  it('builds the ISO date with no day/month ambiguity', () => {
    expect(isoFromParts('8', '12', '1937')).toBe('1937-12-08');
    expect(isoFromParts('08', '12', '1937')).toBe('1937-12-08');
    expect(isoFromParts('12', '8', '1937')).toBe('1937-08-12');
  });

  it('rejects days that do not exist or missing parts', () => {
    expect(isoFromParts('31', '2', '1937')).toBeNull();
    expect(isoFromParts('29', '2', '1937')).toBeNull();
    expect(isoFromParts('29', '2', '1936')).toBe('1936-02-29');
    expect(isoFromParts('', '12', '1937')).toBeNull();
    expect(isoFromParts('8', '', '1937')).toBeNull();
    expect(isoFromParts('8', '12', '37')).toBeNull();
    expect(isoFromParts('0', '12', '1937')).toBeNull();
    expect(isoFromParts('8', '13', '1937')).toBeNull();
  });

  it('reads the date back in words for the confirmation line', () => {
    expect(longDate('1937-12-08')).toBe('8 de diciembre de 1937');
  });
});

describe('fuente', () => {
  it('fact: optional fuente is kept trimmed, dropped when blank, capped at 200', () => {
    expect(validate('fact', { field: 'venue', value: 'Salón San David', fuente: '  Libro de M. H. Jones ' }))
      .toEqual({ ok: true, payload: { field: 'venue', value: 'Salón San David', fuente: 'Libro de M. H. Jones' } });
    expect(validate('fact', { field: 'venue', value: 'X', fuente: '   ' })).toEqual({ ok: true, payload: { field: 'venue', value: 'X' } });
    expect(validate('fact', { field: 'venue', value: 'X', fuente: 'a'.repeat(201) })).toEqual({ ok: false, key: 'contrib.error.fuente' });
    expect(validate('fact', { field: 'competencia', numero: '1', descripcion: 'Coro', fuente: 'Libro' }))
      .toEqual({ ok: true, payload: { field: 'competencia', numero: '1', descripcion: 'Coro', fuente: 'Libro' } });
    expect(validate('fact', { field: 'start_date', value: '1937-12-08', fuente: 'Libro' }))
      .toEqual({ ok: true, payload: { field: 'start_date', value: '1937-12-08', fuente: 'Libro' } });
  });

  it('sourceLine shows the fuente of a fact', () => {
    const mk = (payload: any) => ({ id: 'x', type: 'fact', festival: 'chubut', year: 1937, item_id: null, payload, created_at: '', reviewed_at: null, display_name: null }) as Contribution;
    expect(sourceLine(mk({ field: 'venue', value: 'X', fuente: 'Libro' }))).toBe('Fuente: Libro');
    expect(sourceLine(mk({ field: 'venue', value: 'X' }))).toBeNull();
    expect(sourceLine(mk({ field: 'venue', value: 'X', fuente: '  ' }))).toBeNull();
  });
});

describe('submitFacts', () => {
  it('inserts all facts at once with a shared lote and fuente', async () => {
    const { client, inserts } = fakeClient();
    const r = await submitFacts('chubut', 1937, [{ field: 'venue', value: 'Salón San David' }, { field: 'ganador_silla', value: 'E. M. Roberts' }], 'Libro', client);
    expect(r).toEqual({ ok: true });
    expect(inserts).toHaveLength(1);
    const rows = inserts[0].row as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].payload.lote).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[1].payload.lote).toBe(rows[0].payload.lote);
    expect(rows.every((x) => x.payload.fuente === 'Libro' && x.status === 'pending' && x.type === 'fact' && x.user_id === 'user-1')).toBe(true);
    expect(rows.map((x) => [x.festival, x.year])).toEqual([['chubut', 1937], ['chubut', 1937]]);
  });

  it('a single fact has no lote; errors carry the index', async () => {
    const one = fakeClient();
    await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }], '', one.client);
    expect((one.inserts[0].row as any[])[0].payload).toEqual({ field: 'venue', value: 'X' });
    expect(await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }, { field: 'start_date', value: '1937-02-30' }], '', fakeClient().client))
      .toEqual({ ok: false, key: 'contrib.error.fecha', index: 1 });
    expect(await submitFacts('chubut', 1937, [], '', fakeClient().client)).toEqual({ ok: false, key: 'contrib.error.campo' });
    expect(await submitFacts('chubut', 1937, Array(16).fill({ field: 'venue', value: 'X' }), '', fakeClient().client))
      .toEqual({ ok: false, key: 'contrib.error.demasiados' });
    expect(await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }], '', fakeClient({ insertError: { message: 'daily_limit' } }).client))
      .toEqual({ ok: false, key: 'contrib.error.limite' });
    expect(await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }], '', fakeClient({ uid: null }).client))
      .toEqual({ ok: false, key: 'contrib.error.sesion' });
  });
});

describe('approvedNotes', () => {
  it('reads approved notes of one document from the public view', async () => {
    const a = fakeClient({ rows: [{ id: 'n1', type: 'note', item_id: 'fcb0d30de6eb', payload: { text: 'Faltan las páginas 3 y 4.' } }] });
    const r = await approvedNotes('fcb0d30de6eb', a.client);
    expect(r).toEqual({ offline: false, data: [expect.objectContaining({ id: 'n1' })] });
    expect(a.log).toContain('select:public_contributions');
    expect(a.eqs).toEqual(expect.arrayContaining([['type', 'note'], ['item_id', 'fcb0d30de6eb']]));
  });
});

describe('splitFuente (#78)', () => {
  it('turns a trailing URL into a link on the source label', () => {
    expect(splitFuente('Diario Jornada, 14/10/2024: https://www.diariojornada.com.ar/380164/magazine/x')).toEqual({ label: 'Diario Jornada, 14/10/2024', href: 'https://www.diariojornada.com.ar/380164/magazine/x' });
    expect(splitFuente('Gacetilla y resultados 2023 (Chubut Cultural): https://chubutcultural.com.ar/a.pdf')).toEqual({ label: 'Gacetilla y resultados 2023 (Chubut Cultural)', href: 'https://chubutcultural.com.ar/a.pdf' });
    expect(splitFuente('Casgliad y Werin Cymru, «Rhaglen 1886» (https://www.casgliadywerin.cymru/items/13516)')).toEqual({ label: 'Casgliad y Werin Cymru, «Rhaglen 1886»', href: 'https://www.casgliadywerin.cymru/items/13516' });
    expect(splitFuente('https://www.ejemplo.org/a/b')).toEqual({ label: 'ejemplo.org', href: 'https://www.ejemplo.org/a/b' });
  });
  it('leaves a source without a trailing URL as text', () => {
    expect(splitFuente('Lista de resultados de esa edición en el archivo (no pública)')).toEqual({ label: 'Lista de resultados de esa edición en el archivo (no pública)' });
    expect(splitFuente('Ver https://a.org y el libro')).toEqual({ label: 'Ver https://a.org y el libro' });
  });
});

describe('video_text', () => {
  const video = { id: 'abcDEF123_-', title: 'Coro', extra: 'x' };
  const ok = { t: 12, antes: 'hola', texto: 'hola, che' };
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ t: i, texto: `linea ${i}` }));

  it('accepts one change and keeps the video id and title only', () => {
    const v = validate('video_text', { video, cambios: [ok], base: '2026-11-22T10:05:00Z' });
    expect(v).toEqual({ ok: true, payload: { video: { id: 'abcDEF123_-', title: 'Coro' }, base: '2026-11-22T10:05:00Z', cambios: [ok] } });
  });
  it('rejects 0 and 201 changes, accepts 200', () => {
    expect(validate('video_text', { video, cambios: [] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
    expect(validate('video_text', { video, cambios: many(201) })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
    expect(validate('video_text', { video, cambios: many(200) }).ok).toBe(true);
    expect(validate('video_text', { video })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
  it('rejects a texto over 500 code points, counting code points', () => {
    expect(validate('video_text', { video, cambios: [{ t: 1, texto: 'a'.repeat(501) }] })).toEqual({ ok: false, key: 'contrib.error.video_texto' });
    expect(validate('video_text', { video, cambios: [{ t: 1, texto: '😀'.repeat(500) }] }).ok).toBe(true);
    expect(validate('video_text', { video, cambios: [{ t: 1, texto: '  ' }] })).toEqual({ ok: false, key: 'contrib.error.video_texto' });
  });
  it('rejects a bad video id, time or language', () => {
    expect(validate('video_text', { video: { id: 'a b' }, cambios: [ok] })).toEqual({ ok: false, key: 'contrib.error.video_id' });
    expect(validate('video_text', { cambios: [ok] })).toEqual({ ok: false, key: 'contrib.error.video_id' });
    expect(validate('video_text', { video, cambios: [{ t: -1, texto: 'x' }] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
    expect(validate('video_text', { video, cambios: [{ t: 1, texto: 'x', idioma: 'fr' }] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
  it('drops an edit whose texto equals antes; an all-dropped list is 0 changes', () => {
    const v = validate('video_text', { video, cambios: [{ t: 1, antes: 'igual', texto: 'igual' }, ok] });
    expect(v.ok && (v.payload.cambios as unknown[]).length).toBe(1);
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'igual', texto: 'igual' }] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
  it('keeps quitar and idioma; a change needs texto or quitar', () => {
    const v = validate('video_text', { video, cambios: [{ t: 3, antes: 'ruido', quitar: true }, { t: 4, texto: 'ay', idioma: 'cy' }] });
    expect(v).toMatchObject({ ok: true, payload: { cambios: [{ t: 3, antes: 'ruido', quitar: true }, { t: 4, texto: 'ay', idioma: 'cy' }] } });
    expect(validate('video_text', { video, cambios: [{ t: 3, antes: 'x' }] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
  it('a language-only change to a line is kept (one of the four kinds); texto equal to antes leaves the language', () => {
    expect(validate('video_text', { video, cambios: [{ t: 3300.2, antes: 'Diolch yn fawr i chi gyd', idioma: 'cy' }] }))
      .toMatchObject({ ok: true, payload: { cambios: [{ t: 3300.2, antes: 'Diolch yn fawr i chi gyd', idioma: 'cy' }] } });
    expect(validate('video_text', { video, cambios: [{ t: 3, antes: 'Diolch', texto: 'Diolch', idioma: 'cy' }] }))
      .toMatchObject({ ok: true, payload: { cambios: [{ t: 3, antes: 'Diolch', idioma: 'cy' }] } });
    // An add still needs its words.
    expect(validate('video_text', { video, cambios: [{ t: 3, idioma: 'cy' }] })).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
  it('antes may be up to 2000 code points; longer is video_antes', () => {
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'a'.repeat(1000), texto: 'x' }] }).ok).toBe(true);
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'a'.repeat(2000), texto: 'x' }] }).ok).toBe(true);
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'a'.repeat(2001), texto: 'x' }] })).toEqual({ ok: false, key: 'contrib.error.video_antes' });
  });
  it('two changes with the same t and antes are video_repetido', () => {
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'a', texto: 'x' }, { t: 1, antes: 'a', texto: 'y' }] })).toEqual({ ok: false, key: 'contrib.error.video_repetido' });
    expect(validate('video_text', { video, cambios: [{ t: 1, texto: 'x' }, { t: 1, texto: 'y' }] })).toEqual({ ok: false, key: 'contrib.error.video_repetido' });
    expect(validate('video_text', { video, cambios: [{ t: 1, antes: 'a', texto: 'x' }, { t: 1, antes: 'b', texto: 'y' }, { t: 2, antes: 'a', texto: 'z' }] }).ok).toBe(true);
  });
  it('submit only takes chubut and trevelin editions', async () => {
    const { client, inserts } = fakeClient();
    expect(await submit('video_text', 'juventud', 2001, null, { video, cambios: [ok] }, client)).toEqual({ ok: false, key: 'contrib.error.edicion' });
    expect(await submit('video_text', null, null, null, { video, cambios: [ok] }, client)).toEqual({ ok: false, key: 'contrib.error.edicion' });
    expect(inserts).toHaveLength(0);
    expect(await submit('video_text', 'trevelin', 2001, null, { video, cambios: [ok] }, client)).toEqual({ ok: true });
    expect(inserts).toHaveLength(1);
  });
  it("the database's own check refusing the changes is said as such, not as being offline", async () => {
    const { client } = fakeClient({ insertError: { code: 'P0001', message: 'invalid' } });
    expect(await submit('video_text', 'chubut', 2001, null, { video, cambios: [ok] }, client)).toEqual({ ok: false, key: 'contrib.error.video_cambios' });
  });
});
