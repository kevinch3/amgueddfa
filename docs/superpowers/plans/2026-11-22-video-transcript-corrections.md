# Video Transcript Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in collaborators correct video transcripts line by line from the player; the maintainer approves in `/admin/`; approved corrections show live and are baked into the files at export.

**Architecture:** A new contribution type `video_text` in `public.contributions` (one row per batch of line changes). One pure anchoring/applying rule implemented twice (TypeScript for the player and admin, Python for the export) and pinned by shared JSON test vectors. The player overlays approved rows not yet baked; the export bakes all approved rows and records their ids.

**Tech Stack:** Astro 7 static site, TypeScript, Supabase/Postgres (RLS, security-definer RPCs; tests on PGlite), Python 3 export scripts, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md`

## Global Constraints

- Festivals: `chubut` and `trevelin` only (#29); validation rejects any other.
- Per submission: 1–200 changes; `texto` 1–500 chars trimmed; `antes` ≤ 2,000 chars; `idioma` `es` | `cy`; video id `/^[\w-]{6,20}$/`.
- Points: 2 per approved change, at most 30 per submission.
- Anchoring windows: exact match ±2 s; run-inside-a-line ±5 s; no fuzzy similarity.
- New line source tag: `colab`. File fields: `correcciones` (array of contribution ids), `exportado` (ISO time).
- Lyric lines (`fuentes` contains `letra`) are never targeted or edited.
- All UI copy in the 7 locales (`src/i18n/{es-AR,cy-AR,en-GB,fr,it,sv,zh-Hans}.json`), Spanish the source; `tests-js/i18n.test.ts` must pass.
- Work in a worktree; commits `area: …` with no Claude attribution lines; merge with `gh pr merge --squash --subject "<area>: … (#N)"`.

## Review Focus

1. Two identical lines near each other ("¡Bravo!" twice within 2 s): a change must touch only the line it was anchored to — vector `twin-lines.json` (Task 2).
2. Welsh letters with circumflex (ŵ, ŷ) and accented Spanish: folding must agree in TS and Python, so the same change anchors in both — vector `welsh-diacritics.json` (Task 2).
3. A change whose `antes` equals a lyric line's text: never applied to the lyric — vector `lyric-untouched.json` (Task 2).
4. Live data unavailable (offline, 6 s timeout) or the transcript file missing: the player shows the file as is and no edit button, without errors — test in Task 5.
5. A 2,956-line session in edit mode: entering edit mode adds one ✎ control per line and no inputs until one is opened — test in Task 6.

---

### Task 1: Database: type `video_text`, points, withdraw and re-anchor RPCs

**Files:**
- Create: `supabase/migrations/20261122000001_video_text.sql`
- Test: `supabase/tests/db.test.ts` (new `describe('video_text corrections', …)`)

**Interfaces:**
- Produces: contribution `type = 'video_text'`; `approve_contribution` gives `least(2 * jsonb_array_length(payload->'cambios'), 30)` points for it; RPC `admin_withdraw_contribution(cid uuid, note text) returns void`; RPC `admin_set_video_text_changes(cid uuid, cambios jsonb) returns void`.

- [ ] **Step 1: Write the failing DB tests** in a new describe block, using the PGlite harness (`makeDb`, `createUser`, `createAdmin`, `q`):
  - `a collaborator inserts a pending video_text row` — insert as the user with `payload {video:{id:'abcdef12'}, cambios:[{t:1,antes:'a',texto:'b'}]}`, festival `chubut`; expect 1 row, status `pending`.
  - `approval scores 2 per change, capped at 30` — 3 changes → `points_awarded = 6`; 20 changes → 30.
  - `partial approval replaces cambios` — `approve_contribution(id, false, '{"cambios":[…1 change…]}')` → `jsonb_array_length(payload->'cambios') = 1`, points 2.
  - `another user cannot read a pending video_text row` — select as a second user returns 0 rows.
  - `withdraw takes points back and hides the row` — after approve (6 pts), `admin_withdraw_contribution(id,'mal')` → status `rejected`, `review_note = 'mal'`, `points_awarded = 0`, author's `profiles.points` back to 0, row absent from `public_contributions`.
  - `withdraw and set-changes are admin-only and only for approved video_text` — as a non-admin: error; on a pending row: `not_approved`; on an approved `fact`: `wrong_type`.
  - `set-changes validates` — `cambios` empty or with `texto` > 500 chars → error `invalid`; a valid list replaces `payload->'cambios'`, points unchanged.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run supabase/tests/db.test.ts -t "video_text"`
  Expected: FAIL (check constraint violation on type `video_text`).

- [ ] **Step 3: Write the migration** `20261122000001_video_text.sql`:
  - drop and re-add the `contributions_type_check` with `'video_text'` added to the list from `20261117000001_reports_notes.sql`;
  - `create or replace function public.approve_contribution(...)` copied from `20261117000001_reports_notes.sql` with one new `when 'video_text' then least(2 * coalesce(jsonb_array_length(c.payload->'cambios'), 0), 30)` — computed **after** the override is merged (partial approval scores the kept changes);
  - `admin_withdraw_contribution`: security definer, `is_admin()` or raise `forbidden`; lock row; raise `not_found`/`not_approved`/`wrong_type`; update status `rejected`, `review_note`, `reviewed_at = now()`, `reviewer_id = auth.uid()`; subtract `points_awarded` from `profiles.points`; set `points_awarded = 0`;
  - `admin_set_video_text_changes`: same guards; raise `invalid` unless `jsonb_typeof(cambios)='array'`, 1–200 items, each `t` a number ≥ 0 and any `texto` 1–500 chars; `update … set payload = jsonb_set(payload,'{cambios}',cambios)`;
  - `grant execute` on both to `authenticated`.

- [ ] **Step 4: Run the DB tests**
  Run: `npx vitest run supabase/tests/db.test.ts`
  Expected: PASS (all describes).

- [ ] **Step 5: Commit** — `git commit -m "db: video_text contributions, points, withdraw and re-anchor"`

### Task 2: The correction rule, TypeScript and Python, with shared vectors

**Files:**
- Create: `src/lib/video-corrections.ts`, `scripts/video_corrections.py`
- Create: `tests/fixtures/video-corrections/*.json` (vectors)
- Test: `tests-js/video-corrections.test.ts`, `tests/test_video_corrections.py`

**Interfaces:**
- Produces (TS): `type Cambio = { t: number; antes?: string; texto?: string; idioma?: 'es' | 'cy'; quitar?: boolean }`; `type CorrectionRow = { id: string; reviewed_at: string; display_name?: string | null; payload: { video: { id: string }; cambios: Cambio[] } }`; `applyCorrections(tr: { seg: [number, string][]; fuentes: string[][]; idiomas?: string[]; lang: string }, rows: CorrectionRow[]): { tr: same shape with idiomas always set when any idioma change applied; applied: string[] /* row ids */; sinAnclar: { id: string; cambio: Cambio; motivo: 'sin_linea' | 'idioma_en_linea_unida' }[]; autores: Record<number /* line index in output */, string[]> }`; `foldLine(s: string): string`.
- Produces (Python): `apply_corrections(t: dict, rows: list[dict]) -> tuple[dict, list[str], list[dict]]` (transcript, applied ids, unanchored) with the same semantics; `fold_line(s: str) -> str`.

- [ ] **Step 1: Write the vectors** — each file `{ "transcript": {...}, "rows": [...], "expected": {"seg": [...], "fuentes": [...], "idiomas"?: [...]}, "sinAnclar": [[rowId, t, motivo], ...] }`:
  `exact.json` (edit at same t), `drift.json` (line now 1.8 s later), `joined.json` (texto replaces only the run inside a joined line; quitar removes only the run), `joined-idioma.json` (idioma on a joined line → `idioma_en_linea_unida`), `split.json` (antes spread over two lines → `sin_linea`), `twin-lines.json` (two "¡Bravo!" 1 s apart; quitar of the second removes only it), `welsh-diacritics.json` (antes "Diolch yn fawr i chi gŵr", line "diolch yn fawr i chi gwr" → anchored), `lyric-untouched.json` (antes equals a `letra` line → `sin_linea`), `add.json` (add inserts in time order with fuentes `["colab"]`; a second identical add within 2 s is skipped), `two-rows-same-line.json` (later reviewed_at wins), `idioma-override.json`.
- [ ] **Step 2: Write the tests** — `tests-js/video-corrections.test.ts` loops over every vector file and asserts `applyCorrections` output `seg`, `fuentes`, `idiomas` and `sinAnclar`; `tests/test_video_corrections.py` does the same with `apply_corrections` (parametrized over the folder). Also `foldLine('¡Gracias, Señor ŵ!') === 'gracias senor w'` and the Python twin.
- [ ] **Step 3: Run both; expect FAIL** (`npx vitest run tests-js/video-corrections.test.ts`; `python3 -m pytest -q tests/test_video_corrections.py`).
- [ ] **Step 4: Implement both modules.** Folding: lower case, NFD and drop marks, punctuation to space, collapse spaces. Matching order per change: candidates within ±5 s excluding lyric lines, nearest first; exact folded equality within ±2 s; else folded `antes` as a contiguous word run inside a candidate (map the run back to original characters by tokenising the original with offsets); else unanchored. Rows applied in `reviewed_at` order; output lines carry `colab` in `fuentes` when text was changed or added; `autores` maps changed line indices to display names.
- [ ] **Step 5: Run both suites; expect PASS.**
- [ ] **Step 6: Commit** — `git commit -m "videos: one rule to anchor and apply transcript corrections (TS and Python)"`

### Task 3: Contribution type in the client, points, i18n

**Files:**
- Modify: `src/lib/contrib.ts` (Kind, validate, ownPending), `src/lib/game.ts` (points), `src/pages/admin.astro:11` (KINDS), the 7 locale files
- Test: `tests-js/contrib.test.ts`, `tests-js/game.test.ts`, `tests-js/i18n.test.ts` (existing)

**Interfaces:**
- Consumes: `Cambio` (Task 2).
- Produces: `Kind` includes `'video_text'`; `validate('video_text', {video, cambios})` → `{ok:true, payload:{video:{id,title?}, base?, cambios}}` or `{ok:false, key}` with keys `contrib.error.video_cambios` (0 or >200), `contrib.error.video_texto` (bad texto length), `contrib.error.video_id`; `pointsFor(type: Kind, payload?: unknown): number` in `game.ts` (video_text: `Math.min(2 * cambios.length, 30)`), used by `pendingPoints`; `ownPendingVideo(videoId: string, client?): Promise<Contribution[]>` in `contrib.ts`.
- i18n keys (all 7 locales): `admin.tipos.video_text`, `perfil.tipos.video_text`, `recientes.acciones.video_text`, `contrib.error.video_cambios`, `contrib.error.video_texto`, `contrib.error.video_id`.

- [ ] **Step 1: Failing tests** — `validate('video_text', …)`: accepts 1 change; rejects 0 and 201 changes (`contrib.error.video_cambios`); rejects `texto` of 501 chars (`contrib.error.video_texto`); rejects festival `juventud` (`contrib.error.edicion`, the existing key); drops an edit whose `texto` equals `antes`. `pointsFor('video_text', {cambios: Array(3)}) === 6`, `Array(20) → 30`; `pendingPoints` uses it.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** in `contrib.ts`/`game.ts`; add `'video_text'` to `KINDS`; add the i18n keys (Spanish: "Corrección de transcripción", "corrigió la transcripción de un video", errors written plainly).
- [ ] **Step 4: Run `npx vitest run tests-js/contrib.test.ts tests-js/game.test.ts tests-js/i18n.test.ts`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "contrib: video_text contribution type"`

### Task 4: Export bakes approved corrections

**Files:**
- Modify: `scripts/export_video_transcripts.py` (reconstruction path in `export()`, after `with_term_fixes`)
- Test: `tests/test_export_video_transcripts.py`

**Interfaces:**
- Consumes: `apply_corrections` (Task 2); `data/approved/contributions.json` rows with `type == 'video_text'` (fields `id, reviewed_at, display_name, payload`).
- Produces: each rewritten file gains `"correcciones": [ids]` (only when non-empty) and `"exportado": "<ISO UTC>"`; corrections' `idioma` survive `with_line_languages`; stdout `sin anclar <video> <t> «antes» (contribución <id>)` and a `sin_anclar` count in the summary dict.

- [ ] **Step 1: Failing tests** — `test_export_applies_approved_video_corrections` (fixture contributions file with one approved row editing a line → file text changed, `fuentes` has `colab`, `correcciones == [id]`); `test_export_keeps_a_correction_language` (idioma `cy` on a Spanish-reading line stays `cy` in `idiomas`); `test_export_reports_unanchored_corrections` (summary `sin_anclar == 1`, file unchanged); `test_export_ignores_pending_and_other_videos`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**: load approved `video_text` rows once per export (path parameter `approved: Path = APPROVED` defaulting to `data/approved/contributions.json`), group by `payload.video.id`, apply after `with_term_fixes`, pass explicit languages into `with_line_languages` so they win, write the two fields. `exportado` only changes when the file content otherwise changes (keep `git status` quiet on unchanged files).
- [ ] **Step 4: Run `python3 -m pytest -q tests`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "videos: the export bakes approved transcript corrections"`

### Task 5: Player shows approved corrections live, with credit

**Files:**
- Modify: `src/lib/video-transcript.ts` (keep `correcciones`, `exportado`), `src/scripts/reproductor.ts` (after `loadTranscript`), 7 locales
- Create: `src/lib/live-video-corrections.ts`
- Test: `tests-js/video-transcript.test.ts`, `tests-js/live-video-corrections.test.ts`

**Interfaces:**
- Consumes: `applyCorrections`, `CorrectionRow` (Task 2); `liveQuery` (`src/lib/live.ts`).
- Produces: `Transcript` gains `correcciones?: string[]`, `exportado?: string`; `approvedCorrections(videoId: string, client?): Promise<{ rows: CorrectionRow[]; offline: boolean }>`; `withLiveCorrections(tr: Transcript, rows: CorrectionRow[]): { tr: Transcript; autores: Record<number, string[]> }` (skips rows whose id is in `tr.correcciones`).
- i18n: `reproductor.origen.colab`, `reproductor.corregida_por` ("Corregida por {nombres}"), `reproductor.correcciones_de` ("Correcciones de {nombres}").

- [ ] **Step 1: Failing tests** — `asTranscript` keeps `correcciones` (array of strings) and drops a malformed one; `withLiveCorrections` skips a baked id and applies a new one; with `approvedCorrections` stubbed to `{rows: [], offline: true}` the transcript renders unchanged (Review Focus 4); a missing file (404) renders "sin transcripción" and no corrections query is made.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**: query `public_contributions` with `.eq('type','video_text').eq('payload->video->>id', id).order('reviewed_at')` through `liveQuery` (cached per video id in a `Map` for the page view); in `reproductor.ts` apply before `renderTranscript`; a corrected/added line gets `data-colab` and a `title` from `reproductor.corregida_por`; the footer adds `reproductor.correcciones_de` when any.
- [ ] **Step 4: Run `npx vitest run`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "player: approved transcript corrections show live, with credit"`

### Task 6: Edit mode in the player

**Files:**
- Create: `src/scripts/editor-transcripcion.ts`, `src/lib/transcript-draft.ts`
- Modify: `src/components/VideoPlayer.astro` (button `data-rep-editar` in `.rep-acciones`), `src/scripts/reproductor.ts` (hook), `src/styles/global.css`, 7 locales
- Test: `tests-js/transcript-draft.test.ts`, `tests-js/editor-transcripcion.test.ts` (happy-dom, as other DOM tests in `tests-js/`)

**Interfaces:**
- Consumes: `validate`/`submit('video_text', festival, year, null, input)` and `ownPendingVideo` (Task 3); `gate()`/`gateMessage()` (`src/scripts/ui.ts`); `Transcript` (Task 5).
- Produces: `type Draft = { video: string; base?: string; lines: Record<number, { texto?: string; idioma?: 'es'|'cy'; quitar?: boolean }>; nuevas: { t: number; texto: string; idioma: 'es'|'cy' }[] }`; `cambiosFrom(tr: Transcript, d: Draft): Cambio[]` (no-op edits dropped; `antes` = the line's current text); `loadDraft(video: string): Draft | null` / `saveDraft(d: Draft): void` / `clearDraft(video: string): void` (localStorage key `amg:borrador-video:<id>`, every access in try/catch); `wireEditor(dialog: HTMLDialogElement, getState: () => { tr: Transcript | null; video: { id: string; title: string; festival: string; year: number } | null; currentTime: () => number }): void`.
- i18n (7 locales): `editor.editar`, `editor.quitar`, `editor.idioma`, `editor.es`, `editor.cy`, `editor.ok`, `editor.deshacer`, `editor.agregar` ("+ Agregar una línea en {tiempo}"), `editor.cambios` ("{n} cambios"), `editor.enviar` ("Enviar {n} correcciones"), `editor.cancelar`, `editor.confirmar_cancelar`, `editor.letra` ("Letra: se corrige desde la página de letras"), `editor.pendiente`, `editor.ingresar`.

- [ ] **Step 1: Failing tests** — `cambiosFrom`: an edit, a quitar, an idioma and an add become 4 `Cambio`s with correct `t`/`antes`; an unchanged edit is dropped. DOM: the button is hidden for `juventud` and when no transcript; signed out shows the gate link; entering edit mode on a 2,956-line transcript adds 2,956 `[data-editar-linea]` buttons and 0 inputs (Review Focus 5); lyric lines get the `editor.letra` note instead; opening a line focuses its input and closing returns focus to its ✎; the counter (aria-live polite) reads "2 cambios"; a draft survives closing and reopening the player; sending calls `submit` once with all changes and clears the draft; own pending changes render with `data-pendiente`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** per the spec's "Player: edit mode" section (✎ beside, not inside, the seek button; inline editor per line; add at `currentTime()`; in-page confirm for Cancelar; auto-scroll paused while an editor is open; 44 px targets; success line `.contrib-ok` with the existing thanks keys).
- [ ] **Step 4: Run `npx vitest run`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "player: collaborators edit a video transcript line by line"`

### Task 7: Admin queue card for `video_text`

**Files:**
- Modify: `src/scripts/admin.ts` (`readable()`/`card()`), `src/lib/admin.ts` (approve with override), 7 locales
- Create: `src/lib/word-diff.ts`
- Test: `tests-js/word-diff.test.ts`, `tests-js/admin-video-card.test.ts`

**Interfaces:**
- Consumes: `asTranscript` + fetch of `transcripciones-video/<id>.json`; `approve_contribution`.
- Produces: `wordDiff(a: string, b: string): { op: 'same'|'del'|'ins'; text: string }[]`; `approveVideoText(c: Pending, kept: Cambio[], client?)` calling `approve_contribution(cid, false, {cambios: kept})`.
- i18n: `admin.video.cambios`, `admin.video.corregir`, `admin.video.quitar`, `admin.video.idioma`, `admin.video.agregar`, `admin.video.cambio_linea` ("La línea cambió desde que se editó"), `admin.video.aprobar_sel`.

- [ ] **Step 1: Failing tests** — `wordDiff('Benedicto de la competencia','Veredicto de la competencia')` → `[del Benedicto, ins Veredicto, same de la competencia]`; the card lists one row per change, all ticked; unticking one and approving sends `{cambios: [the other]}`; unticking all disables the button; a change whose `antes` no longer matches the current file shows `admin.video.cambio_linea`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx vitest run`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "admin: readable review of video transcript corrections"`

### Task 8: Admin "Videos" tab: withdraw and re-anchor

**Files:**
- Modify: `src/pages/admin.astro` (tab `videos`), `src/scripts/admin.ts`, `src/lib/admin.ts`, 7 locales
- Test: `tests-js/admin-videos.test.ts`

**Interfaces:**
- Consumes: RPCs from Task 1; `applyCorrections` (Task 2) for `sinAnclar`.
- Produces: `loadApprovedVideoText(client?)`, `withdrawContribution(id: string, note: string, client?)`, `setVideoTextChanges(id: string, cambios: Cambio[], client?)`; `reanchorOptions(tr: Transcript, t: number): { i: number; t: number; text: string }[]` (lines within ±60 s, lyric lines excluded).
- i18n: `admin.tabs.videos`, `admin.videos.retirar`, `admin.videos.motivo`, `admin.videos.sin_anclar`, `admin.videos.reanclar`, `admin.videos.nueva_linea`.

- [ ] **Step 1: Failing tests** — `reanchorOptions` returns only lines within ±60 s and no lyric lines; the tab groups approved rows by video; Retirar asks for a reason in the page and calls `withdrawContribution`; an unanchored change shows Re-anclar, and picking a line calls `setVideoTextChanges` with that change's `t`/`antes` replaced and the rest unchanged.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx vitest run`; expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "admin: withdraw and re-anchor approved video corrections"`

### Task 9: Profile link, docs, full check

**Files:**
- Modify: `src/pages/perfil.astro:72-75` (link for `video_text` to `<edition>/#v=<id>&t=<first change t>`), `.claude/skills/video-reconstruction/SKILL.md` (row: after a rebuild, check `/admin/` → Videos for unanchored corrections), `docs/superpowers/specs/...` (none)
- Test: `tests-js/build.test.ts` (new case), manual

- [ ] **Step 1: Failing test** — build test: `dist/admin/index.html` has the `videos` tab; `dist/chubut/2024/index.html` contains `data-rep-editar`; no Juventud page contains it.
- [ ] **Step 2: Run `npm run build && npx vitest run tests-js/build.test.ts`; expect FAIL; implement the profile link and skill row; run again; expect PASS.**
- [ ] **Step 3: Full suite** — `npm run build && npm test && python3 -m pytest -q tests`; expect all PASS.
- [ ] **Step 4: Manual check** in `npx astro preview --port <free port>` against the live Supabase as a test collaborator and the admin: edit a long session at phone width; submit; approve partially; see it live; run `python3 -m scripts.export_video_transcripts`; see `correcciones` in the file and the line in search after build.
- [ ] **Step 5: Commit and PR** — `git commit -m "videos: collaborators correct video transcripts (profile link, skill)"`; PR; merge with `--subject`.
