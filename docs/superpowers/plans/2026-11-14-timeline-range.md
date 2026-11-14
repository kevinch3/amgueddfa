# Timeline Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timelines start at each festival's earliest documented year, whole empty decades collapse to one expandable row, and every timeline offers a link to contribute older years.

**Architecture:** `src/lib/catalog.ts` computes the start year at build time from the catalog plus `data/approved/contributions.json`. A new pure module `src/lib/timeline.ts` groups a year range into decades and marks the empty ones. The home grid (`CoverageGrid.astro`) and the festival year list (`[festival]/index.astro`) render empty decades as `<details>` so their cells stay in the DOM for the live-state script `src/scripts/edicion.ts`.

**Tech Stack:** Astro (static), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-timeline-range-design.md`

## Global Constraints

- Start year = earliest year among the festival's dated catalog items and its approved contributions with a non-null year (any type). With neither, start = current year. End = current year.
- `YEAR_FLOOR` stays `1865` and only bounds the contribution form/validation; it no longer drives `yearRange`.
- Edition pages are built for every year in `yearRange`, including years inside collapsed decades.
- An empty decade = every year of that decade inside the range has state `none`, and it contains neither the start year nor the current year.
- Copy is es-AR (Rioplatense voseo). Collapsed row: `{from}–{to} · sin material`. Prompt: `¿Tenés material de antes de {year}?` + link text `Contribuí` to `contribuir?f=<slug>` (no `y`).
- "Material desde {year}" and the home counter's `desde` use the same start year (hidden on a festival with no material).

## Review Focus

- A cell inside a collapsed decade turns non-`none` live (approved after the build): its `<details>` must open so the colour is visible. Test in Task 3.
- First partial decade (e.g. 1975–1979) on the desktop 10-column grid must still start at the right column (`--start`) and a collapsed row right after it must begin on a new row. Checked by build-test assertions in Task 3.
- Festival with no material at all (fixture: `trevelin` in unit tests): range is `[now, now]`, no "Material desde", prompt says "antes de {now}". Test in Task 1.
- Approved contribution with `year: null` or `festival: null` must not affect the range. Test in Task 1.
- Home "N editions complete" count and `mostWanted` must not change for real data (range only grows to approved years). Covered by existing tests staying green.

---

### Task 1: Start year from catalog + approved contributions

**Files:**
- Modify: `src/lib/catalog.ts:49-67` (`YEAR_FLOOR`, `yearRange`, `firstMaterialYear`)
- Modify: `tests-js/catalog.test.ts:36-48`
- Modify: `tests-js/build.test.ts:13-16` (`range` helper)

**Interfaces:**
- Produces: `firstMaterialYear(f: FestivalSlug, approved?: DatedLike[]): number | null` — default `approved` is every row of `contributions.json`. `yearRange(f: FestivalSlug, approved?: DatedLike[]): [number, number]` = `[firstMaterialYear(f, approved) ?? now, now]`. `type DatedLike = { festival: string | null; year: number | null }`. `YEAR_FLOOR = 1865` kept.

- [ ] **Step 1: Replace the two yearRange/firstMaterialYear tests with**

```ts
it('yearRange starts at earliest catalog or approved year', () => {
  const now = new Date().getFullYear();
  expect(yearRange('chubut', [])).toEqual([1990, now]);
  expect(yearRange('chubut', [{ festival: 'chubut', year: 1930 }])).toEqual([1930, now]);
  expect(yearRange('trevelin', [])).toEqual([now, now]);
});

it('firstMaterialYear ignores undated or unassigned contributions', () => {
  const noise = [{ festival: 'chubut', year: null }, { festival: null, year: 1900 }, { festival: 'mimosa', year: 1950 }];
  expect(firstMaterialYear('chubut', noise)).toBe(1990);
  expect(firstMaterialYear('mimosa', noise)).toBe(1950);
  expect(firstMaterialYear('trevelin', [])).toBeNull();
  expect(YEAR_FLOOR).toBe(1865);
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/catalog.test.ts`** — Expected: FAIL (range still starts at 1865).

- [ ] **Step 3: Implement** the signatures above. Import the full `approvedRaw` list once as `APPROVED_DATED: DatedLike[]` beside `APPROVED_UPLOADS`.

- [ ] **Step 4: Update `range()` in `tests-js/build.test.ts`** to the same rule: min over dated catalog items of `f` and rows of `data/approved/contributions.json` with `festival === f && year !== null`, else current year.

- [ ] **Step 5: Run `npx vitest run`** — Expected: all pass (home and festival pages already read `firstMaterialYear`).

- [ ] **Step 6: Commit** `catalog: timelines start at earliest catalog or approved year`

### Task 2: Decade grouping

**Files:**
- Create: `src/lib/timeline.ts`
- Test: `tests-js/timeline.test.ts`

**Interfaces:**
- Produces: `type Decade = { from: number; to: number; years: number[]; empty: boolean }` and `decades(first: number, last: number, isEmpty: (y: number) => boolean): Decade[]`, ascending. `from = max(decadeStart, first)`, `to = min(decadeStart + 9, last)`; `empty` per Global Constraints.

- [ ] **Step 1: Write tests**

```ts
const none = (ys: number[]) => (y: number) => !ys.includes(y);
it('groups by decade and clips to the range', () => {
  const d = decades(1975, 2001, () => false);
  expect(d.map((x) => [x.from, x.to])).toEqual([[1975, 1979], [1980, 1989], [1990, 1999], [2000, 2001]]);
});
it('marks only fully empty middle decades', () => {
  const d = decades(1930, 2026, none([1930, 1955, 2026]));
  expect(d.filter((x) => x.empty).map((x) => x.from)).toEqual([1940, 1960, 1970, 1980, 1990, 2000, 2010]);
});
it('never collapses the first or current decade', () => {
  const d = decades(1931, 2026, () => true);
  expect(d[0].empty).toBe(false);
  expect(d.at(-1)!.empty).toBe(false);
});
it('single-year range', () => {
  expect(decades(2026, 2026, () => true)).toEqual([{ from: 2026, to: 2026, years: [2026], empty: false }]);
});
```

- [ ] **Step 2: Run `npx vitest run tests-js/timeline.test.ts`** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `decades`.**
- [ ] **Step 4: Run it again** — Expected: PASS.
- [ ] **Step 5: Commit** `timeline: group a year range into decades, mark empty ones`

### Task 3: Home grid — collapsed decades and earlier-year prompt

**Files:**
- Modify: `src/components/CoverageGrid.astro`
- Modify: `src/styles/global.css:120-133, 244-253`
- Modify: `src/i18n/es-AR.json` (`festival` block: add `decada_vacia`, `antes`, `antes_link`)
- Modify: `src/scripts/edicion.ts:166-205` (open collapsed decade on live upgrade)
- Modify: `src/lib/timeline.ts` (add `revealDecade`)
- Test: `tests-js/build.test.ts`, `tests-js/timeline.test.ts` (the repo has no DOM test environment; test `revealDecade` with a minimal stub object, do not add jsdom)

**Interfaces:**
- Consumes: `decades()` (Task 2), `yearRange`/`firstMaterialYear` (Task 1).
- Produces: markup contract used by Task 4 and `edicion.ts`: collapsed decade = `<details class="decada-vacia" data-decada-vacia>` with `<summary>` text `t('festival.decada_vacia', { from, to })`; its cells keep the existing `data-cell data-festival data-year data-state` attributes.

- [ ] **Step 1: Add build assertions** to the home-grid test: cell count per festival still equals `b - a + 1`; for each festival the page contains `contribuir?f=${f}"` and `¿Tenés material de antes de ${firstYear}?`.
- [ ] **Step 2: Add a timeline test** for `revealDecade(node: { closest(sel: string): { open: boolean } | null }, state: EditionState): void`: with `state` `'some'` the stub's `open` becomes `true` and `closest` was called with `'details[data-decada-vacia]'`; with `'none'` it stays `false`; a `null` from `closest` does not throw.
- [ ] **Step 3: Run both** — Expected: FAIL.
- [ ] **Step 4: Render** each festival's single `ul.cells`, iterating `decades(first, last, y => editionState(f.slug, y) === 'none')`: non-empty decades emit their cells as today; an empty decade emits one `<li class="decada-li">` spanning the full row (`grid-column: 1 / -1`) holding the `<details>` with its own nested `ul.cells` (no `--start` offset inside). Keep `--start` on the outer list. Add the prompt `<p>` after the list.
- [ ] **Step 5: Implement `revealDecade` in `src/lib/timeline.ts`** and call it in `edicion.ts` wherever a node's `data-state` is raised.
- [ ] **Step 6: Run `npx vitest run`** — Expected: all pass. Then `npx astro dev` and check the home grid at 375px and ≥768px widths: decade columns still align, collapsed row on its own line.
- [ ] **Step 7: Commit** `home grid: collapse empty decades, prompt for earlier years`

### Task 4: Festival page — collapsed decades and earlier-year prompt

**Files:**
- Modify: `src/pages/[festival]/index.astro:13-57`
- Modify: `src/styles/global.css:183-192`
- Test: `tests-js/build.test.ts`

**Interfaces:**
- Consumes: `decades()`; the `details[data-decada-vacia]` contract from Task 3.

- [ ] **Step 1: Add build assertions**: `dist/<f>/index.html` has one `.timeline [data-state]` row per year in range and contains `contribuir?f=<f>"`.
- [ ] **Step 2: Run** — Expected: FAIL on the prompt.
- [ ] **Step 3: Render** decades newest-first; an empty decade becomes one `<li class="tl-none">` holding the `<details data-decada-vacia>` whose body is the ten year rows. Add the prompt under the header's "Material desde" line.
- [ ] **Step 4: Run `npx vitest run`** — Expected: all pass. Check `/chubut/` in `astro dev`.
- [ ] **Step 5: Commit** `festival page: collapse empty decades, prompt for earlier years`
