# Data rules for a growing museum: design

Date: 2026-11-27. Status: waiting for the maintainer's approval.
Related issues: #30 (museum), #29 (privacy periods), #26 (multimedia), #31 (analytics), #197 (source captures).

## Why

amgueddfa.org is widening from four Patagonian eisteddfodau to Welsh history abroad. The
site was built around four festivals and one kind of asset (a programme document). Each
new kind of material has so far added its own fields, flags, scripts and data store. The
maintainer wants to simplify and set rules now, before the next collection goes in.

Measured on 2026-11-27:

| Area | Today | Limit it hits |
|---|---|---|
| Pages × languages | Every page built 7 times (Astro i18n fallback "rewrite") plus about 8,200 forwarding pages; site about 478 MB | GitHub Pages allows 1 GB. A document page is about 31 KB per language; 7,772 press articles as pages would add about 1.7 GB |
| Collections | `FestivalSlug` is a fixed union used in 12 files of `src/lib`, 8 pages, 4 browser scripts; 4 `check (festival in (…))` rules in 3 migrations | A new collection needs code, database and translation changes |
| Types | 6 categories (bases 412, programa 142, preliminares 85, programa-del-dia 82, resultados 68, otros 46), 5 file kinds; 2,069 videos in a separate model | No shape for press, photos, audio |
| Rights | Free text on each item: 788 of 835 empty, 13 wordings | Cannot be checked, filtered or shown the same way |
| Visibility | `restricted`, `hidden`, files released live by an admin, the plan in #29 | No single answer to "who can see this?" |
| Data stores | catalog.json, Supabase, `data/approved/`, videos.json, transcriptions, OCR, lyrics | One more per asset type |

## Goals

1. Adding a collection is a data change: one entry in a list, no new code paths.
2. Every record, of any type, has the same core fields.
3. Rights and visibility are fixed lists, and a test fails when a record has neither.
4. The site's size grows with the number of records, not records × 7 languages.
5. The rules are written in one short file and enforced by tests.

## Non-goals

- Publishing Y Drafod. This design makes room for it; loading it is a later project.
- The museum's look, home and navigation (#30's UX part).
- Choosing a new host. The structure must work on GitHub Pages and on Cloudflare.
- Merging the Python and TypeScript pipelines, or reducing the data stores. Noted as the
  next simplification after this one.
- Media ↔ competition links (#29's second half).

## Anti-goals

- Nothing private becomes public by any step: restricted results, the private press
  store, children's material.
- No current address stops working.
- No step leaves the site unable to build or deploy.

## Decisions by the maintainer (2026-11-27)

| Thread | Decision |
|---|---|
| Material to design around | The press (Y Drafod): the hardest case for size and rights |
| Languages | Browse pages in 7 languages. Deep pages (one document, one issue) built once, with menus and labels translated in the browser |
| Hosting | Decide later; add a size test now |
| First simplification | Data rules |
| Visibility | 3 levels plus an optional "public from" date |
| Press, first release | Index with a link to the Library's viewer; full text and image only for eisteddfod articles |
| Press pages | One page per issue; each article is a linked section inside it |
| Rights | On the source, inherited by its records, with a per-record override |
| Rollout | Small steps, each merged, the site working after each |
| Types | One site-wide list; each collection declares the subset it uses |
| Backlog | One roadmap issue; close the stale small issues after listing them |

## Approaches considered for the rollout

1. **Small steps, each merged (chosen).** About six pull requests in a fixed order. Old
   field names are still read until the last step, so every step can ship alone and be
   reverted alone. Costs a short period with old and new names side by side.
2. **Rules on top, data untouched.** Compute the new fields from the old flags at build
   time. Fastest, but the old flags stay in the catalog and the database for good, which
   is the mess this work is meant to remove.
3. **One full migration.** Cleanest end state, but one very large change touching the
   catalog, 13 migrations' worth of tables and about 45 files, with the site frozen
   while it lands.

## Design

### 1. Collection list

A single file, `src/data/colecciones.json`, read by TypeScript, by the Python catalog
builder and by the database seed:

```json
{
  "id": "chubut",
  "grupo": "eisteddfod",
  "forma": "ediciones",
  "tipos": ["programa", "programa-del-dia", "preliminares", "bases", "resultados", "otros", "video"],
  "derechos_por_defecto": null,
  "visibilidad_por_defecto": "publico"
}
```

- `grupo` is the address segment (`/eisteddfod/`, later `/prensa/`). `EISTEDDFOD_SEGMENTS`
  in `src/lib/paths.ts` is derived from the list instead of written by hand.
- `forma` says how the collection is browsed: `ediciones` (year pages, as today) or
  `numeros` (dated issues, for the press). These are the only two forms for now. A new
  form is the one thing that still needs code.
- `FestivalSlug` becomes `CollectionId = string`, checked against the list at build time.
  Functions that are truly about eisteddfodau keep a narrower type derived from
  `grupo === 'eisteddfod'`.
- Collection names live in the i18n files under `coleccion.<id>`, as festival names do
  today.

### 2. One record shape

Every record, document or video or article, has this core:

| Field | Meaning |
|---|---|
| `id` | Stable, as today |
| `coleccion` | An id from the list (replaces `festival`) |
| `fecha` | `{ year, month?, day?, inferred, undated }` (replaces `year`, `year_inferred`, `undated`) |
| `tipo` | From the site-wide list (replaces `category`) |
| `formato` | image, pdf, doc, web, table, video, audio (replaces `kind`) |
| `fuente` | The source key that `src/lib/fuentes.ts` already computes |
| `derechos` | Optional override; otherwise inherited from the source |
| `visibilidad` | See below |
| `publico_desde` | Optional date |
| `titulo` | As today |

Type-specific parts stay beside the core (`pages`, `page_paths`, `table` for documents;
duration and transcript for videos; issue and page number for articles). Videos keep
their own file and code; they gain the core fields so lists, search and rules treat
them like any other record.

Site-wide type list: `programa`, `programa-del-dia`, `preliminares`, `bases`,
`resultados`, `prensa`, `foto`, `video`, `audio`, `otros`. The six current categories
keep their ids, so no document address or filter changes.

### 3. Visibility

One field replaces `restricted`:

| Level | Page | Lists and search | Files and text |
|---|---|---|---|
| `publico` | yes | yes | yes |
| `solo_ficha` | yes: title, date, source, a notice | yes | no |
| `privado` | no | no | no |

`publico_desde` (a date) makes a record behave as `solo_ficha` or `privado` until that
day and as `publico` after it; the level it holds before that day is the stored
`visibilidad`. The date is evaluated by the catalog builder, not the site build
(builder's call, 2026-11-27): the same run moves the record's files from
`.restricted/` to the public bucket, so a page never opens before its files. A
record opens on the first catalog build on or after the date. This is the mechanism #29 needs for privacy periods; the
periods themselves (how many years, for whom) remain #29's decision.

Mapping of today's data:

| Today | Becomes |
|---|---|
| `restricted: true` | `solo_ficha` |
| A restricted item released by an admin (live, from the media bucket) | stays `solo_ficha` in the catalog; the live release still opens it, as today. Folding releases into the catalog is left open |
| `hidden: true` ("no corresponde" report) | `solo_ficha` with the existing notice; off lists, as today, through a separate `retirado` mark |
| `no_text` | unchanged; it is about transcription, not visibility |

`hidden` does not map cleanly: a hidden item keeps its page but leaves every list. It
stays as its own mark (`retirado`) rather than being forced into the scale.

One function, `visibleAs(record, today)`, answers every visibility question. All the
current `!i.restricted` and `!i.hidden` checks call it.

### 4. Rights

Each source (`/fuente/<slug>/`) carries:

- `licencia`: one code from a fixed list: `dominio-publico`, `cc-by-sa-4.0`,
  `cc-by-sa-3.0`, `creative-archive`, `con-permiso` (all rights reserved, reproduced by
  permission), `desconocido` (the holder says unknown), `sin-declarar`.
- `titular`: the holder's name, free text.
- `nota`: optional free text.

A record's rights are its own `derechos` if set, else its source's, else its
collection's default. A test fails when a public record resolves to nothing. The 788
empty items resolve through their sources; any source left without a statement is
listed for the maintainer, who decides its code. `sin-declarar` exists so that the first
step can ship honestly, and the count of `sin-declarar` records is printed by the build.

Source statements live in a new file, `src/data/fuentes.json`, keyed by the same source
key the source pages use.

### 5. Database

- A `colecciones` table seeded from the list file; the four `check (festival in (…))`
  rules become foreign keys to it. The check that keeps public winners lists to Chubut
  and Trevelin stays, expressed against the table (a `ganadores_publicos` column).
- Column names in the database stay `festival` in this round. Renaming them touches
  every stored function and the admin; it is left for a later step and noted as open.
- Production changes follow the standing rule: maintainer's OK first, dry run before
  every write.

### 6. Deep pages built once

Two kinds of pages:

- **Browse pages** (hub, collection home, year, search, tasks, static pages): 7
  languages, as today.
- **Deep pages** (item, source, later press issue): built once at the Spanish address.
  The page's own content is already in the document's language. The surrounding labels
  are rendered in Spanish and carry a `data-i18n` key; a small script replaces them from
  a per-language JSON file when the visitor's chosen language is not Spanish.

Consequences to handle:

- The language-prefixed deep addresses that exist today (`/cy/eisteddfod/item/x/`)
  become forwarding pages that keep the language choice, or are served by the 404
  forwarder. Which of the two is a builder's call once the file count is measured.
- `hreflang` alternates are dropped from deep pages; the canonical is the single address.
- Search engines see deep pages with Spanish labels. Accepted: the content, not the
  labels, is what is searched.
- Without JavaScript a deep page shows Spanish labels. Accepted.
- The visitor's language is read from the address they came from and kept in
  `localStorage`, as the reading settings are.

Expected effect: item pages go from about 26 MB × 7 to about 26 MB once, and the
forwarding pages for moved item addresses shrink the same way.

### 7. Budget test

A build test fails when the built site passes a set size or file count. Starting
values: 700 MB and 40,000 files (30,470 files on 2026-11-27; Cloudflare Pages takes at most 20,000, which step 6 should bring the site under). The build prints both numbers, per top-level folder.

### 8. Rules file

`docs/reglas.md`, one page:

1. A collection exists only as an entry in the list.
2. A record has the core fields; a test rejects one without `coleccion`, `tipo`,
   `visibilidad` and a resolvable rights statement.
3. A new type is added to the site-wide list with its 7 translations before any record
   uses it.
4. A deep page is built once; a new page type states whether it is browse or deep.
5. Nothing is public unless its record says so. The default for a new collection is
   `privado`.
6. The build stays under the budget.

Each rule names the test that enforces it.

### 9. The press, as a check on the design

Not built in this round. With the rules above, Y Drafod is:

- one collection: `{ id: "y-drafod", grupo: "prensa", forma: "numeros", tipos: ["prensa"], visibilidad_por_defecto: "solo_ficha" }`;
- 305 issue pages (deep, built once), each article a section with its own anchor;
- articles as records with `tipo: prensa`; `solo_ficha` shows date, title and a link to
  the National Library's viewer; the eisteddfod articles are `publico` and link to their
  edition;
- one source (the Library) carrying `licencia: desconocido`.

About 305 pages and no new code path except the `numeros` form. That is the test that
the rules hold.

## Steps

Each is one pull request, merged before the next starts.

| # | Step | Settles |
|---|---|---|
| 1 | Collection list; `FestivalSlug` and `EISTEDDFOD_SEGMENTS` derived from it; rules file started; budget test | part of #30 |
| 2 | Visibility field and `visibleAs`; catalog builder writes it; old flags still read | mechanism for #29 |
| 3 | Rights on sources, inherited; list of sources needing a decision | — |
| 4 | Core record fields in the catalog and on videos (`coleccion`, `fecha`, `tipo`, `formato`); old names removed from the site code | part of #26 |
| 5 | Database: `colecciones` table and foreign keys (maintainer's OK needed) | part of #30 |

Maintainer, 2026-11-27: steps 4 and 5 go together: the database columns and the
code are renamed in one change (one vocabulary everywhere), applied only with the
maintainer's OK.
| 6 | Deep pages built once | size |

Then, separately: a roadmap issue listing these steps with #26, #29, #30 and #31 linked
to the step that settles each part; and a pass over the small admin issues (#2–#15),
listing for the maintainer which are already fixed or no longer apply before closing any.

## Left to the builder

- File and function names beyond those given here.
- How the catalog builder (Python) and the site (TypeScript) share the list file.
- Forwarding pages or the 404 forwarder for old language-prefixed deep addresses. Done (step 6): the 404 forwarder, to stay under
  Cloudflare Pages' 20,000 files.
- How labels are marked and swapped on deep pages, as long as it works without a
  framework and passes the existing accessibility checks.
  Done (step 6): no marking; the build learns each language's labels from the
  translated renders it already makes, checks that the swap reproduces every one
  exactly, then deletes them (`scripts/paginas_unicas.mjs`).

## Open, for later

- Renaming the database's `festival` columns.
- The privacy periods themselves (#29).
- Whether an admin's live release should be written back to the catalog as `publico`.
- The host, when the budget test first fails.
- One pipeline and fewer data stores.
- Real source captures (#197, on hold).
