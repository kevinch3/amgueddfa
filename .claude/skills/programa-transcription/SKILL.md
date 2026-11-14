---
name: programa-transcription
description: Use when transcribing an Eisteddfod programa (list of competitions) or a Ganadores / resultados list from the archive, when adding or fixing files in src/data/transcripciones/, or when a transcription does not show on an item or edition page.
---

# Programa and Ganadores transcriptions

## Where they go

| What | File | Public? |
|---|---|---|
| Programa (category `programa`) | `src/data/transcripciones/<item id>.md` (committed) | yes: item page in full, edition page folded under Programa |
| Ganadores / resultados | `../.transcripciones/ganadores/<item id>.md` (archive, never committed) | **no**, private until the user says otherwise |
| Visitors' "Transcribir" task | `contributions` (type `transcription`, max 5000 chars) | shown live with the contributor's name next to ours |

`<item id>` is the catalog id (`src/data/catalog.json`), never a file name. Never transcribe a
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
  case for headings, fix obvious typos and OCR errors, names spelled as the site unifies
  them (Owen Tudur Jones, Geraldine Mac Burney, Lois Medi Wiliam).
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
| Scanned PDF / image | find the competition pages with a contact sheet (`python3 .claude/skills/programa-transcription/sheet.py public/media/<id> out.jpg 7 1-21`), then read the page images (`media/<id>/pNN.webp` or `pdftoppm -r 150`) with the Read tool; `tesseract` here has only `eng`, so don't rely on it for Welsh/Spanish |

Two captures of the same page (identical extracted text) get one file, under the older capture's
id, so the edition page doesn't list it twice.

When a scanned programa and a competition-list table (`kind: table`) hold the same list,
the transcription goes on the scan (it has no text of its own; the table item shows its table).
Non-competition images (covers, posters, schedules, session announcements, rules slides) get no file.

Several catalog items can be parts of one programa (Literatura, Música… as separate PDFs):
transcribe each item into its own file. A PDF that holds Chubut + Juventud goes under its
own item id with both festivals' competitions in it.

## Check and publish

`npx vitest run tests-js/transcripciones.test.ts` (format), then the full suite (the build test
checks every file shows on its item and edition page), commit, push `main`.
