# Complete Programa, Cover and Pending Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Green needs a contributor-declared and admin-confirmed complete programa; an approved cover ("tapa") identifies each edition; contributors see their own pending contributions on the edition page.

**Architecture:** Contributors answer `alcance` in the upload form (`src/lib/contrib.ts` validates). Admins confirm `complete` / `tapa` flags that `approveUpload` (`src/lib/admin.ts`) merges via the existing `payload_override`. `stateOf` (`src/lib/uploads.ts`) and a new `editionCover` (`src/lib/catalog.ts`) read those flags at build time. `src/scripts/edicion.ts` reads the signed-in user's own pending rows and renders them as draft cards.

**Tech Stack:** Astro (static), TypeScript, Supabase JS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-complete-programa-and-pending-design.md`

## Global Constraints

- `payload.alcance ∈ 'completo' | 'tapa' | 'parcial'`, required only when `category === 'programa'`, dropped otherwise.
- Admin flags written on approval: `payload.complete: boolean`, `payload.tapa: boolean` (programa uploads only). Defaults: `complete = alcance === 'completo'`, `tapa = alcance === 'tapa'`.
- Upload coverage: `full` only if category `programa` AND it has pages AND `payload.complete === true`; any other upload is `some`. Catalog rule (programa PDF = full) unchanged.
- Cover order: (1) the latest-`reviewed_at` approved upload with `tapa === true`; (2) the edition's non-restricted catalog `programa` PDF, page 1; (3) an approved upload with `complete === true`, page 1; else none.
- Cover used in the year page header (large, page image) and as the first timeline thumbnail (thumb image, no duplicate). Never on the home grid.
- Pending drafts: only the signed-in user's own rows (`user_id = uid`, also for admins), `status = 'pending'`, never counted in coverage, never shown to others.
- Storage: owner read of `uploads/<uid>/…` already exists (`uploads_select_own`, migration `20261113000005`); no migration in this plan.
- Copy es-AR voseo, exact strings:
  - `contrib.alcance_label` "¿Qué estás subiendo?"; `contrib.alcances.completo` "El programa completo"; `contrib.alcances.tapa` "Solo la tapa"; `contrib.alcances.parcial` "Algunas páginas"; `contrib.error.alcance` "Contanos qué parte del programa estás subiendo."
  - `admin.completo` "Programa completo (todas las páginas, legibles)"; `admin.es_tapa` "Es la tapa (identifica la edición)"; `admin.dijo` "Según quien lo subió: {alcance}"
  - `edicion.tapa_alt` "Tapa del programa de {festival} {year}"; `edicion.pendiente` "Pendiente de revisión"; `edicion.pendientes_titulo` "Tus aportes en revisión"

## Review Focus

- An admin reviewing their **own** pending upload, or another user's, on an edition page: only rows with `user_id = uid` render as drafts. Test in Task 5.
- A programa approved before this change (no `complete` key) shows yellow, and never becomes a fallback cover. Test in Task 1 and Task 3.
- A restricted catalog programa never supplies a cover (its files are not published). Test in Task 3.
- Pending upload whose original is a PDF: card shows a file label, no `<img>` with a PDF URL. Test in Task 5.
- Signed out or offline on an edition page: no request for pending rows fails loudly; the static page is unchanged. Test in Task 5.

---

### Task 1: Contributor declares what they upload; green needs `complete`

**Files:**
- Modify: `src/lib/contrib.ts:105-118` (`validate` upload case; add `ALCANCES`)
- Modify: `src/lib/uploads.ts:50-54` (`stateOf`)
- Modify: `src/pages/contribuir.astro:57-67, 192-197` (radio group, `inputFor`)
- Modify: `src/i18n/es-AR.json` (`contrib.*` keys above)
- Test: `tests-js/contrib.test.ts`, `tests-js/uploads.test.ts`, `tests-js/build.test.ts`

**Interfaces:**
- Produces: `export const ALCANCES = ['completo', 'tapa', 'parcial'] as const; export type Alcance = typeof ALCANCES[number];` in `contrib.ts`. Upload payload `{ category, description?, alcance? }`.

- [ ] **Step 1: Tests**

```ts
// contrib.test.ts
it('upload: programa needs alcance; other categories drop it', () => {
  const f = file('image/jpeg', 10);
  expect(validate('upload', { file: f, category: 'programa' })).toEqual({ ok: false, key: 'contrib.error.alcance' });
  expect(validate('upload', { file: f, category: 'programa', alcance: 'quizás' })).toEqual({ ok: false, key: 'contrib.error.alcance' });
  expect(validate('upload', { file: f, category: 'programa', alcance: 'tapa' })).toEqual({ ok: true, payload: { category: 'programa', alcance: 'tapa' } });
  expect(validate('upload', { file: f, category: 'bases', alcance: 'tapa' })).toEqual({ ok: true, payload: { category: 'bases' } });
});
// uploads.test.ts — `up()` builds an approved programa with media
it('a programa upload is full only when an admin confirmed complete', () => {
  expect(uploadState([up()], 'chubut', 1995)).toBe('some');
  expect(uploadState([up({ payload: { category: 'programa', media: media(), complete: true } })], 'chubut', 1995)).toBe('full');
  expect(uploadState([up({ payload: { category: 'programa', media: media(), tapa: true } })], 'chubut', 1995)).toBe('some');
});
// build.test.ts
it('upload form asks what part of the programa is uploaded', () => {
  const html = read('contribuir/index.html');
  for (const v of ['completo', 'tapa', 'parcial']) expect(html).toContain(`name="alcance" value="${v}"`);
});
```

Update the existing upload `full` expectations in `uploads.test.ts` (`'full'` for `up()` at lines 48 and 76) to pass `complete: true` in the payload.

- [ ] **Step 2: Run `npx vitest run tests-js/contrib.test.ts tests-js/uploads.test.ts`** — Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** validation (`fail('alcance')`), `stateOf` (`payload.complete === true`), and the form: a `<fieldset id="c-alcance" hidden>` with a legend and three radios `name="alcance"`, shown and required only while `#c-category` is `programa`; `inputFor('upload')` adds `alcance: s('alcance')`.
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass.
- [ ] **Step 5: Commit** `uploads: contributor says what part of the programa; green needs confirmed complete`

### Task 2: Admin confirms `complete` and `tapa`

**Files:**
- Modify: `src/lib/admin.ts` (`UploadOpts`, `approveUpload` override; add `reviewFlags`)
- Modify: `src/scripts/admin.ts:117-135, 173-176` (two checkboxes and the contributor's answer for programa uploads)
- Modify: `src/i18n/es-AR.json` (`admin.*` keys above)
- Test: `tests-js/admin.test.ts`

**Interfaces:**
- Consumes: `Alcance` (Task 1).
- Produces: `export type ReviewFlags = { complete: boolean; tapa: boolean }`; `export function reviewFlags(c: Pending): ReviewFlags | null` (null for non-programa); `UploadOpts.flags?: ReviewFlags`. `approveUpload` sends `payload_override: { media, ...flags }` when `flags` is given, `{ media }` otherwise.

- [ ] **Step 1: Tests**

```ts
it('reviewFlags defaults from what the contributor said', () => {
  const p = (payload: any) => ({ ...upload, payload: { storage_path: 'u/x.jpg', ...payload } });
  expect(reviewFlags(p({ category: 'programa', alcance: 'completo' }))).toEqual({ complete: true, tapa: false });
  expect(reviewFlags(p({ category: 'programa', alcance: 'tapa' }))).toEqual({ complete: false, tapa: true });
  expect(reviewFlags(p({ category: 'programa' }))).toEqual({ complete: false, tapa: false });
  expect(reviewFlags(p({ category: 'bases' }))).toBeNull();
});
it('approveUpload merges the admin flags into the payload', async () => {
  // same setup as 'approveUpload calls storage then rpc with media payload'
  await approveUpload(upload, { client, fetchFn, make, gap: { catalog, approved: [] }, flags: { complete: true, tapa: false } });
  expect(rpcArgs.payload_override).toEqual({ media: { thumb: 'uploads/c1/thumb.webp', pages: ['uploads/c1/p01.webp', 'uploads/c1/p02.webp'] }, complete: true, tapa: false });
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/admin.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement** `reviewFlags`, `flags` in `approveUpload`; in `admin.ts`, for programa uploads render the `admin.dijo` line (alcance label, or nothing if absent) and the two checkboxes pre-set from `reviewFlags(c)`, and pass their current values as `flags` on approve.
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass.
- [ ] **Step 5: Commit** `admin: confirm complete and cover when approving a programa`

### Task 3: Choose each edition's cover

**Files:**
- Modify: `src/lib/catalog.ts` (add `editionCover`)
- Test: `tests-js/catalog.test.ts`

**Interfaces:**
- Consumes: `uploadMedia`, `mediaUrl` (`src/lib/uploads.ts`), `pageUrls`, `thumbUrl`.
- Produces: `export type Cover = { page: string; thumb: string }`; `export function editionCover(f: FestivalSlug, year: number, uploads: UploadLike[] = APPROVED_UPLOADS, mediaBase: string | undefined = import.meta.env.PUBLIC_SUPABASE_URL): Cover | null`. Upload covers: `page = mediaUrl(pages[0])`, `thumb = mediaUrl(thumb) ?? page`. Catalog cover: `page = pageUrls(item)[0]`, `thumb = thumbUrl(item) ?? page`. `UploadLike` gains optional `reviewed_at?: string | null`.

- [ ] **Step 1: Tests** (fixture: `000000000001` is the chubut 1990 programa PDF; base `'https://x.supabase.co'`)

```ts
const B = 'https://x.supabase.co';
const upl = (id: string, payload: any, reviewed_at = '2026-01-01') => ({ id, type: 'upload', festival: 'chubut', year: 1990, reviewed_at,
  payload: { category: 'programa', media: { thumb: `uploads/${id}/thumb.webp`, pages: [`uploads/${id}/p01.webp`] }, ...payload } });
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
it('editionCover: latest approved tapa wins over the catalog programa', () => {
  const c = editionCover('chubut', 1990, [upl(U1, { tapa: true }, '2026-01-01'), upl(U2, { tapa: true }, '2026-03-01')], B);
  expect(c?.page).toBe(`${B}/storage/v1/object/public/media/uploads/${U2}/p01.webp`);
});
it('editionCover: falls back to page 1 of the catalog programa, then a complete upload', () => {
  expect(editionCover('chubut', 1990, [], B)?.page).toMatch(/\/media\/aaaaaaaaaaaa\/p01\.webp$/);
  expect(editionCover('chubut', 1993, [{ ...upl(U1, { complete: true }), year: 1993 }], B)?.page).toContain(`uploads/${U1}/p01.webp`);
  expect(editionCover('chubut', 1993, [{ ...upl(U1, {}), year: 1993 }], B)).toBeNull();
});
it('editionCover: a restricted catalog programa never supplies a cover', () => {
  setItems([mk({ id: '000000000009', year: 1990, category: 'programa', kind: 'pdf', restricted: true })]);
  expect(editionCover('chubut', 1990, [], B)).toBeNull();
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/catalog.test.ts`** — Expected: FAIL (`editionCover` missing).
- [ ] **Step 3: Implement `editionCover`** per Global Constraints order.
- [ ] **Step 4: Run it again** — Expected: PASS.
- [ ] **Step 5: Commit** `catalog: pick each edition's cover`

### Task 4: Show the cover on the year page and first in the timeline

**Files:**
- Modify: `src/pages/[festival]/[year].astro:60-76` (header)
- Modify: `src/pages/[festival]/index.astro:16-24` (`row` thumbs)
- Modify: `src/styles/global.css` (`.tapa` in `.cover`)
- Modify: `src/i18n/es-AR.json` (`edicion.tapa_alt`)
- Test: `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `editionCover` (Task 3).

- [ ] **Step 1: Build assertions**, data-driven: take the first catalog item with `category === 'programa' && kind === 'pdf' && !restricted`; its year page (`<festival>/<year>/index.html`) contains `class="tapa"` and `src="/media/<its page_paths[0]>"`; the festival page's row for that year has `media/<its thumb>` as its first `<img>`.
- [ ] **Step 2: Run `npx vitest run tests-js/build.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement**: header `<img class="tapa" src={cover.page} alt={t('edicion.tapa_alt', …)} width/height omitted, loading="eager">` linking to the page image; timeline `thumbs` = cover thumb first, then the existing list without that src, still max 4. Style: `.cover .tapa { max-width: min(100%, 18rem); height: auto; box-shadow / border like item thumbs }`.
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass; check `/chubut/<that year>/` at 375px and ≥768px in `astro preview`.
- [ ] **Step 5: Commit** `edition: show the cover in the header and first in the timeline`

### Task 5: Contributors see their own pending contributions

**Files:**
- Modify: `src/lib/contrib.ts` (add `ownPending`, `pendingView`)
- Modify: `src/scripts/edicion.ts` (`hydrateEdition`: render drafts after the approved ones)
- Modify: `src/styles/global.css` (`.borrador` dashed card, `.pill-pending` moved here from `perfil.astro` so both pages share it)
- Modify: `src/i18n/es-AR.json` (`edicion.pendiente`, `edicion.pendientes_titulo`)
- Test: `tests-js/contrib.test.ts`

**Interfaces:**
- Produces:
  - `export async function ownPending(festival: string, year: number, client: SupabaseClient | null = getClient()): Promise<Contribution[]>` — `[]` when no client, no session, error or timeout (use `liveQuery`); queries `contributions` with `.eq('user_id', uid).eq('status', 'pending').eq('festival', festival).eq('year', year).in('type', ['fact', 'memory', 'upload'])`.
  - `export function pendingView(c: Contribution): { section: 'hechos' | 'recuerdos' | 'aportes'; text: string; preview: 'image' | 'pdf' | null; path: string | null }` — `text`: fact via `factDisplay` as "label: value", memory text, upload description or category label; `preview` from `payload.storage_path` extension (jpg/jpeg/png/webp → image, pdf → pdf).

- [ ] **Step 1: Tests** — extend the existing `fakeClient` in `contrib.test.ts` with a `select` chain that records every `.eq(col, val)` and returns `opts.rows`:

```ts
it('ownPending filters on the signed-in user, pending, and the edition', async () => {
  const a = fakeClient({ uid: 'user-1', rows: [{ id: 'p1', type: 'memory', payload: { text: 'x' } }] });
  expect(await ownPending('chubut', 1930, a.client)).toHaveLength(1);
  expect(a.eqs).toEqual(expect.arrayContaining([['user_id', 'user-1'], ['status', 'pending'], ['festival', 'chubut'], ['year', 1930]]));
});
it('ownPending is empty signed out or offline', async () => {
  expect(await ownPending('chubut', 1930, fakeClient({ uid: null }).client)).toEqual([]);
  expect(await ownPending('chubut', 1930, null)).toEqual([]);
});
it('pendingView sorts each kind into its section and previews only images', () => {
  const mk = (type: string, payload: any) => ({ id: 'x', type, festival: 'chubut', year: 1930, item_id: null, payload, created_at: '', reviewed_at: null, display_name: null }) as any;
  expect(pendingView(mk('upload', { category: 'programa', storage_path: 'u/a.JPG' }))).toMatchObject({ section: 'aportes', preview: 'image', path: 'u/a.JPG' });
  expect(pendingView(mk('upload', { category: 'bases', storage_path: 'u/a.pdf', description: 'Bases' }))).toMatchObject({ section: 'aportes', preview: 'pdf', text: 'Bases' });
  expect(pendingView(mk('memory', { text: 'Un recuerdo' }))).toMatchObject({ section: 'recuerdos', text: 'Un recuerdo', preview: null });
  expect(pendingView(mk('fact', { field: 'venue', value: 'Trelew' })).section).toBe('hechos');
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/contrib.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement** both helpers. In `edicion.ts`, after rendering approved rows (also on the offline branch), call `ownPending`; for each row append to its section's mount a `<div class="borrador">` holding a `.pill.pill-pending` "Pendiente de revisión", the text, and for `preview === 'image'` an `<img>` from `signedUrl(path)` (`src/lib/admin.ts`, bucket `uploads`), for `pdf` a file-name label. Group under an `h3` `edicion.pendientes_titulo` in `#aportes`. Sections' `island-section` must become visible when only drafts exist (they append into the mount, so `:has([data-island]:empty)` stops hiding them).
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass.
- [ ] **Step 5: Commit** `edition: contributors see their own pending contributions as drafts`
