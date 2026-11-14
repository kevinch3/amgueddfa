# Bulk Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contributors send several facts (with a public Fuente) in one submission; admins approve them as a group, and can publish facts directly credited to someone else.

**Architecture:** `src/lib/contrib.ts` gains `fuente` validation, `submitFacts` (one array insert sharing `payload.lote`) and `sourceLine`. A shared fact editor (`src/components/FactEditor.astro` + `src/scripts/fact-editor.ts`) powers `/contribuir` and a new admin tab. `src/lib/admin.ts` gains `groupQueue`, `approveAll`, `rejectAll`, `adminAddFacts`; a migration adds `admin_add_facts()` and exempts admins from `limit_daily`.

**Tech Stack:** Astro, TypeScript, Supabase (Postgres functions, RLS), Vitest, PGlite DB tests.

**Spec:** `docs/superpowers/specs/2026-11-14-bulk-facts-design.md`

## Global Constraints

- `MAX_FACTS = 15` facts per contributor submission; admin direct load accepts 1–50.
- `payload.fuente`: optional trimmed text, ≤ 200 chars, same for every fact of a submission; shown publicly as `Fuente: {fuente}`.
- `payload.lote`: uuid shared by the facts of one submission (contributor or admin load); a single fact sent alone gets no `lote`.
- A contributor submission is one `insert([...])`: all rows or none (daily limit, validation).
- Admins are exempt from the 30-per-24h `limit_daily`; non-admins are not.
- `admin_add_facts(target uuid, p_festival text, p_year int, facts jsonb) returns int`: admin-only (`not_admin`), facts is a JSON array of fact payloads; inserts as `target` (status pending) then `approve_contribution(id, false, null)` each; returns total points.
- Copy (es-AR voseo), exact:
  - `contrib.fuente_label` "Fuente (opcional)"; `contrib.fuente_ayuda` "Libro, diario o persona de donde sale el dato. Se muestra junto al dato."; `contrib.agregar_otro` "+ Agregar otro dato"; `contrib.lista_titulo` "Datos para enviar ({n})"; `contrib.quitar` "Quitar"; `contrib.error.demasiados` "Podés mandar hasta 15 datos por vez."; `contrib.error.fuente` "La fuente puede tener hasta 200 caracteres."
  - `edicion.fuente` "Fuente: {fuente}"
  - `admin.grupo` "{n} datos enviados juntos"; `admin.aprobar_todos` "Aprobar todos ({n})"; `admin.rechazar_todos` "Rechazar todos"; `admin.tabs.cargar` "Cargar datos"; `admin.acreditar` "Acreditar a"; `admin.publicar` "Publicar"; `admin.publicados` "Listo: se publicaron {n} datos."

## Review Focus

- A contributor sends 15 facts when they have 20 left of the daily 30 → all 15 saved; with 10 left → none saved and the `contrib.error.limite` message. DB test in Task 5 (limit) and unit test in Task 2 (error mapping).
- "Aprobar todos" where one fact fails (e.g. invalid `edicion_realizada`): the others stay approved, the failed one stays in the list with its error, the group does not vanish. Test in Task 4.
- A non-admin calling `admin_add_facts` directly via RPC → `not_admin`, nothing inserted. DB test in Task 5.
- "Enviar" with an empty editor and an empty list → the existing "elegí un dato" error, nothing sent; with only a filled editor → behaves as today (single fact, no `lote`). Test in Task 2.
- Fuente with only spaces → treated as absent (no "Fuente:" line). Test in Task 1.

---

### Task 1: Fuente on facts, shown publicly

**Files:**
- Modify: `src/lib/contrib.ts` (`validateFact`, add `sourceLine`)
- Modify: `src/scripts/edicion.ts` (`renderFacts`), `src/pages/[festival]/[year].astro` (static facts list)
- Modify: `src/i18n/es-AR.json` (`edicion.fuente`, `contrib.error.fuente`)
- Test: `tests-js/contrib.test.ts`

**Interfaces:**
- Produces: `validate('fact', { …, fuente })` keeps `fuente` (trimmed, ≤ 200, dropped if empty). `export function sourceLine(c: Contribution): string | null` → `t('edicion.fuente', { fuente })` or null.

- [ ] **Step 1: Tests**

```ts
it('fact: optional fuente is kept trimmed, dropped when blank, capped at 200', () => {
  expect(validate('fact', { field: 'venue', value: 'Salón San David', fuente: '  Libro de M. H. Jones ' }))
    .toEqual({ ok: true, payload: { field: 'venue', value: 'Salón San David', fuente: 'Libro de M. H. Jones' } });
  expect(validate('fact', { field: 'venue', value: 'X', fuente: '   ' })).toEqual({ ok: true, payload: { field: 'venue', value: 'X' } });
  expect(validate('fact', { field: 'venue', value: 'X', fuente: 'a'.repeat(201) })).toEqual({ ok: false, key: 'contrib.error.fuente' });
  expect(validate('fact', { field: 'competencia', numero: '1', descripcion: 'Coro', fuente: 'Libro' }))
    .toEqual({ ok: true, payload: { field: 'competencia', numero: '1', descripcion: 'Coro', fuente: 'Libro' } });
});
it('sourceLine shows the fuente of a fact', () => {
  const mk = (payload: any) => ({ id: 'x', type: 'fact', festival: 'chubut', year: 1937, item_id: null, payload, created_at: '', reviewed_at: null, display_name: null }) as Contribution;
  expect(sourceLine(mk({ field: 'venue', value: 'X', fuente: 'Libro' }))).toBe('Fuente: Libro');
  expect(sourceLine(mk({ field: 'venue', value: 'X' }))).toBeNull();
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/contrib.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement**; render `sourceLine` as `<span class="muted small fuente">` after the value in `renderFacts` and the static `[year].astro` facts (`facts` map gains `fuente`).
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass.
- [ ] **Step 5: Commit** `facts: optional public Fuente`

### Task 2: `submitFacts` — several facts, one insert

**Files:**
- Modify: `src/lib/contrib.ts`
- Modify: `src/i18n/es-AR.json` (`contrib.error.demasiados`)
- Test: `tests-js/contrib.test.ts`

**Interfaces:**
- Produces: `export const MAX_FACTS = 15`; `export async function submitFacts(festival: FestivalSlug, year: number, facts: Record<string, unknown>[], fuente: string, client?: SupabaseClient | null): Promise<Result & { index?: number }>` — validates each with `validate('fact', { ...f, fuente })`, on failure returns `{ ok: false, key, index }`; empty list → `contrib.error.campo`; > 15 → `contrib.error.demasiados`; one fact → payload without `lote`; several → shared `lote: uuid()`. Inserts all rows in one `insert([...])`; errors mapped like `submit` (daily limit → `contrib.error.limite`).

- [ ] **Step 1: Tests** (extend the fake's `insert` to record arrays)

```ts
it('submitFacts inserts all facts at once with a shared lote and fuente', async () => {
  const { client, inserts } = fakeClient();
  const r = await submitFacts('chubut', 1937, [{ field: 'venue', value: 'Salón San David' }, { field: 'ganador_silla', value: 'E. M. Roberts' }], 'Libro', client);
  expect(r).toEqual({ ok: true });
  expect(inserts).toHaveLength(1);
  const rows = inserts[0].row as any[];
  expect(rows).toHaveLength(2);
  expect(rows[0].payload.lote).toMatch(/^[0-9a-f-]{36}$/);
  expect(rows[1].payload.lote).toBe(rows[0].payload.lote);
  expect(rows.every((x) => x.payload.fuente === 'Libro' && x.status === 'pending' && x.type === 'fact')).toBe(true);
});
it('submitFacts: a single fact has no lote; errors carry the index', async () => {
  const one = fakeClient();
  await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }], '', one.client);
  expect((one.inserts[0].row as any[])[0].payload).toEqual({ field: 'venue', value: 'X' });
  expect(await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }, { field: 'start_date', value: '1937-02-30' }], '', fakeClient().client))
    .toEqual({ ok: false, key: 'contrib.error.fecha', index: 1 });
  expect(await submitFacts('chubut', 1937, [], '', fakeClient().client)).toEqual({ ok: false, key: 'contrib.error.campo' });
  expect(await submitFacts('chubut', 1937, Array(16).fill({ field: 'venue', value: 'X' }), '', fakeClient().client)).toEqual({ ok: false, key: 'contrib.error.demasiados' });
  expect(await submitFacts('chubut', 1937, [{ field: 'venue', value: 'X' }], '', fakeClient({ insertError: { message: 'daily_limit' } }).client)).toEqual({ ok: false, key: 'contrib.error.limite' });
});
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (reuse `submit`'s session and error mapping; extract a private helper rather than duplicating). **Step 4: Run `npx vitest run`** — PASS. **Step 5: Commit** `contrib: send several facts in one submission`

### Task 3: Shared fact editor with a list, in `/contribuir`

**Files:**
- Create: `src/components/FactEditor.astro` (the Datos fields now in `contribuir.astro:81-126`, ids prefixed by a `prefix` prop, plus Fuente, the list `<ol>` and the "+ Agregar otro dato" button)
- Create: `src/scripts/fact-editor.ts`
- Modify: `src/pages/contribuir.astro` (use the component; Datos submit calls `submitFacts`)
- Modify: `src/styles/global.css`, `src/i18n/es-AR.json` (`contrib.*` keys above)
- Test: `tests-js/build.test.ts`; browser check via headless Chrome (CDP script as used before in the scratchpad)

**Interfaces:**
- Consumes: `validate`, `factDisplay`, `isoFromParts`, `longDate`, `submitFacts`, `MAX_FACTS`.
- Produces: `export function mountFactEditor(root: HTMLElement, opts: { yearInput?: HTMLInputElement }): { collect(): { facts: Record<string, unknown>[]; fuente: string } | { error: string; index?: number }; reset(): void }` — `collect` returns the list plus the editor's fact when its field is chosen.

- [ ] **Step 1: Build assertions**: `contribuir/index.html` contains `+ Agregar otro dato`, `name="fuente"`, and still `name="date_month"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: move markup and the field/date sync logic out of `contribuir.astro` into the component/module (no behaviour change for one fact); "+ Agregar otro dato" validates via `validate('fact', …)`, shows the error key or appends `<li>{label}: {value} <button>Quitar</button></li>` and resets the editor; refuses beyond `MAX_FACTS`. Datos submit: `collect()` → `submitFacts(...)`; on `index` error, say the error with "Dato {index+1}".
- [ ] **Step 4: Run `npx vitest run`** — PASS. Then the CDP script: add two facts to the list, check the list shows 2 rows and the count reads "Datos para enviar (2)"; screenshot at 600px.
- [ ] **Step 5: Commit** `contribuir: add several facts to a list and send them together`

### Task 4: Groups in the admin queue

**Files:**
- Modify: `src/lib/admin.ts` (add `groupQueue`, `approveAll`, `rejectAll`)
- Modify: `src/scripts/admin.ts` (`renderQueue`)
- Modify: `src/i18n/es-AR.json` (`admin.grupo`, `admin.aprobar_todos`, `admin.rechazar_todos`)
- Test: `tests-js/admin.test.ts`

**Interfaces:**
- Produces: `export type QueueGroup = { lote: string | null; items: Pending[] }`; `export function groupQueue(list: Pending[]): QueueGroup[]` (keeps queue order by first item; items without `lote`, or a `lote` seen once, are their own group); `export async function approveAll(items: Pending[], client?): Promise<{ done: string[]; failed: { id: string; key: string }[] }>` (sequential `approve(c, null)`, continues after a failure); `rejectAll(items, reason, client?)` same shape via `reject`.

- [ ] **Step 1: Tests**: `groupQueue` on `[a(lote L), b(no lote), c(lote L), d(lote M)]` → `[{L:[a,c]}, {null:[b]}, {null:[d]}]`; `approveAll` with a fake rpc failing on the 2nd of 3 → `done` = 1st and 3rd ids, `failed` = 2nd with its mapped key; `rejectAll('', …)` → every item failed with `admin.error.motivo`, no rpc.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; in `renderQueue`, a group of ≥ 2 renders a header `admin.grupo` with the two group buttons above its cards; after `approveAll`, replace each done card with the existing "aprobado" message and leave failed cards with their error.
- [ ] **Step 4: Run `npx vitest run`** — PASS. **Step 5: Commit** `admin: approve or reject facts sent together as a group`

### Task 5: `admin_add_facts` and the admin exemption from the daily limit

**Files:**
- Create: `supabase/migrations/20261114000001_admin_bulk_facts.sql`
- Test: `supabase/tests/db.test.ts`

**Interfaces:**
- Produces: SQL per Global Constraints; `limit_daily()` replaced with an early `if public.is_admin() then return new; end if;`. `grant execute on function public.admin_add_facts(uuid, text, integer, jsonb) to authenticated`.

- [ ] **Step 1: DB tests**: admin adds 3 facts for user U → 3 approved rows owned by U, U's points +30, `primer-aporte` badge; an `edicion_realizada: no` fact sets `editions.status = not_held`; non-admin call → throws `not_admin`, 0 rows; admin inserts 31 own contributions in 24 h → allowed; user with 25 in 24 h inserting 10 in one statement → throws `daily_limit`, still 25.
- [ ] **Step 2: Run `npx vitest run supabase/tests/db.test.ts`** — FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run it again** — PASS; then `npx supabase db push` (project already linked) and confirm with `npx supabase migration list` that `20261114000001` is applied remotely.
- [ ] **Step 5: Commit** `db: admin_add_facts and admin exemption from the daily limit`

### Task 6: Admin "Cargar datos" tab

**Files:**
- Modify: `src/lib/admin.ts` (add `adminAddFacts`)
- Modify: `src/pages/admin.astro` (tab `cargar`: festival select, year, "Acreditar a" `<select>`, `<FactEditor prefix="a">`, "Publicar")
- Modify: `src/scripts/admin.ts` (load users into the select via `searchUsers('')`, default the signed-in admin from `currentProfile()`)
- Modify: `src/i18n/es-AR.json` (`admin.tabs.cargar`, `admin.acreditar`, `admin.publicar`, `admin.publicados`)
- Test: `tests-js/admin.test.ts`, `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `mountFactEditor` (Task 3), `validate`, `admin_add_facts` (Task 5).
- Produces: `export async function adminAddFacts(target: string, festival: FestivalSlug, year: number, facts: Record<string, unknown>[], fuente: string, client?): Promise<Result & { index?: number; points?: number }>` — validates each (`index` on error), 1–50 facts, adds shared `lote` when > 1 and `fuente`, calls rpc `admin_add_facts` with `{ target, p_festival, p_year, facts }`.

- [ ] **Step 1: Tests**: fake rpc receives `facts` with shared `lote` + `fuente` and the right target; validation error returns `index`; 0 or 51 facts rejected without rpc; rpc error `not_admin` maps via `mapRpcError`. Build: `admin/index.html` contains `Cargar datos` and `id="a-acreditar"`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run `npx vitest run`** — PASS; CDP check that the tab renders the editor.
- [ ] **Step 5: Commit** `admin: load facts directly, credited to anyone`
