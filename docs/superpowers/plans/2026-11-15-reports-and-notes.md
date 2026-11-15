# Reports and notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People report a wrong video or document (what's wrong + proposed fix) and add notes to documents; admins approve; structured fixes (hide, move) apply live and at every build.

**Architecture:** Two new contribution types (`report`, `note`) in the existing `contributions` table and review queue. One pure overlay per target, run at build time from `data/approved/contributions.json` and in the browser from live approvals: documents through `applyTags` (now also reading reports and a `hidden` flag), videos through a new `applyVideoReports`. UI is the existing vanilla-TS island pattern.

**Tech Stack:** Astro 7 static site, TypeScript islands, Supabase (Postgres + RLS), Vitest, PGlite for DB tests.

**Spec:** `docs/superpowers/specs/2026-11-15-reports-and-notes-design.md`

## Global Constraints

- `contributions.type` ∈ `upload, fact, tag, transcription, memory, report, note`.
- Report payload: `objetivo` ∈ `documento | video`; `problema` ∈ `no_corresponde | otra_edicion | otro`; `texto` 10–1000 chars, required; `arreglo` `{ festival?, year?, category? }` required for `otra_edicion` (category only for documents), at least one field set and different from where it is now; video reports also carry `video: { id, title, channel, kind }`; document reports use `item_id`, video reports `item_id = null`.
- Note payload: `{ text }`, 10–1000 chars; `item_id` required.
- Points: report 10, note 5. Approved reports count toward Ojo de lince together with tags (≥ 50).
- `public_contributions` (and so the export) never carries a report's `texto`.
- Hidden things are never deleted: hidden videos stay in `videos.json`, hidden documents keep `/item/<id>/` (with a notice, `noindex`).
- Copy is es-AR with vos; visible text says "eisteddfod", never "festival".
- Commits: no Claude / AI trailers or co-author lines. Commit straight to `main` after each task (user: "merge as you go").

## Review Focus

- A report on a video or document that a later approved report moves again: the latest approval wins, at build and live (test in Task 3).
- A video moved live into an edition page that had no videos: the section must appear with its heading and count (test in Task 5).
- An admin's own report is approved on insert (existing trigger) and must apply at once, with no extra step (test in Task 1).
- `otra_edicion` with an `arreglo` equal to the current placement must be refused before sending (test in Task 2).
- A hidden document must vanish from edition lists, coverage, the home grid, `/tareas`, the sitemap and `/datos/documentos.json`, but its item page still builds (test in Task 4).

---

### Task 1: Database: new types, points, badge, private explanation

**Files:**
- Create: `supabase/migrations/20261117000001_reports_notes.sql`
- Test: `supabase/tests/db.test.ts`

**Interfaces:**
- Produces: rows of type `report` / `note` accepted by RLS insert; `approve_contribution` returns 10 / 5 for them; `public_contributions.payload` without `texto` for reports.

- [ ] **Step 1: Write failing tests** in a new `describe('reports and notes', …)`:
  - `it('accepts report and note rows, scoring 10 and 5')`: insert one of each as a user, approve as admin → `approve()` returns 10 then 5, `points(u) === 15`.
  - `it('the public view and so the export drop a report\'s explanation')`: approved report with payload `{ objetivo: 'video', problema: 'no_corresponde', texto: 'Es del Eisteddfod de Gales', video: { id: 'MKRCg__AXC8' } }` → `select payload from public.public_contributions` as anon has no `texto` key and keeps `problema` and `video`.
  - `it('approved reports count toward ojo-de-lince with tags')`: 30 approved tags + 20 approved reports → `badges(u)` contains `ojo-de-lince`; 49 total does not.
  - `it('an admin\'s own report is approved on insert')`: `contribute(admin, { type: 'report', … })` → its row has `status = 'approved'`, `points_awarded = 10`.
  - Extend `scores each type per the global constraints` cases with `['report', false, 10]` and `['note', false, 5]` (total becomes 67).
- [ ] **Step 2: Run** `npx vitest run supabase/tests/db.test.ts` → FAIL (check constraint violation).
- [ ] **Step 3: Write the migration.** Drop and re-add the type check (`contributions_type_check`) with the seven types; `create or replace function public.approve_contribution` copied from `20261113000003_functions.sql` with `when 'report' then 10 when 'note' then 5` added to the points case; `create or replace function public.award_badges` with the ojo-de-lince count over `type in ('tag', 'report')`; `create or replace view public.public_contributions` with the payload expression `case when c.type = 'upload' then c.payload - 'storage_path' when c.type = 'report' then c.payload - 'texto' else c.payload end` (same columns, same grants re-applied).
- [ ] **Step 4: Run** `npx vitest run supabase/tests/db.test.ts` → PASS.
- [ ] **Step 5: Commit** `db: report and note contributions (10 and 5 points), report explanations stay private`.

### Task 2: Validation, types and labels

**Files:**
- Modify: `src/lib/contrib.ts` (`Kind`, `validate`, new constants), `src/lib/game.ts:31` (`POINTS`), `src/i18n/es-AR.json` (`admin.tipos`, `perfil.tipos`, `recientes.acciones`, `contrib.error.*`, new `informar.*`)
- Test: `tests-js/contrib.test.ts`

**Interfaces:**
- Produces: `type Kind = … | 'report' | 'note'`; `PROBLEMAS = ['no_corresponde', 'otra_edicion', 'otro'] as const`; `type Problema`; `REPORT_MIN = 10`, `REPORT_MAX = 1000`; `validate('report', { objetivo, problema, texto, arreglo?, video?, actual? })` where `actual: { festival, year, category? }` is only used to refuse a no-op move and is not kept in the payload; `validate('note', { text })`. Error keys: `contrib.error.objetivo`, `contrib.error.problema`, `contrib.error.texto_informe` (length), `contrib.error.arreglo` (missing / same as now / bad year or festival or category).

- [ ] **Step 1: Write failing tests**, `it('report: …')` and `it('note: 10 to 1000 characters')`:
  - Video `no_corresponde` with `video: { id: 'MKRCg__AXC8', title: 'Patagonia 150', channel: 'Y Wladfa 150', kind: 'sesion' }` and `texto: 'Es del Eisteddfod Genedlaethol de Gales'` → ok, payload equals `{ objetivo: 'video', problema: 'no_corresponde', texto: …, video: {…} }` (no `arreglo`, no `actual`).
  - `otra_edicion` without `arreglo` → `contrib.error.arreglo`; `arreglo: { festival: 'chubut', year: 2015 }` with `actual: { festival: 'chubut', year: 2015 }` → `contrib.error.arreglo`; `arreglo: { year: '2014' }` → payload `arreglo: { year: 2014 }`; video with `arreglo.category` → category dropped.
  - `texto` of 9 chars → `contrib.error.texto_informe`; `problema: 'x'` → `contrib.error.problema`; `objetivo: 'x'` → `contrib.error.objetivo`; video without `video.id` → `contrib.error.objetivo`.
  - `note` 9 chars / 1001 chars → `contrib.error.texto_informe`; 10 chars → `{ text }`.
  - The existing `every error key exists in es-AR.json` must still pass.
- [ ] **Step 2: Run** `npx vitest run tests-js/contrib.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `contrib.ts`, reusing `validateTag`'s year / category / festival checks for `arreglo`; add `report: 10, note: 5` to `POINTS`; add the labels "Error informado" / "Información" (admin, perfil) and "informó un error" / "agregó información a un documento" (recientes).
- [ ] **Step 4: Run** `npx vitest run tests-js/contrib.test.ts tests-js/i18n.test.ts` → PASS.
- [ ] **Step 5: Commit** `contrib: validate report and note contributions`.

### Task 3: Pure overlays (documents and videos)

**Files:**
- Modify: `src/lib/tags.ts`, `src/lib/placement.ts`, `src/lib/types.ts` (`Item.hidden?: boolean`), `src/lib/videos.ts`
- Test: `tests-js/tags.test.ts`, `tests-js/placement.test.ts`, `tests-js/videos.test.ts`

**Interfaces:**
- Produces:
  - `applyTags(items, rows)`: also applies approved rows with `type === 'report' && payload.objetivo === 'documento'`: `otra_edicion` → its `arreglo` fields like a tag; `no_corresponde` → `hidden = true`; `otro` → nothing. One sorted pass over tags and reports together (oldest first), so the latest approval wins.
  - `latestTagAt(rows)`: newest `reviewed_at` among `tag` **and** `report` rows.
  - `Taggable.hidden?: boolean`, `IndexItem.hidden?: boolean`; `inScope` returns false for hidden; `changedItems` also compares `hidden`.
  - `applyVideoReports(videos: Video[], rows: TagLike[]): Video[]`: approved video reports keyed by `payload.video.id`, oldest first; `no_corresponde` removes, `otra_edicion` sets `festival` / `year` from `arreglo` and `year_inferred = false`; unknown ids and `otro` are ignored; input never mutated.
  - `videoFromReport(row): Video | null`: builds a `Video` from the payload copy (`video.id/title/channel/kind`, `arreglo`), for videos moved into a page live.
- [ ] **Step 1: Write failing tests:**
  - tags: `it('a document report moves like a tag, or hides; the latest approval wins')`: a report `otra_edicion` `{ year: 2014 }` approved at T1 then a tag `{ year: 2016 }` at T2 → year 2016; `no_corresponde` → `hidden: true`; `otro` → unchanged; a video report never touches items. `latestTagAt` picks a report's time when it is the newest.
  - placement: `it('hidden items are out of every scope and count as a change')`.
  - videos: `it('applyVideoReports hides and moves by video id, latest wins, input untouched')` using the 2015 ids `MKRCg__AXC8` (hidden) and one moved to `{ festival: 'juventud', year: 2014 }`; `it('videoFromReport rebuilds a card from the payload copy')`.
- [ ] **Step 2: Run** `npx vitest run tests-js/tags.test.ts tests-js/placement.test.ts tests-js/videos.test.ts` → FAIL.
- [ ] **Step 3: Implement** in the files above.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `corrections: approved reports hide or move documents and videos (pure rule)`.

### Task 4: Build-time wiring

**Files:**
- Modify: `src/lib/catalog.ts`, `src/lib/videos.ts` (`ALL`), `src/pages/item/[id].astro`, `src/pages/datos/indice.json.ts`, `src/pages/admin.astro`, `src/i18n/es-AR.json` (`item.retirado`)
- Test: `tests-js/catalog.test.ts`, `tests-js/build.test.ts`

**Interfaces:**
- Consumes: Task 3 `applyTags`, `latestTagAt`, `applyVideoReports`.
- Produces: `items()` = listed (not hidden) items; new `allItems()` = every item including hidden (item page paths, `/datos/indice.json`, admin titles). `editionItems` / `firstMaterialYear` use the listed set. `TAGS_AT` from tags + reports. `editionVideos` default list = `applyVideoReports(videos.json, approved reports)`.

- [ ] **Step 1: Write failing tests:**
  - catalog: `it('hidden items are left out of listings but keep their page')`: `setItems([a, b({ hidden: true })])` → `items()` has only `a`, `allItems()` both, `editionItems` only `a`.
  - build: extend `edition pages link every video…` to use `applyVideoReports(videos, approved)` for the "lands on a page" loop; add `it('a hidden document keeps its page, with a notice and noindex')`: for every id hidden by the exported reports (skip when none), `item/<id>/index.html` exists, contains `data-retirado` and `noindex`, and no edition page links it.
- [ ] **Step 2: Run** `npx vitest run tests-js/catalog.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The item page passes `noindex` when `item.hidden` and shows a `<p class="contrib-msg" data-retirado>` with `t('item.retirado')` ("Este documento se retiró del archivo: no corresponde a los eisteddfodau de la Patagonia.") above the viewer.
- [ ] **Step 4: Run** `npx vitest run tests-js/catalog.test.ts tests-js/build.test.ts` → PASS.
- [ ] **Step 5: Commit** `build: apply approved reports to documents and videos`.

### Task 5: Live corrections in the browser

**Files:**
- Modify: `src/scripts/live-catalog.ts` (query `.in('type', ['tag', 'report'])`; `updateItemPage` shows the retirado notice when `after.hidden`)
- Create: `src/scripts/live-videos.ts` (edition pages)
- Modify: `src/components/VideoList.astro` (always render a mount: `data-videos` section with `data-festival` / `data-year`, `hidden` when empty; each `li.video` gets `data-video={id}`), `src/pages/[festival]/[year].astro` (import the script)
- Modify: `src/lib/videos.ts` (pure diff)
- Test: `tests-js/videos.test.ts`, `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `applyVideoReports`, `videoFromReport`, `latestTagAt` (Tasks 3–4).
- Produces: `videoDiff(festival, year, shownIds: string[], rows: TagLike[]): { remove: string[]; add: Video[] }`. A video is removed when a row hides it or moves it to another edition, and added when a row moves it here and it isn't shown. `live-videos.ts` fetches approved reports with `payload->>objetivo = 'video'` newer than `amg-tags-at`, applies `videoDiff`, builds added cards with the same markup as `VideoList.astro`, un-hides the section and updates the count.

- [ ] **Step 1: Write failing tests:** `it('videoDiff removes hidden and moved-away videos and adds moved-in ones once')`. In build, `it('every edition page has a videos mount, hidden when it has none')`: `data-videos` present on every edition page; `hidden` exactly when `editionVideos` is empty; every listed video `li` carries `data-video`.
- [ ] **Step 2: Run** `npx vitest run tests-js/videos.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Update the existing build assertion `html.includes('id="videos-t"')` to check that the section isn't `hidden`.
- [ ] **Step 4: Run** `npx vitest run tests-js/videos.test.ts tests-js/build.test.ts tests-js/live.test.ts` → PASS.
- [ ] **Step 5: Commit** `live: approved video and document reports apply without a rebuild`.

### Task 6: Report and note forms

**Files:**
- Create: `src/scripts/informar.ts`
- Modify: `src/components/VideoList.astro` (per-card `<button type="button" class="btn-link small" data-informar-video={id}>Informar un error</button>` after the link, plus one `<dialog id="informar-dialogo" class="informar">`), `src/scripts/tarea.ts` (two more blocks), `src/pages/[festival]/[year].astro` (import), `src/styles/global.css` (`.informar` dialog, ≤ 100% width with a 16px gutter), `src/i18n/es-AR.json` (`informar.*`)
- Test: `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `submit('report' | 'note', …)` (Task 2), `gate`, `gateMessage`, `field`, `select`, `busy`, `festivalOptions`, `categoryOptions` from `src/scripts/ui.ts`.
- Produces: `reportForm(target: { objetivo: 'documento'; item: string; festival: FestivalSlug; year: number | null; category: string } | { objetivo: 'video'; video: { id: string; title: string; channel: string; kind: string }; festival: FestivalSlug; year: number }, onDone: (el: HTMLElement) => void): HTMLFormElement` and `noteForm(ctx: { item: string; festival: FestivalSlug; year: number | null }, onDone): HTMLFormElement`.
- Copy (exact):
  - Radio legend: "¿Qué está mal?"
  - Options: "No es de un eisteddfod de la Patagonia (por ejemplo, es del Eisteddfod de Gales)" / "Es de otro eisteddfod o de otro año" / "Otra cosa"
  - Textarea: "Contanos qué está mal y cómo debería ser"
  - Note textarea: "¿Qué sabés de este documento?"
  - Buttons: "Informar un error", "Agregar información", "Enviar", "Cancelar"

- [ ] **Step 1: Write failing build test** `it('every video can be reported and the document box offers report and note')`: every `li.video` on an edition page contains `data-informar-video="<id>"`; edition pages with videos contain one `id="informar-dialogo"`; `informar.*` keys exist.
- [ ] **Step 2: Run** `npx vitest run tests-js/build.test.ts -t "reported"` → FAIL.
- [ ] **Step 3: Implement.** The dialog opens from a click on `[data-informar-video]` (event delegation; it reads title, channel and kind from the card's `data-*`). While signed out it shows `gateMessage(reason, 'informar.ingresar')`. `tarea.ts` appends `reportBlock(ctx)` and `noteBlock(ctx)`, each a quiet button that opens its form inline, like `transcribeTask`. On success it shows the existing `thanks()` line.
- [ ] **Step 4: Run** `npx vitest run tests-js/build.test.ts` → PASS. Then run the 320 / 360 px overflow scan (scratchpad `overflow/check.mjs`) on the edition pages → 0 overflow.
- [ ] **Step 5: Commit** `informar: report a wrong video or document, add information to a document`.

### Task 7: Approved notes on the document page

**Files:**
- Modify: `src/pages/item/[id].astro` (in the `sourcecard`: `<h3 class="small">Información aportada</h3>` + `Mount id="notas"` with the exported notes and `<script type="application/json" id="notas-data">`), `src/lib/contrib.ts` (`approvedNotes(itemId)`), `src/scripts/transcripciones.ts` → generalise `renderTranscriptions` to `renderQuotes(mount, list)` and hydrate both mounts
- Test: `tests-js/build.test.ts`, `tests-js/contrib.test.ts`

**Interfaces:**
- Produces: `approvedNotes(itemId: string, client?): Promise<LiveResult<Contribution[]>>` (same shape as `approvedTranscriptions`, `type = 'note'`).

- [ ] **Step 1: Write failing tests:** contrib, `it('approvedNotes asks for approved notes of one item')` (fake client records `.eq('type','note')` and `.eq('item_id', id)`); build, `it('approved notes are baked into their item page')`, same pattern as the transcriptions test (skip when the export has none).
- [ ] **Step 2: Run** `npx vitest run tests-js/contrib.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The heading is hidden while there are no notes (`island-section` pattern).
- [ ] **Step 4: Run** `npx vitest run tests-js/contrib.test.ts tests-js/build.test.ts` → PASS.
- [ ] **Step 5: Commit** `item: approved notes under "Información aportada"`.

### Task 8: Admin queue cards

**Files:**
- Modify: `src/lib/admin.ts` (pure helper), `src/scripts/admin.ts` (`card()`), `src/pages/admin.astro` (`KINDS`), `src/i18n/es-AR.json` (`admin.informe.*`)
- Test: `tests-js/admin.test.ts`

**Interfaces:**
- Produces: `reportAction(c: Pending): { accion: 'ocultar' | 'mover' | 'ninguna'; texto: string; aprobar: string }`. `texto` is "Ocultar del sitio", "Mover a <eisteddfod> <año>[, <sección>]" or "Sin cambio automático". `aprobar` is "Aprobar y ocultar", "Aprobar y mover" or "Aprobar".
- [ ] **Step 1: Write failing test** `it('reportAction describes what approving will do')` for the three problems, a move with only a year (keeps the reported eisteddfod), and a document move with a section.
- [ ] **Step 2: Run** `npx vitest run tests-js/admin.test.ts` → FAIL.
- [ ] **Step 3: Implement.** For `report` cards, show the video thumbnail (`videoThumb`) linked to `videoUrl`, its title, the problem label, the `texto` paragraph and `reportAction().texto`. The approve button uses `reportAction().aprobar`. Note cards show the text. Both keep "Editar y aprobar".
- [ ] **Step 4: Run** `npx vitest run tests-js/admin.test.ts` → PASS.
- [ ] **Step 5: Commit** `admin: review reported errors and notes, with what approval will do`.

### Task 9: Whole-branch check

- [ ] Run `npx vitest run` → all PASS; run `python3 -m pytest tests -q` → PASS.
- [ ] Run the overflow scan at 320 / 360 / 390 px → 0 overflow.
- [ ] Add a README line under "Exportar aportes aprobados": approved reports hide or move videos and documents at build time, keyed by id, so re-running `scripts.export_videos` never undoes them. Commit `docs: reports in the README`.
- [ ] Before anyone can submit a report on the live site, the migration must be applied (`npx supabase@3.1.0 db push --remote`). This and `git push` need the user's OK.
