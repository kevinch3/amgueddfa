# Amgueddfa Eisteddfod y Wladfa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, low-res, collaborative museum site of Eisteddfod programs (Chubut, Juventud, Mimosa, Trevelin). Visitors browse by festival and edition. Verified contributors add what's missing; admins approve; a game layer rewards it.

**Architecture:**
- A local Python script turns the private archive (`../`) into a committed `src/data/catalog.json` plus low-res WebP derivatives.
- An Astro static site on GitHub Pages renders the catalog.
- Supabase provides email-OTP auth, Postgres with RLS, and Storage for contributions, approval, points and badges. Small client-side scripts ("islands") read and write it live.
- Derivatives of uploads and released items are made **in the admin's browser** at approval time (canvas / pdf.js) and stored in the public `media` bucket.

**Tech Stack:**
- Python 3.14 (Pillow 12, `pdftoppm`, `catdoc`) and pytest.
- Node 22, Astro 5, TypeScript, Vitest.
- `@supabase/supabase-js` v2 and `pdfjs-dist`.
- `@electric-sql/pglite` for SQL tests (no Docker access on this machine).
- Supabase CLI via `npx supabase`.
- GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-11-13-amgueddfa-design.md`

**Deviations from the spec (builder's calls, recorded here):**
- The Astro project sits at the repo root instead of `site/`.
- Upload and release derivatives are made in the admin browser, not by an Edge Function. The admin is trusted, and this avoids WASM image libraries in Deno.
- Approved tag corrections are read straight from `data/approved/contributions.json`; there is no separate `overrides.json`.
- `/perfil/<display>` becomes `/perfil?u=<display>`, because a static site can't pre-render user pages.
- Office and HTML items get a text-excerpt card, not page images, because LibreOffice isn't installed. If `soffice` is on PATH, the build uses it.

## Global Constraints

**Name and language**
- Site name: **Amgueddfa Eisteddfod y Wladfa**.
- UI copy is Argentine Spanish with vos ("Subí", "Confirmá", "¿Lo tenés?").
- Every UI string lives in `src/i18n/es-AR.json` and is accessed through `t()`. No literal UI strings in components. Locale list `['es-AR']`; `cy` will be added later.

**Paths and identifiers**
- Archive root: `ARCHIVE = ../` (relative to the repo). The archive is never committed, and `.gitignore` covers `/.restricted/` and `.env`.
- Festival slugs:
  - `Eisteddfod_del_Chubut` → `chubut`
  - `Eisteddfod_de_la_Juventud` → `juventud`
  - `Eisteddfod_Mimosa` → `mimosa`
  - `Eisteddfod_de_Trevelin` → `trevelin`
- Category slugs:
  - `Programa` → `programa`
  - `Programa_del_dia` → `programa-del-dia`
  - `Preliminares` → `preliminares`
  - `Bases_y_avisos` → `bases`
  - `Resultados` → `resultados`
  - anything else, or a file directly under a year → `otros`
- Year folders: `_general` → `year: null, undated: false`; `_sin_fecha` → `year: null, undated: true`.
- Item id = the first 12 hex characters of the SHA-256 of the file bytes. Public media paths use only the id: `media/<id>/thumb.webp`, `media/<id>/p01.webp`, …

**Derivatives and size**
- Page/image long side: 1200 px, WebP quality 70.
- Thumbnail long side: 320 px, quality 60.
- PDFs: every page, rendered with `pdftoppm -r 110`, then resized.
- Total committed `public/media/` must be under 100 MB.

**Restricted items and personal data**
- Restricted by default: category `resultados`, plus ids listed in `data/restricted_extra.txt`.
- Their derivatives go to `.restricted/<id>/` and never to `public/`.
- Published notes: `note_public` only. Raw `notes` and the strings "Comment as", "Comments" and "Be the first to comment" must never appear in `catalog.json`.
- Files whose origin is `(pre-existing in folder; origin not recorded)` show `source_label: "Colección inicial (origen no registrado)"` and `source_url: null`.

**Points and badges**
- Points per approved contribution:
  - upload with `fills_gap = true`: 50; any other upload: 20;
  - fact: 10;
  - transcription: 15;
  - tag: 2;
  - memory: 5.
- Badges (slug → rule):
  - `primer-aporte` → 1 approved contribution;
  - `archivista-<festival>` → 10 approved in that festival;
  - `cazador-de-programas` → an approved upload with category `programa` and `fills_gap`;
  - `bardo` → 5 approved memories (my threshold);
  - `ojo-de-lince` → 50 approved tags.

**Abuse limits**
- At most 30 contributions per user in a rolling 24 h.
- Uploads: `image/jpeg|png|webp`, `application/pdf`, at most 20 MB (20971520 bytes).
- Display name: 3–30 characters, unique, case-insensitive.

**Hosting**
- GitHub Pages base path: `/amgueddfa-eisteddfod/`, from Astro `site` + `base`. All internal links go through `url()` in `src/lib/paths.ts`.
- Supabase: the public URL and anon key come from `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` is used only by local scripts and by `export.yml`.

## Review Focus

1. **Personal data leaking into the public build.** That means Facebook commenter names, the logged-in account's "Comment as …" name, raw notes, or restricted derivatives under `public/`. A test scans the built output (Task 2, Step 6).
2. **Supabase paused or unreachable.** Every page still renders its static content, and islands show `t('estado.sin_conexion')` instead of throwing. Tested on the `live.ts` fetch wrapper (Task 6).
3. **Wrong, expired or re-requested OTP code.** The user sees a clear es-AR message. Resend has a 60 s cooldown and no duplicate sends (Task 6).
4. **Two admins approving the same contribution, or approving twice.** Points must be awarded exactly once; a second approve raises and changes nothing (Task 5).
5. **The same file at two archive paths** (identical bytes, so the same id). There is one catalog item, with the extra path recorded in `alt_paths`, and no media written twice (Task 1).

---

### Task 1: Catalog core (parse archive → items)

**Files:**
- Create: `scripts/catalog/__init__.py`, `scripts/catalog/model.py`, `scripts/catalog/notes.py`, `scripts/catalog/scan.py`
- Test: `tests/test_scan.py`, `tests/test_notes.py`, `tests/fixtures/mini_archive/…` (a tiny fake archive with a `SOURCES.tsv`, two festivals, one PDF, one JPG, one Resultados file, one `_general` file, and one duplicate copy)
- Create: `.gitignore` (`/.restricted/`, `.env`, `node_modules/`, `dist/`, `__pycache__/`), `pyproject.toml` (pytest config only)

**Interfaces:**
- Produces:
  - `Item` dataclass in `model.py`, fields: `id, festival, year: int|None, undated: bool, category, title, kind ('image'|'pdf'|'doc'|'web'|'table'), src_path, alt_paths: list[str], source_url: str|None, source_label, retrieved, note_public, year_inferred: bool, restricted: bool, pages: int, thumb: str|None, page_paths: list[str], text_excerpt: str|None, table: list[dict]|None`.
  - `scan(archive: Path, restricted_extra: set[str]) -> list[Item]` in `scan.py`, sorted by (festival, year, category, title).
  - `clean_note(raw: str, src_path: str) -> str` in `notes.py`.
- Rules:
  - `title`: the filename without extension, with `_` replaced by spaces, the `fb_` prefix dropped, and a trailing fbid dropped.
  - `kind` comes from the extension:
    - jpg/jpeg/png/webp → `image`
    - pdf → `pdf`
    - doc/docx/pptx/xls → `doc`
    - html/htm → `web`
    - csv → `table`
  - `year_inferred` is True when the basename starts with `fb_` or `Tapa_programa_`, or the raw note contains "inferred".
  - `source_label`:
    - `Facebook` for facebook.com URLs;
    - `Wayback Machine` for web.archive.org;
    - `Google Drive` for drive.google.com / drive.usercontent;
    - `Archivo personal (kpc)` for `kpc.local:` origins, with `source_url = None`;
    - `Colección inicial (origen no registrado)` for pre-existing files;
    - otherwise the URL host.

- [ ] **Step 1: Write failing tests**
  - `tests/test_notes.py`:
    ```python
    def test_fb_note_strips_ui_and_commenters():
        raw = "FB page eisteddfodpuertomadryn; post text: Eisteddfod Mimosa Porth Madryn · Atención FECHAS IMPORTANTES para tener en cuenta 11 24 Comments No comments yet Be the first to comment. Comment as Kevin Roberts | links: http://www.eisteddfodmimosa.org.ar/"
        out = clean_note(raw, "Eisteddfod_Mimosa/2016/Bases_y_avisos/fb_x_1.jpg")
        assert out == "Atención FECHAS IMPORTANTES para tener en cuenta"
        for bad in ("Comment", "Kevin", "Be the first"):
            assert bad not in out

    def test_fb_note_with_no_caption_is_empty():
        assert clean_note("FB page x; post text: Eisteddfod Mimosa Porth Madryn · 5 7 Comments No comments yet Be the first to comment. Comment as A B", "a/fb_1.jpg") == ""

    def test_non_fb_note_kept_and_truncated():
        assert clean_note("9 pp. official program", "a/b.pdf") == "9 pp. official program"
        assert len(clean_note("x" * 1000, "a/b.pdf")) <= 300
    ```
  - `tests/test_scan.py` (against `tests/fixtures/mini_archive`):
    - `test_ids_are_content_hash`
    - `test_slugs_and_years` (a file directly under a year gets `otros`; `_general` gets year None)
    - `test_resultados_restricted_and_extra_list`
    - `test_duplicate_bytes_one_item_with_alt_paths` (Review Focus 5)
    - `test_pre_existing_source_label`, with `source_url is None`
    - `test_kpc_source_has_no_url`
    - `test_file_missing_from_sources_raises`, which raises `ValueError` naming the path. Every published item needs an origin.

- [ ] **Step 2: Run** `python -m pytest tests -q`. Expected: FAIL, with an ImportError.

- [ ] **Step 3: Implement `model.py`, `notes.py`, `scan.py`** per the Interfaces.
  - `clean_note` algorithm:
    1. If the note has the form `FB page …; post text: <rest>`, take `<rest>`.
    2. Drop everything up to and including the first ` · `.
    3. Cut at the first match of `r'(\s+\d+)*\s+\d*\s*Comments?\b|No comments yet|Comment as|\s\|\s*links:'`.
    4. Strip, then truncate to 300 characters on a word boundary with `…`.

- [ ] **Step 4: Run** `python -m pytest tests -q`. Expected: all pass.

- [ ] **Step 5: Run it against the real archive:** `python -c "from pathlib import Path; from scripts.catalog.scan import scan; print(len(scan(Path('..'), set())))"`. Expected: ≈749–751, with no exception. The duplicates collapse.

- [ ] **Step 6: Commit** `feat(catalog): scan archive into items with clean public notes`

---

### Task 2: Derivatives and `build_catalog.py`

**Files:**
- Create: `scripts/catalog/derive.py`, `scripts/build_catalog.py`, `data/restricted_extra.txt` (empty, with a comment header)
- Test: `tests/test_derive.py`, `tests/test_build_output.py`

**Interfaces:**
- Consumes: `scan()` and `Item` from Task 1.
- Produces:
  - `derive(item: Item, archive: Path, out_root: Path) -> Item` in `derive.py`. It writes `out_root/<id>/thumb.webp` and `p01.webp…`, and returns the item with `pages`, `thumb` and `page_paths` set. Paths are relative to `out_root`, e.g. `"<id>/p01.webp"`.
    - `image`: one page.
    - `pdf`: `pdftoppm -r 110 -png` into a temp dir, then each page resized.
    - `doc`: `text_excerpt` (first 600 chars, from `catdoc`, or `soffice` → pdf when available); `pages = 0`.
    - `web`: tag-stripped text excerpt.
    - `table`: `table = list(csv.DictReader)`.
    - It skips work when the outputs already exist and are newer than the source.
  - `scripts/build_catalog.py [--archive ..] [--only ID]`. It:
    - writes `src/data/catalog.json` as `{"generated": iso, "items": [Item…]}`;
    - writes public derivatives to `public/media/` and restricted ones to `.restricted/`;
    - applies approved `tag` contributions from `data/approved/contributions.json` if that exists (`payload.year|category|festival` override the item's fields);
    - prints the total size of `public/media`, and exits 1 if it is over 100 MB.

- [ ] **Step 1: Write failing tests** in `tests/test_derive.py` (with fixture images and PDFs):
  - `test_image_long_side_1200_and_thumb_320`
  - `test_pdf_every_page_rendered` (a 3-page fixture gives `pages == 3` and three files)
  - `test_table_rows_parsed`
  - `test_restricted_goes_to_restricted_root`
  - `test_skip_when_fresh`, checked via mtime

- [ ] **Step 2: Run** `python -m pytest tests/test_derive.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement `derive.py` and `build_catalog.py`.**

- [ ] **Step 4: Run** `python -m pytest tests -q`. Expected: pass.

- [ ] **Step 5: Run the real build:** `python scripts/build_catalog.py`. Expected:
  - it prints `items ≈750`;
  - `public/media` is under 100 MB;
  - open three derived pages (`Read` the WebP): the Chubut 2024 program p01, a Facebook flyer, and Trevelin 2011 p05. Text must be legible.

- [ ] **Step 6: Add `tests/test_build_output.py`** (Review Focus 1). It runs on the real output when present and skips otherwise. It asserts:
  - `catalog.json` doesn't contain `Comment as`, `Be the first to comment`, ` Comments`, or the key `notes`;
  - for every item with `restricted`, `public/media/<id>` doesn't exist;
  - every item has a `source_label`.

- [ ] **Step 7: Commit** the code, `src/data/catalog.json` and `public/media/`, with the message `feat(catalog): low-res derivatives + catalog.json`.

---

### Task 3: Astro scaffold, i18n, catalog library

**Files:**
- Create: `package.json`, `astro.config.mjs` (`site: 'https://kevinch3.github.io'`, `base: '/amgueddfa-eisteddfod'`), `tsconfig.json`, `vitest.config.ts`
- Create: `src/i18n/es-AR.json`, `src/lib/i18n.ts`, `src/lib/paths.ts`, `src/lib/catalog.ts`, `src/lib/types.ts`
- Test: `tests-js/catalog.test.ts`, `tests-js/i18n.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Item` mirroring Task 1 as TypeScript; `FestivalSlug`; `CategorySlug`; `EditionState = 'full'|'some'|'none'`.
  - `t(key: string, vars?: Record<string,string|number>): string`. A missing key throws in dev.
  - `url(path: string): string`, which prefixes `import.meta.env.BASE_URL`.
  - `catalog.ts`:
    - `items(): Item[]`;
    - `festivals(): {slug, name, nameCy}[]`, ordered chubut, juventud, mimosa, trevelin;
    - `editionItems(f, year)`;
    - `editionState(f, year): EditionState`: `full` if the `programa` category has an item with kind `pdf`, `some` if there are any items, `none` otherwise;
    - `yearRange(f): [first, 2026]`;
    - `mostWanted(limit)`: editions with state `some`, but no programa, newest first.
- Festival names (es-AR): "Eisteddfod del Chubut", "Eisteddfod de la Juventud", "Eisteddfod Mimosa Porth Madryn", "Eisteddfod de Trevelin".

- [ ] **Step 1:** `npm create astro@latest . -- --template minimal --typescript strict --no-git --install`. Then add `vitest`, `@supabase/supabase-js` and `pdfjs-dist`. Check: `npm run build` succeeds.

- [ ] **Step 2: Write failing tests:**
  - `tests-js/catalog.test.ts` uses a 5-item fixture injected via `setItems()`. Tests:
    - `editionState full only with programa pdf`
    - `yearRange starts at earliest material`
    - `mostWanted excludes full editions`
  - `tests-js/i18n.test.ts`:
    - `every t('…') key used under src exists in es-AR.json` (glob over `src/**/*.{astro,ts}` with the regex `t\(['"]([\w.]+)['"]`);
    - `vars interpolate {n}`.

- [ ] **Step 3: Run** `npx vitest run`. Expected: FAIL.

- [ ] **Step 4: Implement** the i18n, paths and catalog modules. Start `es-AR.json` with the site name, nav, categories and festival names.

- [ ] **Step 5: Run** `npx vitest run`. Expected: pass.

- [ ] **Step 6: Commit** `feat(site): astro scaffold, i18n, catalog lib`.

---

### Task 4: Static pages (browse-only museum)

Invoke the `frontend-design` skill before the layout work. Direction from the spec: a warm "museum" feel (paper texture, gold and red accents, a Welsh dragon / chair motif), accessible, and mobile first.

**Files:**
- Create:
  - `src/layouts/Base.astro`: header, nav, a sign-in slot, and a footer with an association removal/correction note: `t('pie.retiro')`.
  - `src/components/CoverageGrid.astro`, `ItemCard.astro`, `Viewer.astro` (a lightbox over `page_paths`, keyboard and swipe), `EmptySlot.astro`
  - `src/pages/index.astro`: coverage grid for all festivals, counters, "Más buscados", and a `#recientes` island mount point. Grid cells with `none` render as "¿Se realizó?" (light grey) and carry `data-festival` and `data-year`, so Task 7 can overlay `editions.status`: `not_held` → "No se realizó", hatched.
  - `src/pages/[festival]/index.astro`: timeline.
  - `src/pages/[festival]/[year].astro`: category sections. Empty categories render `EmptySlot` with `t('edicion.falta_programa')` = "Todavía no tenemos el programa completo — ¿lo tenés?". There are mount points `#hechos`, `#recuerdos` and `#aportes`, and a "Contribuir" button.
  - `src/pages/item/[id].astro`: viewer, source card (`source_label`, linking to `source_url` when present, plus `retrieved`), `note_public`, and a "¿El año es correcto?" / "Transcribir" mount point `#tarea`. Restricted items show `t('item.restringido')` = "Disponible tras revisión" plus a `#liberado` mount point.
  - `src/pages/general/[festival].astro`: `_general` and undated items.
- Test: `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `catalog.ts`, `t`, `url` from Task 3.
- Produces: the DOM mount points with ids `recientes`, `hechos`, `recuerdos`, `aportes`, `tarea`, `liberado` and `sesion`. Each carries `data-festival`, `data-year` and `data-item` attributes, which Tasks 6–9 hydrate.

- [ ] **Step 1: Write a failing test,** `tests-js/build.test.ts`. It runs `astro build` once in `beforeAll`, then asserts:
  - `dist/chubut/2024/index.html` contains "Programa" and `media/`;
  - `dist/trevelin/2011/index.html` exists;
  - every catalog id has `dist/item/<id>/index.html`;
  - a restricted item page has no `<img` pointing at `media/<id>`;
  - `dist/index.html` has one grid cell per festival-year in range.

- [ ] **Step 2: Run** `npx vitest run tests-js/build.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the layout, components and pages.

- [ ] **Step 4: Run the tests.** Expected: pass. Then `npm run preview` and check in Chrome at phone width (375 px) and desktop:
  - the grid matches the `INDEX.md` summary;
  - the viewer opens;
  - images are readable.

- [ ] **Step 5: Commit** `feat(site): static museum pages`.

---

### Task 5: Supabase schema, RLS, functions, storage policies

**Files:**
- Create:
  - `supabase/config.toml` (`npx supabase init`; OTP: `[auth.email] otp_length = 6`, `enable_confirmations = true`)
  - `supabase/migrations/20261113000001_schema.sql`: tables `profiles`, `contributions`, `badges` (seeded with the 8 slugs), `user_badges`, `editions`, `released_items`, per the spec.
  - `supabase/migrations/20261113000002_rls.sql`
  - `supabase/migrations/20261113000003_functions.sql`
  - `supabase/migrations/20261113000004_storage.sql`: buckets `uploads` (private, 20 MB, mime list), `restricted` (private), `media` (public).
  - `scripts/make_admin.sql`: `update profiles set role='admin' where id = (select id from auth.users where email = :'email');`. The user runs it; no email goes in the repo.
- Test:
  - `supabase/tests/harness.ts`: PGlite plus `supabase/tests/stub.sql`, which creates roles `anon` and `authenticated`, schema `auth` with a `users` table and `auth.uid()` reading `current_setting('request.jwt.claim.sub', true)::uuid`, and schema `storage` with `buckets`, `objects` and `foldername()`. It then applies the migrations in order.
  - `supabase/tests/db.test.ts`

**Interfaces:**
- Produces (callable via `supabase.rpc`):
  - `set_display_name(name text) returns void`: 3–30 chars, unique case-insensitive. It creates the profile row if missing; a trigger on `auth.users` insert also creates `profiles(id)`.
  - `approve_contribution(cid uuid, fills_gap boolean, payload_override jsonb default null) returns int`: admin only. It raises `'not_pending'` unless status is `pending`, and locks the row `FOR UPDATE`. It sets `approved`, `reviewer_id` and `reviewed_at`, and merges `payload_override` into payload. It adds points per Global Constraints, inserts any newly earned `user_badges`, and returns the points awarded. An approved `fact` with `field='edicion_realizada'` upserts `editions.status` (`held`/`not_held`).
  - `reject_contribution(cid uuid, note text) returns void`: admin only; requires `pending`.
  - `release_item(item_id text) returns void`: admin only.
  - `set_role(uid uuid, role text) returns void`: admin only.
  - View `public_contributions`: approved rows joined with `display_name`. It has no `user_id`, so emails are never exposed.
  - View `leaderboard`: `display_name, points, festival_points jsonb`.
  - Trigger `limit_daily`: raises `'daily_limit'` when the user already has 30 or more contributions in the last 24 h.
- RLS:
  - `contributions`: insert only with `user_id = auth.uid()` and `status = 'pending'`; select own rows or approved; update or delete only through functions.
  - `profiles`: select is public, but only through a view of `display_name, points`; a user can update their own `display_name` only through the function.
  - Storage:
    - `uploads`: an authenticated user inserts under `<uid>/…`; admins select.
    - `restricted`: admins only.
    - `media`: public select, admin insert.

- [ ] **Step 1: Write failing tests** in `supabase/tests/db.test.ts`:
  - `user can insert own pending contribution`
  - `user cannot insert as approved or for another user`
  - `anon sees only approved via public_contributions, no user_id column`
  - `non-admin approve raises`
  - `approve upload fills_gap gives 50 and primer-aporte badge`
  - `approve twice raises not_pending and points unchanged` (Review Focus 4)
  - `31st contribution in 24h raises daily_limit`
  - `display name uniqueness is case-insensitive`
  - `edicion_realizada fact sets editions.status`
  - `10 approved chubut gives archivista-chubut`

- [ ] **Step 2: Run** `npx vitest run supabase/tests`. Expected: FAIL.

- [ ] **Step 3: Write the migrations.**

- [ ] **Step 4: Run** the tests. Expected: pass.

- [ ] **Step 5: Commit** `feat(db): schema, RLS, approval and scoring functions`.

- [ ] **Step 6 (USER):** The user creates the Supabase project, which is account creation and theirs to do.
  1. The user runs `! npx supabase login`.
  2. I run `npx supabase link --project-ref <ref>` and `npx supabase db push`.
  3. The user puts the URL, anon key and service key in `.env`.
  4. In the dashboard, the user sets the OTP email template to show `{{ .Token }}`, and runs `scripts/make_admin.sql` with their email in the SQL editor.

---

### Task 6: Supabase client, live-read wrapper, OTP sign-in

**Files:**
- Create:
  - `src/lib/supabase.ts`
  - `src/lib/live.ts`
  - `src/lib/auth.ts`
  - `src/pages/ingresar.astro`: two steps (email → 6-digit code), then a display-name step if the profile has none.
  - `src/components/SessionBadge.astro` plus `src/scripts/session.ts`, which hydrates `#sesion` with the user's name, points and an "Ingresar" link.
- Test: `tests-js/live.test.ts`, `tests-js/auth.test.ts`

**Interfaces:**
- Produces:
  - `getClient(): SupabaseClient | null`: null when the env vars are missing.
  - `liveQuery<T>(fn: (c) => PromiseLike<{data:T,error}>, fallback: T, timeoutMs = 6000): Promise<{data:T, offline:boolean}>`: it never throws.
  - `sendCode(email): Promise<Result>` and `verifyCode(email, code): Promise<Result>`, where `Result = {ok:true} | {ok:false, key:string}`. The key is an i18n key: `auth.error.codigo_invalido`, `auth.error.codigo_vencido`, `auth.error.demasiados`, `auth.error.email` or `estado.sin_conexion`.
  - `canResend(lastSentAt:number, now:number): boolean`: allows a resend after 60 s.
  - `currentProfile(): Promise<{id, display_name, role, points} | null>`.

- [ ] **Step 1: Write failing tests:**
  - `liveQuery returns fallback+offline on network error / timeout` (Review Focus 2)
  - `verifyCode maps otp_expired → codigo_vencido, invalid → codigo_invalido` (Review Focus 3)
  - `canResend false before 60s`
  - `sendCode rejects malformed email without network call`

- [ ] **Step 2: Run the tests.** Expected: FAIL.

- [ ] **Step 3: Implement** the modules, and add the strings to `es-AR.json`.

- [ ] **Step 4: Run the tests.** Expected: pass. Manual check: sign in on `npm run dev` against the hosted project. The user enters the code from their inbox.

- [ ] **Step 5: Commit** `feat(auth): email OTP sign-in and resilient live reads`.

---

### Task 7: Contribution flows

**Files:**
- Create:
  - `src/pages/contribuir.astro`: reads `?f=&y=&item=`. Tabs: Subir, Datos, Recuerdo. It requires a session and otherwise links to `/ingresar?volver=…`.
  - `src/lib/contrib.ts`
  - `src/scripts/tarea.ts`: hydrates `#tarea` on item pages with "¿El año es correcto?" (Sí / No → pick year, category, festival) and "Transcribir" (a textarea).
  - `src/scripts/edicion.ts`: hydrates `#hechos`, `#recuerdos` and `#aportes` on edition pages from `public_contributions` via `liveQuery`, merged with `data/approved/contributions.json` as the fallback. On the home page, it also overlays `editions.status` onto the grid cells.
- Test: `tests-js/contrib.test.ts`

**Interfaces:**
- Consumes: `getClient`, `liveQuery`, `currentProfile` (Task 6); RLS and views (Task 5).
- Produces:
  - `validate(kind, input): {ok:true, payload} | {ok:false, key}`. Rules:
    - upload: mime and 20 MB limit;
    - fact: `field` in `start_date|end_date|venue|presentadores|ganador_silla|ganador_corona|edicion_realizada|competencia|other`; dates ISO; `competencia` requires `numero` and `descripcion`;
    - tag: at least one of year (1865–2026), category or festival;
    - transcription and memory: 10–5000 characters.
  - `submit(kind, festival, year, itemId|null, input): Promise<Result>`. An upload goes to `uploads/<uid>/<uuid>.<ext>` first, with `payload.storage_path`. A `daily_limit` error maps to `contrib.error.limite`.
  - `mergeApproved(static: Contribution[], live: Contribution[]): Contribution[]`: dedupe by id, live wins.

- [ ] **Step 1: Write failing tests:**
  - validation, one test per kind;
  - `submit upload stores then inserts`, with a mocked client;
  - `daily_limit maps to i18n key`;
  - `mergeApproved dedupes`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run.** Expected: pass. Manual check: submit one contribution of each type on the dev server and confirm they appear as "pendiente".

- [ ] **Step 5: Commit** `feat(contrib): upload, facts, tags, transcriptions, memories`.

---

### Task 8: Admin queue, browser derivatives, release

**Files:**
- Create:
  - `src/pages/admin.astro`. If the profile role is not admin, it renders `t('admin.solo')`. Otherwise:
    - a queue that is oldest first, with a type filter;
    - an upload preview via signed URL;
    - Aprobar, Rechazar (reason required) and "Editar y aprobar" (an editable payload JSON for facts, tags and text);
    - a "Restringidos" tab, which lists catalog items with `restricted` and offers "Liberar";
    - a "Usuarios" tab, with search by display name and "Hacer admin".
  - `src/lib/derive.ts`
  - `src/lib/admin.ts`
  - `src/scripts/liberado.ts`: hydrates `#liberado` on restricted item pages. If the item is in `released_items`, it shows the pages from the `media` bucket (`released/<id>/pNN.webp`).
- Test: `tests-js/derive.test.ts`, `tests-js/admin.test.ts`

**Interfaces:**
- Consumes: the rpc functions (Task 5) and `editionState` (Task 3), used to precompute `fills_gap`.
- Produces:
  - `makePages(file: Blob, mime): Promise<{pages: Blob[], thumb: Blob}>` in `derive.ts`. It uses the same limits as Task 2 (1200 px / q 0.7, 320 px / q 0.6), with `OffscreenCanvas` for images and `pdfjs-dist` for PDFs (every page).
  - `fillsGap(festival, year, category): boolean`: true when that category is empty in the static catalog for that edition **and** in the approved live uploads.
  - `approveUpload(c)`:
    1. download the original (signed URL);
    2. `makePages`;
    3. upload to `media/uploads/<cid>/…`;
    4. call `approve_contribution(cid, fillsGap(…), {media:{thumb, pages:[…]}})`.
  - `releaseItem(item)`: copy `restricted/<id>/*` to `media/released/<id>/*`, then `release_item(id)`.
- Restricted push: `scripts/push_restricted.py` uploads `.restricted/<id>/*` to the `restricted` bucket using `SUPABASE_SERVICE_ROLE_KEY` from `.env`. It uses the Storage REST API, upserts, and skips existing files.

- [ ] **Step 1: Write failing tests:**
  - `fillsGap true for empty category, false when static has item, false when live approved upload exists`
  - `approveUpload calls storage then rpc with media payload` (mocked client)
  - `makePages scales long side to 1200`, with jsdom and a canvas polyfill, or by injecting a stub canvas factory into `makePages`. Use the injection.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** the code, plus `push_restricted.py` with a pytest for its path mapping (`tests/test_push_restricted.py::test_object_keys`).

- [ ] **Step 4: Run** both test suites. Expected: pass.

- [ ] **Step 5: Manual end-to-end** on the dev server against the hosted project:
  - approve each pending item from Task 7 and check points and badges on `/perfil`;
  - release one Resultados item and see it appear on its item page;
  - as a non-admin, confirm `/admin` is refused and a direct `approve_contribution` rpc raises.

- [ ] **Step 6: Commit** `feat(admin): review queue, browser derivatives, release restricted`.

---

### Task 9: Game layer (profile, ranking, tasks feed, recent)

**Files:**
- Create:
  - `src/pages/perfil.astro` (`?u=<display_name>`): points, pending points greyed out (own profile only), badges, and contribution list with status pills.
  - `src/pages/ranking.astro`: overall and per festival, from the `leaderboard` view.
  - `src/pages/tareas.astro`: one card at a time, keyboard "S/N", with a progress counter.
  - `src/scripts/recientes.ts`: the home page `#recientes`, the latest 10 approved.
  - `src/lib/tasks.ts`
- Test: `tests-js/tasks.test.ts`

**Interfaces:**
- Consumes: the catalog, `submit('tag'|'transcription', …)`, `liveQuery`.
- Produces: `taskQueue(items: Item[], doneIds: Set<string>, seed: string): Item[]`. It holds items with `year_inferred && !restricted && kind==='image'`, minus ids the user has already submitted. The order is shuffled deterministically by seed, using the user id so each person gets a different order.

- [ ] **Step 1: Write failing tests:**
  - `queue excludes restricted and done`
  - `same seed same order, different seed different order`
  - `only year_inferred images`

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** the code and badge display, with the badge names and descriptions in `es-AR.json`.

- [ ] **Step 4: Run.** Expected: pass. Manual check: work through 5 tasks in `/tareas`, approve them in `/admin`, and check the ranking updates.

- [ ] **Step 5: Commit** `feat(game): profile, ranking, tasks feed, recent contributions`.

---

### Task 10: Export, workflows, publish

**Files:**
- Create:
  - `scripts/export_approved.mjs`: with the service key, writes `data/approved/contributions.json` (from `public_contributions`) and `data/approved/editions.json`. The output is stable-sorted so diffs stay small.
  - `.github/workflows/deploy.yml`: on push to main, runs `npm ci`, `npx vitest run tests-js --exclude build.test.ts`, then `npm run build`, then `actions/deploy-pages`. Env comes from repo variables.
  - `.github/workflows/keepalive.yml`: daily cron, a `curl` to `$PUBLIC_SUPABASE_URL/rest/v1/badges?select=slug&limit=1` with the anon key.
  - `.github/workflows/export.yml`: weekly cron plus `workflow_dispatch`. It runs the export and commits if there is a diff, which triggers deploy.
  - `README.md` (es-AR): what the site is, how to rebuild the catalog locally, how to make an admin, and the custom SMTP note.
- Test: `tests-js/export.test.ts`

**Interfaces:**
- Consumes: the `public_contributions` view (Task 5). Static edition pages (Task 4) read `data/approved/*.json` at build time for facts and memories, so they are visible to search engines.

- [ ] **Step 1: Write a failing test:** `export output has no user_id/email keys and is sorted by id`, using a mocked client.

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: pass.

- [ ] **Step 5: Commit** `feat(ops): export, deploy and keepalive workflows`.

- [ ] **Step 6 (ASK THE USER FIRST, because it publishes):** after explicit approval in chat:
  1. `gh repo create amgueddfa-eisteddfod --public --source . --push`;
  2. set repo variables `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`, and the secret `SUPABASE_SERVICE_ROLE_KEY`;
  3. enable Pages from Actions.

  Verify that `https://kevinch3.github.io/amgueddfa-eisteddfod/` loads, that the grid renders, and that sign-in works on the live site.
