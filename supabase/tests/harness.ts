// Test harness: an in-memory Postgres (PGlite) with a Supabase-like stub,
// then every migration in supabase/migrations applied in filename order.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

/** Who runs a query: the superuser, the anon role, or an authenticated user id. */
export type Who = 'postgres' | 'anon' | string;

export interface TestDb {
  db: PGlite;
  /** Run one statement as `who`, inside its own transaction (like one PostgREST request). */
  q<T = Record<string, unknown>>(who: Who, sql: string, params?: unknown[]): Promise<T[]>;
  /** Create an auth.users row (the signup trigger creates the profile). Returns its id. */
  createUser(email?: string): Promise<string>;
  /** Create a user and promote them to admin. */
  createAdmin(email?: string): Promise<string>;
  /** Apply the migrations left out by makeDb({ before }), in order. */
  migrateRest(): Promise<void>;
}

let counter = 0;

/** A database with every migration, or only those named before `before` (to test a migration on existing rows). */
export async function makeDb(opts: { before?: string } = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, 'stub.sql'), 'utf8'));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error('no migrations found');
  const now = opts.before ? files.filter((f) => f < opts.before!) : files;
  const rest = files.slice(now.length);
  for (const f of now) {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  async function migrateRest(): Promise<void> {
    for (const f of rest.splice(0)) await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }

  async function q<T>(who: Who, sql: string, params: unknown[] = []): Promise<T[]> {
    return db.transaction(async (tx) => {
      if (who !== 'postgres') {
        const role = who === 'anon' ? 'anon' : 'authenticated';
        await tx.exec(`set local role ${role}`);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          who === 'anon' ? '' : who,
        ]);
      }
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  async function createUser(email?: string): Promise<string> {
    counter += 1;
    const rows = await q<{ id: string }>(
      'postgres',
      'insert into auth.users (email) values ($1) returning id',
      [email ?? `user${counter}@example.test`],
    );
    return rows[0].id;
  }

  async function createAdmin(email?: string): Promise<string> {
    const id = await createUser(email);
    await q('postgres', `update public.profiles set role = 'admin' where id = $1`, [id]);
    return id;
  }

  return { db, q, createUser, createAdmin, migrateRest };
}
