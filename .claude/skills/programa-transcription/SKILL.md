---
name: programa-transcription
description: Use when transcribing an Eisteddfod programa (list of competitions) or a Ganadores / resultados list from the archive, when adding or fixing files in src/data/transcripciones/, or when a transcription does not show on an item or edition page.
---

> **Since 2026-11-17 (issue #27) the database is the source.** Transcriptions live in the Supabase table
> `transcriptions` (history in `transcription_history`). Edit them on the item page, signed in as admin,
> in "Curaduría (administración)" → "Transcripción del documento": kind, the document's images, public flag,
> text, preview, history and restore. `src/data/transcripciones/` and `src/data/ganadores/` are the
> export snapshot written by `scripts/export_approved.mjs` (every 15 minutes in CI). Don't edit them by
> hand: the next export overwrites them. To load many new files at once, write them in the format below and
> run `node --env-file=.env scripts/seed_transcriptions.mjs` (it never overwrites a document already in the
> table). Items with nothing to transcribe are marked with the panel's "Sin texto para transcribir"
> (the old `data/sin_texto.tsv` was loaded as those corrections and removed).
> Private winners lists (Mimosa, Juventud) are not in the database; they stay in `../.transcripciones/ganadores/`.

# Programa and Ganadores transcriptions

## Every document gets one (user rule, 2026-11-19)

**All documents get a transcription**, not only programas and winners lists. Priority order:
programa → programa del día → resultados → preliminares → bases y avisos → otros (press, photos with
captions). Only items with no text at all (a photo of people, a building) are marked "Sin texto para
transcribir" instead.

- **Group first, transcribe once.** Several images or captures of ONE resource (a flyer shot in parts, a
  multi-page programa photographed page by page, the web page that only links the PDF, a newspaper article
  continued on another page) get ONE transcription file: front matter `items:` lists every item, the file is
  named after the first in reading order. Look at the images (contact sheet, `sheet.py`) before deciding:
  same document, same date and source = one group; reposts of the same flyer = one group.
- **Documents that are not lists** (bases, avisos, preliminares notices, press articles): a faithful
  transcription of the text in reading order, original language, `##` for the printed headlines, paragraphs
  as printed, the closing `## Notas · Nodiadau` for date, source, inferred data and names as printed. Leave out
  unrelated items on the same page (other news, ads), naming them in the notes.
- Stored as kind `programa` (`src/data/transcripciones/`), the only public kind besides `ganadores`; lists of
  results and qualifiers follow the Ganadores rules (Mimosa and Juventud stay private).
- An item already in the database: change its `items` with SQL (`update public.transcriptions set items = …`),
  then `scripts/export_approved.mjs`; `seed_transcriptions.mjs` never updates an existing row.

## Where they go

| What | File | Public? |
|---|---|---|
| Programa (category `programa`) | `src/data/transcripciones/<item id>.md` (committed) | yes: item page in full, edition page folded under Programa |
| Ganadores / resultados | `../.transcripciones/ganadores/<item id>.md` (archive, never committed) | **no**: the master copy of every winners list |
| Ganadores of Chubut and Trevelin | also copied to `src/data/ganadores/<item id>.md` (committed) | yes: folded under Resultados on the edition page; the result document stays restricted. Mimosa and Juventud stay private (user decision 2026-11-14: whole festivals only) |
| Visitors' "Transcribir" task | `contributions` (type `transcription`, max 15000 chars) | shown live with the contributor's name next to ours |

`<item id>` is the catalog id (`src/data/catalog.json`) of the document's first item, never a file name. Never transcribe a
restricted item into the committed folder (the build test fails).

## The standard (what goes in, what stays out)

Keep only what identifies each competition, plus the jurados:

- **In:** discipline, age group / category, form (solo, coro, cuento…), the title of the
  work, author / composer / arranger, named prizes and trophies (Premio «Mimosa», Gwobr
  «Telyn», Sillón / Corona), the list of jurados with their discipline.
- **Out:** submission rules (sizes, copies, seudónimo, sobres, deadlines, durations,
  partituras), eligibility notes, disclaimers and clarifications, footnote markers like
  `(x)`, schedules and session order, sponsors, greetings, ads, committee lists, prices.
- **Language:** as printed. Never translate (Welsh stays Welsh, "English to Spanish" stays).
  When a heading is bilingual, join both with ` · ` (`## Música · Cerddoriaeth`).
  When the same competition is printed in both languages, keep both on one line, Spanish
  first, joined with ` · ` (`3. Solo soprano: «…» · Unawd soprano: «…»`); the shared work
  title and author appear once if identical.
- **Order:** competitions and headings in printed order; never regroup or renumber.
- **Normalise:** titles in «», `N.` numbering exactly as printed (`12a.` allowed), sentence
  case for headings, fix obvious typos and OCR errors in titles and wording.
- **People's names stay as printed** (authors, composers, arrangers, jurados, winners,
  seudónimos), even when misspelt or incomplete: "Irma" stays "Irma", "Selwyn Griffiths" stays.
  A correction or identification goes in a closing notes block, never in the line itself
  (user decision 2026-11-17):

  ```
  ## Notas · Nodiadau
  - Comp. 12: impreso «Selwyn Griffiths»; probablemente Selwyn Griffith.
  ```
- **Illegible:** `[ilegible]`; a page that is missing: `[falta la página N]` as a text line.

## Format (parsed by `src/lib/transcripciones.ts`)

```
## Literatura · Llenyddiaeth          discipline (first line must be one)
### Adultos                           optional age group / sub-discipline
1. Penillion syml: «Ar lan y môr».    numbered competition
12a. Cuento: tema libre.
- Poesía en castellano: tema libre.   unnumbered competition
## Jurados · Beirniaid
- Música: Clydwyn Jones, Nombre Apellido.
```

Anything else is shown as a plain paragraph — avoid it.

Ganadores lists use the same headings, one line per competition, sorted by competition number
when the source isn't in order (web listings follow the session order):
`12. Solo soprano: 1.º Nombre Apellido (Trelew); 2.º (compartido) …; 1.ª mención …` — pseudonyms as
`(seud. «X»)`, `desierto` when void. A `## Premios especiales` block first (Gorsedd, ADICORA,
Excelencia musical, Cinta Azul). Use the edition's programa transcription for competition titles
when the source only gives numbers. Never copy what a source obviously repeats by mistake (the
Juventud 2014 page repeats comp. 20's winners under other competitions): write
`[la fuente repite …; resultados no disponibles]`. Photos without results get no file;
`.transcripciones/ganadores/README.md` lists what has a file and why the rest doesn't.

## Programa del día (category `programa-del-dia`, public)

Same file place and format; it folds under "Programa del día" on the edition page. Here the
session order *is* the content, so it is kept:

```
## Viernes 26 de octubre · Dydd Gwener, 18 h        one heading per day / session, as printed
47. Dúo a elección en galés · Deuawd agored: hunanddewisiad.
- Veredicto comp. 2: Soned: «Taith» neu «Teithio».   verdicts read in the session
8. Ceremonia de la Medalla de Plata, «Premio Asociación San David»: poesía de estilo tradicional.
- Distinción especial a la mejor interpretación coral (ADICORA).
## Jurados · Beirniaid
```

- **In:** sessions (day, name, start time), competitions in the order performed, verdicts of
  competitions that are not performed (literature, translation, art, photography: the verdict
  line is their only appearance; drop the bare "Veredicto comp. N" after a performance), the
  ceremony a competition belongs to (on its own line, not as a `###` that would swallow the
  following items), named prizes and special distinctions, jurados.
- **Out:** committee, coordinators, locutores, translators, salón, ceremony helpers (escoltas,
  dama de las flores), prayers, anthems, minute of silence, breaks, tea, asado, Gymanfa Ganu,
  venue addresses, the anthem lyrics.
- **Competitors' names never go in** (Juventud lists are minors): if a sheet lists who performs,
  keep only the competition line.
- Locutores' scripts and texts read aloud (traducciones de textos, presentaciones) get no file;
  session-announcement posters without a competition list get no file.

## How to get the text

| Source | Method |
|---|---|
| Web page (`kind: web`) | `_html_text(Path(src), keep_breaks=True)` from `scripts/catalog/derive.py` |
| PDF with text layer | `pdftotext -layout file.pdf -` (check per page: some PDFs mix scans) |
| Scanned PDF / image | find the competition pages with a contact sheet (`python3 .claude/skills/programa-transcription/sheet.py media/<id> out.jpg 7 1-21`), then read the page images (`media/<id>/pNN.webp` or `pdftoppm -r 150`) with the Read tool; `tesseract` here has only `eng`, so don't rely on it for Welsh/Spanish |

Two captures of the same page (identical extracted text) get one file, under the older capture's
id, so the edition page doesn't list it twice.

When a scanned programa and a competition-list table (`kind: table`) hold the same list,
the transcription goes on the scan (it has no text of its own; the table item shows its table).
Non-competition images (covers, posters, schedules, session announcements, rules slides) get no file.

**One file per document.** A programa, programa del día or winners list split over several
catalog items (pages photographed one by one, Facebook posts of one list, sections as separate
PDFs of the same printed programa) gets ONE file, named after its first item in reading order,
with front matter listing every item it covers (`src/lib/docmd.ts`):

```
---
items: 58897881813d 74ba4c04b85f
---
## Literatura · Llenyddiaeth
```

Every listed item shows the same text (with links to the others) and the edition page lists the
document once. An item can belong to only one file (the build fails otherwise). Keep really
different documents apart (a draft and the final version). A PDF that holds Chubut + Juventud goes
under its own item id with both festivals' competitions in it.

## Check and publish

`npx vitest run tests-js/transcripciones.test.ts` (format), then the full suite (the build test
checks every file shows on its item and edition page), commit, push `main`.
