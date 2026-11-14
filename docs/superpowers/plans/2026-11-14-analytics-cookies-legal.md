# Analytics, cookie management and legal pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track page views without cookies through Cloudflare Web Analytics, with a per-visitor opt-out. Add hourly sign-in counts to a new `/admin` "Estadísticas" tab. Publish the `/cookies`, `/objetivos`, `/derechos` and `/privacidad` pages and the AGPL-3.0 / CC BY-SA 4.0 licences (issue #1).

**Architecture:**
- **Beacon.** A pure consent module decides in the browser whether to inject the Cloudflare beacon. The beacon is only rendered into pages at all when `PUBLIC_CF_ANALYTICS_TOKEN` is set at build time.
- **Sign-in counts.** A security-definer trigger on `auth.users.last_sign_in_at` bumps an anonymous hourly counter. An admin-only RPC feeds the new tab, which buckets the hours in the admin's timezone using pure helpers.
- **Legal pages.** Static Astro pages, with their text in `es-AR.json`.

**Tech Stack:** Astro 7 (static), TypeScript, Supabase/Postgres (PGlite in tests), Vitest, Cloudflare Web Analytics beacon.

**Spec:** `docs/superpowers/specs/2026-11-14-analytics-cookies-legal-design.md`

## Global Constraints

- **No cookies, fingerprints, visitor IDs or per-person records** of browsing or sign-ins. `signin_hours` holds only `(hour, n)`.
- **Opt-out storage.** The key is `amg:no-contar`; its value is `'1'` when the visitor opted out, and the key is absent otherwise. Every `localStorage` access is wrapped in try/catch.
- **When counting is off.** Counting is off when any of these hold:
  - the opt-out is set;
  - `navigator.doNotTrack === '1'`;
  - `navigator.globalPrivacyControl === true`.
- **Beacon markup:**
  - `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"<token>"}'>`;
  - injected only from the browser, after the consent check;
  - never on `/admin`.
- **Build-time token.** With `PUBLIC_CF_ANALYTICS_TOKEN` unset, no built page contains `cloudflareinsights` or the token.
- **Copy.** All UI and page copy is es-AR in `src/i18n/es-AR.json`, written with `json.dumps(indent=2, ensure_ascii=False)` formatting. `t()` returns strings only, so use one key per paragraph.
- **Pinned facts the copy must state:**
  - controller: "Kevin Roberts, responsable del archivo";
  - takedowns: answered within 10 business days, with disputed material hidden while it is reviewed;
  - Ley 25.326: access within 10 calendar days, correction or deletion within 5 business days;
  - Ley 11.723;
  - code under AGPL-3.0, community transcriptions and data under CC BY-SA 4.0, and programme images belong to each asociación;
  - repo `https://github.com/kevinch3/amgueddfa-eisteddfod`.
- **Pages ship final**, with no "borrador" or "en revisión" note.
- **The contact address** is never written as text in `dist`; it appears only as `contacto.png`.
- **Tests use no real data.** Unit tests pass explicit data. `tests-js/build.test.ts` runs locally only, since CI excludes it.
- **Commits** carry no AI attribution lines: no `Co-Authored-By`, no `Claude-Session`, no "Generated with".

## Review Focus

1. **Storage that throws.** `localStorage` throws in Safari private mode or with blocked site data. The page must not crash, and DNT/GPC must still be honoured. Test: `readSignals` with a throwing storage (Task 1).
2. **Dates across UTC midnight.** In the admin's timezone, a sign-in at 02:00 UTC belongs to the previous local day and hour 23 in `America/Argentina/Buenos_Aires`. Test: the `perDay` and `weekHourGrid` cases (Task 3).
3. **Switch state when the browser already blocks counting.** DNT or GPC is on and the visitor opens `/cookies`. The switch shows "not counted" and the note explains why; toggling it still saves the opt-out. Test: the `counterState` cases (Task 4).
4. **Empty stats.** The `signin_hours` table is empty, or `days` is out of range. The tab says no data yet, with no error, and `days` is clamped to 1–366. Test: the DB clamp test (Task 2) and the `perDay` empty test (Task 3).
5. **Storage keys missing from `/cookies`.** A future `amg:*` key in `src/` that isn't on `/cookies` fails the build test (Task 4).

---

### Task 1: Consent module and the conditional beacon

**Files:**
- Create: `src/lib/consent.ts`, `src/components/Analytics.astro`, `src/scripts/analytics.ts`
- Modify:
  - `src/layouts/Base.astro`: add a Props field `analytics?: boolean` (default `true`), and render `<Analytics />` in `<head>` only when the token is set and `analytics` is true.
  - `src/pages/admin.astro`: pass `analytics={false}`.
  - `.github/workflows/deploy.yml`: add `PUBLIC_CF_ANALYTICS_TOKEN: ${{ vars.PUBLIC_CF_ANALYTICS_TOKEN }}` next to `PUBLIC_AUTH_CODE`.
  - `README.md`: in the section where `PUBLIC_AUTH_CODE` is documented, document the Cloudflare dashboard step and the variable.
- Test: `tests-js/consent.test.ts`, `tests-js/build.test.ts`

**Interfaces:**
- Produces, in `src/lib/consent.ts`:
  - `export const OPT_OUT_KEY = 'amg:no-contar'`
  - `export type Signals = { optOut: boolean; dnt: boolean; gpc: boolean }`
  - `export function shouldCount(s: Signals): boolean`
  - `export function readSignals(win?: { localStorage?: Storage; navigator?: Navigator }): Signals`. It defaults to `globalThis`. A throwing or missing storage reads as `optOut: false`.
  - `export function setOptOut(on: boolean, storage?: Storage): boolean`. It sets `'1'` or removes the key, and returns false when the storage throws.
  - `export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'`
- How the token reaches the page: `Analytics.astro` emits `<meta name="amg-analytics" content={token}>` plus `<script>import '../scripts/analytics.ts'</script>`. Rendering the component only when the token is set keeps its script out of tokenless builds.
- `analytics.ts` reads the meta. If `shouldCount(readSignals())` is true, it appends the beacon script with `data-cf-beacon` set to `JSON.stringify({ token })`.

- [ ] **Step 1: Write the failing tests.** In `tests-js/consent.test.ts`:
  - `shouldCount truth table`: true only for `{optOut:false,dnt:false,gpc:false}`; each single `true` flag gives false.
  - `readSignals reads the opt-out key, DNT and GPC`: storage with `amg:no-contar='1'` gives `optOut: true`; `navigator {doNotTrack:'1', globalPrivacyControl:true}` gives `dnt: true, gpc: true`.
  - `readSignals survives a throwing localStorage`: the getter throws, and the result is `{optOut:false, dnt:true, gpc:false}` when DNT is `'1'`.
  - `setOptOut sets and clears, and reports failure`: `true` stores `'1'`, `false` removes the key, and a throwing storage returns `false`.

- [ ] **Step 2: Run.** `npx vitest run tests-js/consent.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/consent.ts`, `analytics.ts`, `Analytics.astro`, the Base/admin props, and the deploy.yml and README lines.

- [ ] **Step 4: Add a build test.** In `tests-js/build.test.ts`, add `it('the analytics beacon is rendered only with a token, never on admin')`:
  - Find the token with `loadEnv('production', root, 'PUBLIC_').PUBLIC_CF_ANALYTICS_TOKEN` from `vite`, falling back to `process.env`.
  - If there is a token: `index.html` contains `name="amg-analytics"`, and `admin/index.html` does not.
  - If there isn't: no `.html` under `dist` contains `amg-analytics` or `cloudflareinsights`.
  - Either way, `admin/index.html` never contains `cloudflareinsights`.

- [ ] **Step 5: Run.** `npx vitest run tests-js/consent.test.ts tests-js/build.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/consent.ts src/components/Analytics.astro src/scripts/analytics.ts src/layouts/Base.astro src/pages/admin.astro .github/workflows/deploy.yml README.md tests-js/consent.test.ts tests-js/build.test.ts
  git commit -m "analytics: Cloudflare Web Analytics beacon, skipped on opt-out, DNT and GPC"
  ```

### Task 2: Hourly sign-in counter (database)

**Files:**
- Create: `supabase/migrations/20261116000001_signin_stats.sql`
- Modify: `supabase/tests/stub.sql`. Add `last_sign_in_at timestamptz` to `auth.users`.
- Test: `supabase/tests/db.test.ts`, a new `describe('sign-in stats')` block.

**Interfaces:**
- Produces:
  - table `public.signin_hours (hour timestamptz primary key, n integer not null default 0)`, with RLS enabled, no policies, and all privileges revoked from `public, anon, authenticated`;
  - trigger `count_signin` running `after update of last_sign_in_at on auth.users for each row`. It calls `public.count_signin()`: security definer, `set search_path = public, pg_temp`. It skips when the new value is null or `is not distinct from` the old one. Otherwise it runs `insert … on conflict (hour) do update set n = signin_hours.n + 1` with `hour = date_trunc('hour', new.last_sign_in_at)`.
  - RPC `public.admin_signin_stats(days int default 90) returns table(hour timestamptz, n int)`:
    - security definer, with a pinned search_path;
    - raises `not_admin` (errcode `P0001`) unless `public.is_admin()`;
    - clamps `days` to 1–366;
    - returns rows with `hour >= now() - make_interval(days => d)`, ordered by hour;
    - revoked from `public, anon`, granted to `authenticated`.
  - The RPC returns only `(hour, n)`. The tab's "desde" line uses the first row's hour, which is the earliest counted hour in the window.

- [ ] **Step 1: Write the failing tests.** Use `t.q('postgres', 'update auth.users set last_sign_in_at = $2 where id = $1', …)` to simulate sign-ins.
  - `a sign-in bumps its hour; repeats in the same hour add up`: two users sign in at `2026-11-14T10:05Z` and `10:40Z`, so `signin_hours` has one row for `10:00Z` with `n = 2`.
  - `an unchanged or null last_sign_in_at counts nothing`: set the same value again, then set null, and n stays the same.
  - `signin_hours stores no user id`: the column names from `information_schema.columns` are exactly `['hour','n']`.
  - `only admins read the stats`:
    - for anon and for a normal user, `select * from signin_hours` is rejected (`permission denied`) and calling the RPC is rejected (`not_admin` or `permission denied`);
    - an admin's `select * from admin_signin_stats(90)` returns the row.
  - `days is clamped`: `admin_signin_stats(0)` and `admin_signin_stats(10000)` both run without error.

- [ ] **Step 2: Run.** `npx vitest run supabase/tests/db.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the migration and the stub column.

- [ ] **Step 4: Run.** `npx vitest run supabase/tests/db.test.ts`. Expected: all PASS, including the existing ones.

- [ ] **Step 5: Commit.**
  ```bash
  git add supabase/migrations/20261116000001_signin_stats.sql supabase/tests/stub.sql supabase/tests/db.test.ts
  git commit -m "db: anonymous hourly sign-in counter and admin_signin_stats"
  ```

### Task 3: "Estadísticas" admin tab

**Files:**
- Create: `src/lib/stats.ts`, `src/scripts/admin-stats.ts`
- Modify:
  - `src/pages/admin.astro`: `TABS` gains `'estadisticas'` (last), plus the panel `<section id="apanel-estadisticas" …>` with `<div id="a-stats" aria-live="polite">` and its styles.
  - `src/scripts/admin.ts`: `selectTab` lazily calls `renderStats($('a-stats'))` the first time, following the `restringidos` pattern.
  - `src/i18n/es-AR.json`: `admin.tabs.estadisticas` and `admin.stats.*`: `titulo_dias`, `titulo_semana`, `desde` (with `{fecha}`), `sin_datos`, `visitas`, `visitas_enlace`, `dias_semana` (seven short names, Monday first, as one comma-separated string), `error`.
- Test: `tests-js/stats.test.ts`

**Interfaces:**
- Consumes: the RPC `admin_signin_stats(days)` (Task 2), `userTimeZone()` from `src/lib/dates.ts`, and `fecha()`.
- Produces, in `src/lib/stats.ts`:
  - `export type HourCount = { hour: string; n: number }`
  - `export function localParts(iso: string, tz: string): { day: string; weekday: number; hour: number }`. `day` is the local `YYYY-MM-DD`, `weekday` runs 0 (Monday) to 6, and `hour` runs 0 to 23. Use `Intl.DateTimeFormat('en-CA', { timeZone: tz, … , hourCycle: 'h23' })` with `formatToParts`.
  - `export function perDay(rows: HourCount[], tz: string, days: number, now: Date): { day: string; n: number }[]`. It returns exactly `days` entries, oldest first, ending on `now`'s local day, with zeros filled in.
  - `export function weekHourGrid(rows: HourCount[], tz: string): number[][]`, a 7×24 grid of summed counts.
- `src/scripts/admin-stats.ts`: `export async function renderStats(root: HTMLElement): Promise<void>`. It renders:
  - the 90-day bar row: CSS bars whose heights are relative to the max, each with a `title` of date and count;
  - the weekday×hour grid as a `<table>`, with cell shade by count and the count as text for screen readers;
  - the "desde" line;
  - the `https://dash.cloudflare.com/?to=/:account/web-analytics` link, using the `visitas_enlace` text;
  - `admin.stats.sin_datos` when the RPC returns no rows;
  - `admin.stats.error` on an RPC error.

- [ ] **Step 1: Write the failing tests** in `tests-js/stats.test.ts`, with `const AR = 'America/Argentina/Buenos_Aires'`:
  - `localParts crosses UTC midnight`: `localParts('2026-11-14T02:00:00Z', AR)` gives `{ day: '2026-11-13', weekday: 4, hour: 23 }`. 2026-11-13 is a Friday.
  - `perDay fills zeros and ends today`: `perDay([{hour:'2026-11-14T02:00:00Z',n:3},{hour:'2026-11-14T15:00:00Z',n:2}], AR, 3, new Date('2026-11-14T20:00:00Z'))` equals `[{day:'2026-11-12',n:0},{day:'2026-11-13',n:3},{day:'2026-11-14',n:2}]`.
  - `perDay with no rows`: `perDay([], AR, 2, new Date('2026-11-14T20:00:00Z'))` gives two zero entries.
  - `weekHourGrid sums by local weekday and hour`: the same two rows give `grid[4][23] === 3` and `grid[5][12] === 2`, and the total of all cells is 5.

- [ ] **Step 2: Run.** `npx vitest run tests-js/stats.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `stats.ts`, `admin-stats.ts`, the admin tab, and the i18n keys.

- [ ] **Step 4: Run.** `npx vitest run tests-js/stats.test.ts tests-js/build.test.ts`. Expected: PASS. The existing admin build test still sees its tabs.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/stats.ts src/scripts/admin-stats.ts src/pages/admin.astro src/scripts/admin.ts src/i18n/es-AR.json tests-js/stats.test.ts
  git commit -m "admin: Estadísticas tab with sign-ins per day and by weekday and hour"
  ```

### Task 4: `/cookies` page with the "No contar mis visitas" switch

**Files:**
- Create: `src/pages/cookies.astro`, `src/scripts/cookies.ts`
- Modify: `src/i18n/es-AR.json` (`legal.cookies.*`, `legal.titulos.cookies`)
- Test: `tests-js/consent.test.ts` (extend), `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `OPT_OUT_KEY`, `readSignals`, `setOptOut` (Task 1).
- Produces, in `src/lib/consent.ts`: `export function counterState(s: Signals): { counted: boolean; reason: 'optout' | 'browser' | null }`. The `reason` is `'browser'` when DNT or GPC is on, even if the opt-out is also set.
- Page content:
  - a heading;
  - "este sitio no usa cookies";
  - a storage table with a `<code>` cell per key:
    - `sb-<proyecto>-auth-token`;
    - `sb-<proyecto>-auth-token-code-verifier`;
    - `amg:tz`;
    - `amg:no-contar`;
  - one paragraph on the Cloudflare beacon, linking `https://www.cloudflare.com/web-analytics/` and Cloudflare's privacy policy;
  - the switch: `<input type="checkbox" id="no-contar">` with a label, a status line `#no-contar-estado` (`aria-live="polite"`), and a note that the change applies from the next page;
  - `<noscript>` text saying the switch needs JavaScript.
- `cookies.ts`:
  - On load it sets `checked = !counterState(readSignals()).counted`. When `reason === 'browser'` it shows the browser note.
  - On change it calls `setOptOut`. If the save fails, it shows an error line.

- [ ] **Step 1: Write the failing test.** In `tests-js/consent.test.ts`, `counterState reasons`:
  - all false gives `{counted:true, reason:null}`;
  - only the opt-out gives `{counted:false, reason:'optout'}`;
  - opt-out plus GPC gives `{counted:false, reason:'browser'}`.

- [ ] **Step 2: Run.** `npx vitest run tests-js/consent.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `counterState`, the page, the script and the copy.

- [ ] **Step 4: Add a build test.** `it('the cookies page lists every key the site stores in the browser')`:
  - Walk `src/**/*.{ts,astro}` and collect every string literal matching `/['"`](amg:[a-z-]+)['"`]/`.
  - Expect at least `amg:tz` and `amg:no-contar`.
  - Each must appear in `dist/cookies/index.html`, which must also contain `auth-token`.

- [ ] **Step 5: Run.** `npx vitest run tests-js/consent.test.ts tests-js/build.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/consent.ts src/pages/cookies.astro src/scripts/cookies.ts src/i18n/es-AR.json tests-js/consent.test.ts tests-js/build.test.ts
  git commit -m "cookies: page listing browser storage, with a No contar mis visitas switch"
  ```

### Task 5: Objetivos, Derechos and Privacidad pages, footer, sitemap, contributor declaration, licences

**Files:**
- Create:
  - `src/pages/objetivos.astro`, `src/pages/derechos.astro`, `src/pages/privacidad.astro`;
  - `LICENSE`: the verbatim AGPL-3.0 text from `https://www.gnu.org/licenses/agpl-3.0.txt`;
  - `LICENSE-DATA.md`: CC BY-SA 4.0 for `data/` and `src/data/transcripciones/`, linking `https://creativecommons.org/licenses/by-sa/4.0/legalcode`, with the programme images excluded.
- Modify:
  - `src/layouts/Base.astro`: the footer gets `<nav aria-label={t('pie.legal')}>` linking Objetivos, Derechos, Privacidad and Cookies. In `pie.retiro`, "avisanos" becomes a link to `/derechos`, so the copy splits into text plus link.
  - `src/pages/index.astro`: one line under `inicio.lema` linking `/objetivos`.
  - `src/pages/contribuir.astro`: under `contrib.intro`, the licence line linking `/objetivos`. Before each `contrib.enviar` button (lines 75, 81, 91), a `<p class="muted small">` declaration linking `/derechos`.
  - `src/pages/sitemap.xml.ts`: add `objetivos/`, `derechos/`, `privacidad/` and `cookies/`.
  - `package.json`: `"license": "AGPL-3.0-only"`.
  - `src/i18n/es-AR.json`: `legal.titulos.*`, `legal.objetivos.*`, `legal.derechos.*`, `legal.privacidad.*`, `pie.legal`, `pie.enlaces.*`, `contrib.licencia`, `contrib.declaracion`, `inicio.objetivos`.
- Test: `tests-js/build.test.ts`

**Interfaces:**
- Consumes: the Global Constraints' pinned facts. Page sections follow the spec, §4.
- Privacidad's processors line names Supabase, Cloudflare (R2 and Web Analytics) and GitHub Pages. Resend is described as "el proveedor de correo, cuando el sitio use uno propio (Resend); hasta entonces, Supabase envía los correos". The text must stay true either way.

- [ ] **Step 1: Write the failing build test.** `it('legal pages exist, are linked from every page footer and the sitemap, and state the licences')`:
  - The pages `objetivos/`, `derechos/`, `privacidad/` and `cookies/` each have an `index.html`.
  - `index.html` and one edition page contain `href` values ending in each of those four paths.
  - `sitemap.xml` contains all four.
  - `objetivos/index.html` contains `AGPL-3.0`, `CC BY-SA 4.0` and `github.com/kevinch3/amgueddfa-eisteddfod`.
  - `derechos/index.html` contains `11.723`, and `privacidad/index.html` contains `25.326`.
  - No legal page contains `borrador` or `revisión con las asociaciones`.
  - `contribuir/index.html` contains `CC BY-SA 4.0` and a link to `derechos`.
  - The repo root has `LICENSE`, containing `GNU AFFERO GENERAL PUBLIC LICENSE`, and `LICENSE-DATA.md`.

- [ ] **Step 2: Run.** `npx vitest run tests-js/build.test.ts`. Expected: the new test FAILS.

- [ ] **Step 3: Implement** the pages, footer, home line, contribuir lines, sitemap, licences and copy. Before downloading the licence text, confirm with the user that fetching it from gnu.org is OK.

- [ ] **Step 4: Run** `npx vitest run tests-js/build.test.ts`. Expected: all PASS. This includes the existing "contact address never appears as text", "no internal link escapes the base path" and robots/sitemap tests.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/pages/objetivos.astro src/pages/derechos.astro src/pages/privacidad.astro src/layouts/Base.astro src/pages/index.astro src/pages/contribuir.astro src/pages/sitemap.xml.ts src/i18n/es-AR.json package.json LICENSE LICENSE-DATA.md tests-js/build.test.ts
  git commit -m "legal: Objetivos, Derechos, Privacidad pages, footer links, AGPL-3.0 and CC BY-SA 4.0 licences (closes #1)"
  ```

### Task 6: Verify and ship

Every outward step in this task needs the user's OK first: the prod migration, the repo variable, the push, and closing the issue.

- [ ] **Step 1: Run the whole suite.**
  - `npx vitest run`: all PASS (the earlier baseline was 258, plus the new tests).
  - `pytest -q`: 59 PASS.

- [ ] **Step 2: Check in the browser.** Run `npm run dev`, then use Claude in Chrome.
  - With no opt-out, a request to `static.cloudflareinsights.com` appears.
  - Turn the `/cookies` switch on and reload: no beacon request.
  - On `/admin`, the beacon never loads.
  - The Estadísticas tab renders: it shows the "no data yet" message if the table is empty. If nobody is signed in on localhost, note that this check was skipped.
  - At a phone width of 375 px, nothing scrolls horizontally on the legal pages or the stats grid.

- [ ] **Step 3: Apply the migration to production.**
  - With the user's OK, run `set -a; . ./.env; set +a; npx supabase@3.1.0 db push --remote --password "$SUPABASE_DB_PASSWORD" --dry-run`, then run it without `--dry-run`.
  - Check as anon that `signin_hours` and the RPC are refused.

- [ ] **Step 4: Set the repo variable.** With the user's OK, run `gh variable set PUBLIC_CF_ANALYTICS_TOKEN` with the value read from `.env`, without echoing it.

- [ ] **Step 5: Push and check the deploy.**
  - Run `git push`, then `gh run watch` on the deploy run.
  - `curl` the live `/cookies/` and `/` and confirm `amg-analytics` is present. On `/admin/` it must be absent.
  - Close issue #1, with the user's OK.
