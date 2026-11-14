# Timeline range: start at real material, collapse empty decades

## Why

Commit 5c609af made every timeline start at 1865 so a contributor could add
material for Chubut 1930. That fixed the blocker but gave Mimosa, Trevelin and
Juventud ~140 empty years before they existed. We want timelines that start
where documentation actually starts, a clear way to add older years, and no
rows of empty cells for long gaps.

## Goals

- Each festival's timeline starts at its earliest documented year.
- Contributors can always add a year earlier than that start.
- Whole empty decades take one row, not ten cells, but stay reachable.

## Non-goals / anti-goals

- No per-festival founding dates to maintain by hand.
- No live (browser-side) extension of the range; the timeline is static.
- Must not break decade alignment of the desktop grid (10 columns, `--start`).
- Must not hide a decade that has any material.

## Approaches considered

1. **Range from catalog + approved contributions at build time** — chosen.
   Simple, all static; a new early year appears after approval and the next
   export (weekly, or run by hand).
2. Same plus a live Supabase check that adds cells immediately — rejected:
   no static page exists for the new year until a build, so cells would 404.
3. Fixed founding year per festival — rejected: brings back long empty runs
   and needs dates researched and maintained.

Gap rule: **whole empty decades collapse** (chosen) vs. any run of N+ empty
years (rejected: breaks the decade-aligned grid).

## Design

- **Start year** = earliest year among the festival's dated catalog items and
  its approved contributions with a year (`data/approved/contributions.json`,
  any type). Fallback when none: current year. End = current year.
  `YEAR_FLOOR` (1865) stays as the form/validation floor only.
- **Edition pages** are built for every year in the range, including years
  inside collapsed decades, so links and prev/next navigation keep working.
- **Empty decade** = a decade (e.g. 1940–1949) in which every year inside the
  range has state `none`. The decade holding the start year and the current
  decade are never collapsed. *(Builder's call: they always hold material or
  "now".)*
- **Home grid and festival grid (`CoverageGrid`)**: an empty decade renders as
  one row, "1940–1949 · sin material", which expands to its 10 cells. *(Our
  call: use `<details>` so the cells stay in the DOM for live state scripts and
  work without JS.)*
- **Festival page year list** (newest first): collapses empty decades the same
  way.
- **Earlier-year prompt**: under each festival's timeline, "¿Tenés material de
  antes de {first}? Contribuí", linking to `contribuir?f=<slug>` with no year.
- **"Material desde"** texts (festival page, home counter) use the same start
  year, so an approved 1930 contribution reads "Material desde 1930".

## Left to the builder

- Exact i18n keys and copy polish (es-AR, Rioplatense voseo, as elsewhere).
- Styling of the collapsed row within the existing `.cells` grid.
- Test updates in `tests-js/catalog.test.ts` and `tests-js/build.test.ts`.
