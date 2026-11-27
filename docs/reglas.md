# Rules for adding to the museum

amgueddfa.org grows by collections (the four Eisteddfod festivals today; the press,
the Gorsedd and others later) and by records (documents, videos, articles, photos).
These rules keep that growth to data changes. Each names the test that enforces it.
Design and reasons: `docs/superpowers/specs/2026-11-27-reglas-de-datos-design.md`.

1. **A collection exists only as an entry in `src/data/colecciones.json`.**
   Pages, addresses (`url()` in `src/lib/paths.ts`), contribution forms, the catalog
   builder (`scripts/colecciones.py`) and the video exports read it. Never write a
   list of collection ids in code.
   Test: `tests-js/colecciones.test.ts`, `tests/test_colecciones.py`.

2. **A record has the core fields**: collection, date, type, format, source,
   visibility, and a rights statement it can resolve (its own, its source's or its
   collection's).
   Rights: `derechosDe()` in `src/lib/derechos.ts` resolves the record's credit line,
   else its source's statement in `src/data/fuentes.json`, else the collection's
   `derechos_por_defecto`, to one licence code (`LICENCIAS`). A new credit-line
   wording needs a rule there; the build prints the count per code.
   Core fields: `coleccion`, `fecha {year, inferred, undated}`, `tipo`, `formato`
   (`src/lib/types.ts`, `scripts/catalog/model.py` `as_record`); the database names
   the collection `coleccion` too, checked against the `colecciones` table.
   Test: `tests-js/derechos.test.ts`, `tests-js/colecciones.test.ts`,
   `supabase/tests/colecciones.test.ts`.

3. **A type is added to the site-wide list (`tipos` in `colecciones.json`) with its
   name in all 7 languages (`categorias.<tipo>`) before any record uses it**, and a
   collection lists the types it uses.
   Test: `tests-js/colecciones.test.ts`.

4. **A deep page (one document, one source, one press issue) is built once, at its
   Spanish address; browse pages (hub, collection, year, search, tasks) are built in
   every language.** A visitor in another language gets the deep page with its labels
   swapped in the browser (`?l=xx`, else the language of the last page they read),
   from a dictionary `scripts/paginas_unicas.mjs` learns at each build; the build fails
   unless the swap reproduces every translated render exactly, then deletes them.
   Mark archive and community text with `lang={contentLang()}` so it is never
   swapped. A new deep page type is added to `DEEP_PREFIXES` in
   `src/lib/pagina-unica.ts`.
   Test: the build itself (`scripts/paginas_unicas.mjs`), `tests-js/pagina-unica.test.ts`,
   `tests-js/build.test.ts`.

5. **Nothing is public unless its record says so.** Every record has one level:
   `publico`, `solo_ficha` (page and notice, no files or text) or `privado` (left out of
   `catalog.json`). The strictest of the collection's default, the old `restricted`
   flag and `data/visibilidad.json` wins; `publico_desde` there opens a record on the
   first catalog build on or after that date. The site asks `visibleAs()` /
   `isPublic()` in `src/lib/visibilidad.ts`, never a flag directly. A new collection
   starts with `"visibilidad_por_defecto": "privado"`; one that defaults to public
   names the day it was opened (`abierta`). Children's material follows #29.
   Test: `tests-js/visibilidad.test.ts`, `tests/test_visibilidad.py`.

6. **The built site stays under the budget** in `scripts/presupuesto.mjs`
   (700 MB, 20,000 files: GitHub Pages serves at most 1 GB, Cloudflare Pages takes at most 20,000 files). `npm run build` prints
   the size per folder.
   Test: `tests-js/build.test.ts` ("size budget").

## Adding a collection

1. Add its entry to `src/data/colecciones.json` (id, group, form, archive folder,
   types, flags, `privado`).
2. Add its name to `festivales` and `festivales_cy` in all 7 files of `src/i18n/`.
3. Run `npm test` and `python3 -m pytest tests`.

A new browsing form (other than `ediciones` and `numeros`) or a new group is the only
part that needs new pages.
