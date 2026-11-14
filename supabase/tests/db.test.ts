import { beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type TestDb, type Who } from './harness';

let t: TestDb;

beforeEach(async () => {
  t = await makeDb();
});

interface NewContribution {
  user_id: string;
  type?: string;
  festival?: string;
  year?: number | null;
  item_id?: string | null;
  payload?: Record<string, unknown>;
  status?: string;
}

async function contribute(who: Who, c: NewContribution): Promise<string> {
  const rows = await t.q<{ id: string }>(
    who,
    `insert into public.contributions (user_id, type, festival, year, item_id, payload, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      c.user_id,
      c.type ?? 'memory',
      c.festival ?? 'chubut',
      c.year === undefined ? 2024 : c.year,
      c.item_id ?? null,
      JSON.stringify(c.payload ?? { text: 'Me acuerdo' }),
      c.status ?? 'pending',
    ],
  );
  return rows[0].id;
}

async function approve(admin: string, cid: string, fillsGap = false, override: unknown = null) {
  const rows = await t.q<{ pts: number }>(
    admin,
    'select public.approve_contribution($1, $2, $3) as pts',
    [cid, fillsGap, override === null ? null : JSON.stringify(override)],
  );
  return rows[0].pts;
}

async function points(uid: string): Promise<number> {
  const rows = await t.q<{ points: number }>('postgres', 'select points from public.profiles where id = $1', [uid]);
  return rows[0].points;
}

async function badges(uid: string): Promise<string[]> {
  const rows = await t.q<{ badge: string }>(
    'postgres',
    'select badge from public.user_badges where user_id = $1 order by badge',
    [uid],
  );
  return rows.map((r) => r.badge);
}

describe('contributions RLS', () => {
  it('user can insert own pending contribution', async () => {
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u });
    const own = await t.q(u, 'select id, status from public.contributions');
    expect(own).toEqual([{ id, status: 'pending' }]);
  });

  it('user cannot insert as approved or for another user', async () => {
    const u = await t.createUser();
    const other = await t.createUser();
    await expect(contribute(u, { user_id: u, status: 'approved' })).rejects.toThrow();
    await expect(contribute(u, { user_id: other })).rejects.toThrow();
    await expect(contribute('anon', { user_id: u })).rejects.toThrow();
    const all = await t.q('postgres', 'select id from public.contributions');
    expect(all).toHaveLength(0);
  });

  it('user cannot update or delete contributions directly', async () => {
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u });
    await t.q(u, `update public.contributions set status = 'approved' where id = $1`, [id]).catch(() => null);
    await t.q(u, 'delete from public.contributions where id = $1', [id]).catch(() => null);
    const rows = await t.q('postgres', 'select status from public.contributions where id = $1', [id]);
    expect(rows).toEqual([{ status: 'pending' }]);
  });

  it('anon sees only approved via public_contributions, no user_id column', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    await t.q(u, `select public.set_display_name('Gwenllian')`);
    const a = await contribute(u, { user_id: u, payload: { text: 'aprobada' } });
    await contribute(u, { user_id: u, payload: { text: 'pendiente' } });
    await approve(admin, a);

    const rows = await t.q<Record<string, unknown>>('anon', 'select * from public.public_contributions');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(a);
    expect(rows[0].display_name).toBe('Gwenllian');
    expect(rows[0]).not.toHaveProperty('user_id');

    const cols = await t.q<{ column_name: string }>(
      'postgres',
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'public_contributions'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain('user_id');

    // anon cannot read the base tables at all
    await expect(t.q('anon', 'select * from public.contributions')).rejects.toThrow();
    await expect(t.q('anon', 'select * from public.profiles')).rejects.toThrow();
    // ...but can read the public profile view
    const pp = await t.q('anon', 'select * from public.public_profiles');
    expect(pp).toEqual([{ display_name: 'Gwenllian', points: 5, country: null }]);
  });
});

describe('approval and scoring', () => {
  it('non-admin approve raises', async () => {
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u });
    await expect(approve(u, id)).rejects.toThrow(/not_admin/);
    await expect(
      t.q(u, 'select public.reject_contribution($1, $2)', [id, 'no']),
    ).rejects.toThrow(/not_admin/);
    expect(await points(u)).toBe(0);
  });

  it('approve upload fills_gap gives 50 and primer-aporte badge', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const id = await contribute(u, {
      user_id: u,
      type: 'upload',
      payload: { storage_path: `${u}/prog.pdf`, category: 'programa', description: 'Programa' },
    });
    const pts = await approve(admin, id, true);
    expect(pts).toBe(50);
    expect(await points(u)).toBe(50);
    expect(await badges(u)).toEqual(['cazador-de-programas', 'primer-aporte']);
    const row = await t.q('postgres', 'select status, reviewer_id from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ status: 'approved', reviewer_id: admin }]);
  });

  it('scores each type per the global constraints', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const cases: [string, boolean, number][] = [
      ['upload', false, 20],
      ['fact', false, 10],
      ['transcription', false, 15],
      ['tag', false, 2],
      ['memory', false, 5],
    ];
    for (const [type, gap, expected] of cases) {
      const id = await contribute(u, { user_id: u, type, payload: { field: 'venue', value: 'Trelew' } });
      expect(await approve(admin, id, gap)).toBe(expected);
    }
    expect(await points(u)).toBe(52);
  });

  it('approve twice raises not_pending and points unchanged', async () => {
    const admin = await t.createAdmin();
    const admin2 = await t.createAdmin();
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u, type: 'fact', payload: { field: 'venue', value: 'Gaiman' } });
    expect(await approve(admin, id)).toBe(10);
    await expect(approve(admin, id)).rejects.toThrow(/not_pending/);
    await expect(approve(admin2, id, true)).rejects.toThrow(/not_pending/);
    await expect(
      t.q(admin2, 'select public.reject_contribution($1, $2)', [id, 'tarde']),
    ).rejects.toThrow(/not_pending/);
    expect(await points(u)).toBe(10);
    const row = await t.q('postgres', 'select status, reviewer_id from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ status: 'approved', reviewer_id: admin }]);
  });

  it('reject sets status and note, awards nothing', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u });
    await t.q(admin, 'select public.reject_contribution($1, $2)', [id, 'Duplicado']);
    const row = await t.q('postgres', 'select status, review_note from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ status: 'rejected', review_note: 'Duplicado' }]);
    expect(await points(u)).toBe(0);
    await expect(approve(admin, id)).rejects.toThrow(/not_pending/);
  });

  it('payload_override is merged into payload', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u, type: 'fact', payload: { field: 'venue', value: 'Trelw' } });
    await approve(admin, id, false, { value: 'Trelew' });
    const row = await t.q('postgres', 'select payload from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ payload: { field: 'venue', value: 'Trelew' } }]);
  });

  it('edicion_realizada fact sets editions.status', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const yes = await contribute(u, {
      user_id: u, type: 'fact', festival: 'mimosa', year: 1999,
      payload: { field: 'edicion_realizada', value: 'si' },
    });
    const no = await contribute(u, {
      user_id: u, type: 'fact', festival: 'trevelin', year: 1985,
      payload: { field: 'edicion_realizada', value: 'no' },
    });
    await approve(admin, yes);
    await approve(admin, no);
    const rows = await t.q('anon', 'select festival, year, status from public.editions order by festival');
    expect(rows).toEqual([
      { festival: 'mimosa', year: 1999, status: 'held' },
      { festival: 'trevelin', year: 1985, status: 'not_held' },
    ]);
    // a later correction updates the same row
    const fix = await contribute(u, {
      user_id: u, type: 'fact', festival: 'trevelin', year: 1985,
      payload: { field: 'edicion_realizada', value: true },
    });
    await approve(admin, fix);
    const after = await t.q('postgres', `select status from public.editions where festival = 'trevelin' and year = 1985`);
    expect(after).toEqual([{ status: 'held' }]);
  });

  it('10 approved chubut gives archivista-chubut', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    for (let i = 0; i < 9; i++) {
      await approve(admin, await contribute(u, { user_id: u, festival: 'chubut', year: 2000 + i }));
    }
    await approve(admin, await contribute(u, { user_id: u, festival: 'juventud' }));
    expect(await badges(u)).not.toContain('archivista-chubut');
    await approve(admin, await contribute(u, { user_id: u, festival: 'chubut' }));
    expect(await badges(u)).toContain('archivista-chubut');
    expect(await badges(u)).toContain('bardo');
    expect(await badges(u)).not.toContain('archivista-juventud');

    await t.q(u, `select public.set_display_name('Archivera')`);
    const lb = await t.q('anon', 'select display_name, points, festival_points from public.leaderboard');
    expect(lb).toEqual([{ display_name: 'Archivera', points: 55, festival_points: { chubut: 50, juventud: 5 } }]);
  });
});

describe('limits and profiles', () => {
  it('31st contribution in 24h raises daily_limit', async () => {
    const u = await t.createUser();
    for (let i = 0; i < 30; i++) await contribute(u, { user_id: u });
    await expect(contribute(u, { user_id: u })).rejects.toThrow(/daily_limit/);
    // old contributions do not count
    await t.q('postgres', `update public.contributions set created_at = now() - interval '25 hours'`);
    await expect(contribute(u, { user_id: u })).resolves.toBeTypeOf('string');
  });

  it('display name uniqueness is case-insensitive', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await t.q(a, `select public.set_display_name('Eluned')`);
    await expect(t.q(b, `select public.set_display_name('ELUNED')`)).rejects.toThrow(/display_name_taken/);
    await expect(t.q(b, `select public.set_display_name('ab')`)).rejects.toThrow(/invalid_display_name/);
    await expect(t.q(b, `select public.set_display_name($1)`, ['x'.repeat(31)])).rejects.toThrow(
      /invalid_display_name/,
    );
    await t.q(a, `select public.set_display_name('eluned')`); // own rename keeps working
    await t.q(b, `select public.set_display_name('Dafydd')`);
    const own = await t.q(b, 'select display_name, role, points from public.profiles');
    expect(own).toEqual([{ display_name: 'Dafydd', role: 'user', points: 0 }]);
    // a user cannot change their role or points directly
    await t.q(b, `update public.profiles set role = 'admin', points = 999`).catch(() => null);
    expect(await t.q('postgres', 'select role, points from public.profiles where id = $1', [b])).toEqual([
      { role: 'user', points: 0 },
    ]);
  });

  it('set_display_name creates the profile row if missing', async () => {
    const u = await t.createUser();
    await t.q('postgres', 'delete from public.profiles where id = $1', [u]);
    await t.q(u, `select public.set_display_name('Morgan')`);
    expect(await t.q('postgres', 'select display_name from public.profiles where id = $1', [u])).toEqual([
      { display_name: 'Morgan' },
    ]);
  });

  it('set_profile_place sets, validates and clears country and timezone', async () => {
    const u = await t.createUser();
    await t.q(u, `select public.set_display_name('Gwenllian')`);
    await t.q(u, `select public.set_profile_place('gb-wls', 'Europe/London')`);
    expect(await t.q(u, 'select country, timezone from public.profiles')).toEqual([
      { country: 'GB-WLS', timezone: 'Europe/London' },
    ]);
    await expect(t.q(u, `select public.set_profile_place('Gales', null)`)).rejects.toThrow(/invalid_country/);
    await expect(t.q(u, `select public.set_profile_place('AR', 'Patagonia/Gaiman')`)).rejects.toThrow(
      /invalid_timezone/,
    );
    await t.q(u, `select public.set_profile_place('AR', 'America/Argentina/Catamarca')`);
    await t.q(u, `select public.set_profile_place('', null)`);
    expect(await t.q(u, 'select country, timezone from public.profiles')).toEqual([{ country: null, timezone: null }]);
    await expect(t.q('anon', `select public.set_profile_place('AR', null)`)).rejects.toThrow(/permission denied/);
    // only through the function: a direct update is still refused
    await t.q(u, `update public.profiles set country = 'AR'`).catch(() => null);
    expect(await t.q('postgres', 'select country from public.profiles where id = $1', [u])).toEqual([{ country: null }]);
  });

  it('the country is public, the timezone is not', async () => {
    const u = await t.createUser();
    await t.q(u, `select public.set_display_name('Iolo')`);
    await t.q(u, `select public.set_profile_place('AR', 'America/Argentina/Buenos_Aires')`);
    await t.q('postgres', 'update public.profiles set points = 5 where id = $1', [u]);
    const pub = await t.q('anon', `select * from public.public_profiles where display_name = 'Iolo'`);
    expect(pub).toEqual([{ display_name: 'Iolo', points: 5, country: 'AR' }]);
    const lb = await t.q('anon', `select * from public.leaderboard where display_name = 'Iolo'`);
    expect(lb).toEqual([{ display_name: 'Iolo', points: 5, festival_points: {}, country: 'AR' }]);
  });

  it('only admins set roles and release items', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    await expect(t.q(u, `select public.set_role($1, 'admin')`, [u])).rejects.toThrow(/not_admin/);
    await expect(t.q(u, `select public.release_item('abc123abc123')`)).rejects.toThrow(/not_admin/);
    await t.q(admin, `select public.set_role($1, 'admin')`, [u]);
    await t.q(admin, `select public.release_item('abc123abc123')`);
    const rel = await t.q('anon', 'select item_id, released_by from public.released_items');
    expect(rel).toEqual([{ item_id: 'abc123abc123', released_by: admin }]);
    expect(await t.q('postgres', 'select role from public.profiles where id = $1', [u])).toEqual([{ role: 'admin' }]);
  });
});

describe('storage policies', () => {
  const put = (who: Who, bucket: string, name: string) =>
    t.q(who, 'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);

  it('buckets exist with the right settings', async () => {
    const rows = await t.q(
      'postgres',
      'select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id',
    );
    expect(rows).toEqual([
      { id: 'media', public: true, file_size_limit: null, allowed_mime_types: null },
      { id: 'restricted', public: false, file_size_limit: null, allowed_mime_types: null },
      {
        id: 'uploads',
        public: false,
        file_size_limit: 20971520,
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      },
    ]);
  });

  it('uploads: own folder only, owner and admins read', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const other = await t.createUser();
    await put(u, 'uploads', `${u}/scan.jpg`);
    await expect(put(u, 'uploads', `${other}/scan.jpg`)).rejects.toThrow();
    await expect(put('anon', 'uploads', `${u}/x.jpg`)).rejects.toThrow();
    expect(await t.q(other, `select name from storage.objects where bucket_id = 'uploads'`)).toEqual([]);
    expect(await t.q('anon', `select name from storage.objects where bucket_id = 'uploads'`)).toEqual([]);
    expect(await t.q(u, `select name from storage.objects where bucket_id = 'uploads'`)).toEqual([{ name: `${u}/scan.jpg` }]);
    expect(await t.q(admin, `select name from storage.objects where bucket_id = 'uploads'`)).toEqual([
      { name: `${u}/scan.jpg` },
    ]);
  });

  it('uploads: at most 30 objects per user in 24 h, older ones do not count', async () => {
    const u = await t.createUser();
    const other = await t.createUser();
    await t.q(
      'postgres',
      `insert into storage.objects (bucket_id, name, created_at)
       select 'uploads', $1 || '/old' || g || '.jpg', now() - interval '25 hours' from generate_series(1, 5) g`,
      [u],
    );
    for (let i = 0; i < 30; i++) await put(u, 'uploads', `${u}/f${i}.jpg`);
    await expect(put(u, 'uploads', `${u}/f30.jpg`)).rejects.toThrow();
    // another user's quota is untouched
    await put(other, 'uploads', `${other}/a.jpg`);
  });

  it('uploads: a user deletes only their own originals', async () => {
    const u = await t.createUser();
    const other = await t.createUser();
    await put(u, 'uploads', `${u}/scan.jpg`);
    await put(other, 'uploads', `${other}/scan.jpg`);
    await t.q(other, `delete from storage.objects where bucket_id = 'uploads' and name = $1`, [`${u}/scan.jpg`]);
    await t.q(u, `delete from storage.objects where bucket_id = 'uploads' and name = $1`, [`${u}/scan.jpg`]);
    expect(await t.q('postgres', `select name from storage.objects where bucket_id = 'uploads' order by name`)).toEqual([
      { name: `${other}/scan.jpg` },
    ]);
  });

  it('uploads: admins can delete any original', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    await put(u, 'uploads', `${u}/scan.jpg`);
    await t.q(admin, `delete from storage.objects where bucket_id = 'uploads' and name = $1`, [`${u}/scan.jpg`]);
    expect(await t.q('postgres', `select name from storage.objects where bucket_id = 'uploads'`)).toEqual([]);
  });

  it('restricted is admin only; media is public read, admin write', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    await expect(put(u, 'restricted', 'abc/p01.webp')).rejects.toThrow();
    await put(admin, 'restricted', 'abc/p01.webp');
    expect(await t.q(u, `select name from storage.objects where bucket_id = 'restricted'`)).toEqual([]);
    await expect(put(u, 'media', 'abc/thumb.webp')).rejects.toThrow();
    await put(admin, 'media', 'abc/thumb.webp');
    expect(await t.q('anon', `select name from storage.objects where bucket_id = 'media'`)).toEqual([
      { name: 'abc/thumb.webp' },
    ]);
  });
});

describe('admin_add_facts and the admin exemption', () => {
  const facts = (n: number, extra: Record<string, unknown> = {}) =>
    JSON.stringify(Array.from({ length: n }, (_, i) => ({ field: 'other', value: `Dato ${i + 1}`, ...extra })));

  it('publishes facts credited to another user, with points, badges and edition status', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const rows = await t.q<{ pts: number }>(admin, 'select public.admin_add_facts($1, $2, $3, $4::jsonb) as pts',
      [u, 'chubut', 1937, JSON.stringify([
        { field: 'venue', value: 'Salón San David', fuente: 'Libro' },
        { field: 'ganador_silla', value: 'E. M. Roberts', fuente: 'Libro' },
        { field: 'edicion_realizada', value: 'no', fuente: 'Libro' },
      ])]);
    expect(rows[0].pts).toBe(30);
    const mine = await t.q<{ status: string; user_id: string; fuente: string }>('postgres',
      `select status, user_id, payload->>'fuente' as fuente from public.contributions where festival = 'chubut' and year = 1937`);
    expect(mine).toHaveLength(3);
    expect(mine.every((r) => r.status === 'approved' && r.user_id === u && r.fuente === 'Libro')).toBe(true);
    expect(await points(u)).toBe(30);
    expect(await badges(u)).toContain('primer-aporte');
    const ed = await t.q<{ status: string }>('postgres', `select status from public.editions where festival = 'chubut' and year = 1937`);
    expect(ed[0].status).toBe('not_held');
  });

  it('non-admins cannot call it', async () => {
    const u = await t.createUser();
    await expect(t.q(u, 'select public.admin_add_facts($1, $2, $3, $4::jsonb)', [u, 'chubut', 1937, facts(2)])).rejects.toThrow(/not_admin/);
    expect(await t.q('postgres', 'select id from public.contributions')).toEqual([]);
  });

  it('rejects an empty list, a missing edition, or a non-fact payload', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    await expect(t.q(admin, 'select public.admin_add_facts($1, $2, $3, $4::jsonb)', [u, 'chubut', 1937, '[]'])).rejects.toThrow(/invalid_value/);
    await expect(t.q(admin, 'select public.admin_add_facts($1, $2, $3, $4::jsonb)', [u, null, 1937, facts(1)])).rejects.toThrow(/edition_required/);
    await expect(t.q(admin, 'select public.admin_add_facts($1, $2, $3, $4::jsonb)', [u, 'chubut', 1937, JSON.stringify([{ value: 'x' }])])).rejects.toThrow(/invalid_value/);
    expect(await t.q('postgres', 'select id from public.contributions')).toEqual([]);
  });

  it('admins are not held to the daily limit; others are, all or nothing', async () => {
    const admin = await t.createAdmin();
    for (let i = 0; i < 31; i++) await contribute(admin, { user_id: admin });
    const u = await t.createUser();
    for (let i = 0; i < 25; i++) await contribute(u, { user_id: u });
    const values = Array.from({ length: 10 }, (_, i) => `($1, 'fact', 'chubut', 1937, null, '{"field":"other","value":"v${i}"}', 'pending')`).join(', ');
    await expect(t.q(u, `insert into public.contributions (user_id, type, festival, year, item_id, payload, status) values ${values}`, [u])).rejects.toThrow(/daily_limit/);
    const left = await t.q<{ n: number }>('postgres', 'select count(*)::int as n from public.contributions where user_id = $1', [u]);
    expect(left[0].n).toBe(25);
  });
});

describe('credited facts and the credited person\'s daily limit', () => {
  it('facts an admin credits to someone do not use up that person\'s 30 per day', async () => {
    const admin = await t.createAdmin();
    const u = await t.createUser();
    const facts = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ field: 'other', value: `Dato ${i}` })));
    await t.q(admin, 'select public.admin_add_facts($1, $2, $3, $4::jsonb)', [u, 'chubut', 1937, facts]);
    await expect(contribute(u, { user_id: u })).resolves.toBeTypeOf('string');
  });

  it('contributors cannot set who created a row', async () => {
    const u = await t.createUser();
    const other = await t.createUser();
    await expect(t.q(u, `insert into public.contributions (user_id, type, festival, year, payload, status, created_by)
      values ($1, 'memory', 'chubut', 2024, '{"text":"x"}', 'pending', $2)`, [u, other])).rejects.toThrow();
  });
});


describe('admin contributions are approved on submit', () => {
  it("an admin's own contribution is approved at once, with points and the admin as reviewer", async () => {
    const admin = await t.createAdmin();
    const id = await contribute(admin, { user_id: admin, type: 'tag', item_id: 'fcb0d30de6eb', year: 1996, payload: { year: 1986 } });
    const row = await t.q<{ status: string; reviewer_id: string; points_awarded: number; reviewed: boolean }>(
      'postgres', 'select status, reviewer_id, points_awarded, reviewed_at is not null as reviewed from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ status: 'approved', reviewer_id: admin, points_awarded: 2, reviewed: true }]);
    expect(await points(admin)).toBe(2);
    // and it is public straight away
    const pub = await t.q('anon', 'select id from public.public_contributions where id = $1', [id]);
    expect(pub).toHaveLength(1);
  });

  it("an admin's 'no se realizó' fact updates the edition at once", async () => {
    const admin = await t.createAdmin();
    await contribute(admin, { user_id: admin, type: 'fact', festival: 'mimosa', year: 2020, payload: { field: 'edicion_realizada', value: 'no' } });
    const ed = await t.q('postgres', "select status from public.editions where festival = 'mimosa' and year = 2020");
    expect(ed).toEqual([{ status: 'not_held' }]);
  });

  it("a regular user's contribution still waits for review", async () => {
    const u = await t.createUser();
    const id = await contribute(u, { user_id: u, type: 'tag', item_id: 'x', payload: { year: 1986 } });
    const row = await t.q('postgres', 'select status from public.contributions where id = $1', [id]);
    expect(row).toEqual([{ status: 'pending' }]);
  });
});

describe('admin_add_facts with auto-approval', () => {
  it('an admin crediting themself gets each fact approved once, with its points', async () => {
    const admin = await t.createAdmin();
    const rows = await t.q<{ pts: number }>(admin, 'select public.admin_add_facts($1, $2, $3, $4) as pts',
      [admin, 'chubut', 2010, JSON.stringify([{ field: 'ganador_silla', value: 'Esyllt Nest Roberts de Lewis' }])]);
    expect(rows[0].pts).toBe(10);
    expect(await points(admin)).toBe(10);
    const st = await t.q('postgres', "select status from public.contributions where user_id = $1 and type = 'fact'", [admin]);
    expect(st).toEqual([{ status: 'approved' }]);
  });
});

describe('sign-in stats', () => {
  const signIn = (uid: string, at: string | null) =>
    t.q('postgres', 'update auth.users set last_sign_in_at = $2 where id = $1', [uid, at]);
  const hours = () =>
    t.q<{ hour: Date; n: number }>('postgres', 'select hour, n from public.signin_hours order by hour');

  it('a sign-in bumps its hour; repeats in the same hour add up', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await signIn(a, '2026-11-14T10:05:00Z');
    await signIn(b, '2026-11-14T10:40:00Z');
    const rows = await hours();
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].hour).toISOString()).toBe('2026-11-14T10:00:00.000Z');
    expect(rows[0].n).toBe(2);
  });

  it('an unchanged or null last_sign_in_at counts nothing', async () => {
    const a = await t.createUser();
    await signIn(a, '2026-11-14T10:05:00Z');
    await signIn(a, '2026-11-14T10:05:00Z');
    await signIn(a, null);
    const rows = await hours();
    expect(rows.map((r) => r.n)).toEqual([1]);
  });

  it('signin_hours stores no user id', async () => {
    const cols = await t.q<{ column_name: string }>(
      'postgres',
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'signin_hours' order by ordinal_position`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(['hour', 'n']);
  });

  it('only admins read the stats', async () => {
    const u = await t.createUser();
    const admin = await t.createAdmin();
    await signIn(u, new Date().toISOString());
    for (const who of ['anon', u]) {
      await expect(t.q(who, 'select * from public.signin_hours')).rejects.toThrow();
      await expect(t.q(who, 'select * from public.admin_signin_stats(90)')).rejects.toThrow();
    }
    const rows = await t.q<{ hour: Date; n: number }>(admin, 'select * from public.admin_signin_stats(90)');
    expect(rows).toHaveLength(1);
    expect(rows[0].n).toBe(1);
  });

  it('days is clamped', async () => {
    const admin = await t.createAdmin();
    await expect(t.q(admin, 'select * from public.admin_signin_stats(0)')).resolves.toEqual([]);
    await expect(t.q(admin, 'select * from public.admin_signin_stats(10000)')).resolves.toEqual([]);
  });
});
