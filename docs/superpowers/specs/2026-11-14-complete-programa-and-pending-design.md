# "Complete" programa needs a human yes; covers identify editions; contributors see pending work

## Why

1. Any approved `programa` upload with one page turns an edition green
   (`stateOf` in `src/lib/uploads.ts`). People often send one weak photo of the
   cover, so green ("programa completo") is overstated.
2. After submitting, a contributor sees nothing on the edition page until an
   admin approves, so it looks like the contribution was lost.

## Goals / non-goals

- An edition shows its cover ("tapa") as its identifier.
- Green only when the contributor says the programa is complete **and** an
  admin confirms it (approach A + B, chosen).
- Contributors see their own pending contributions on the edition page,
  clearly marked as pending, visible to nobody else.
- Non-goal: automatic quality checks (page count, resolution). Rejected
  because a one-page programa exists, and so do four blurry photos.
- Anti-goal: pending material must never change an edition's colour or show
  to other visitors.

## Approaches considered (part 1)

- A) Admin checkbox "Programa completo" at approval — chosen, combined with B.
- B) Contributor declares "completo" / "solo la tapa o algunas páginas" — chosen.
- C) Page-count rule — rejected (see non-goals).

## Design

### Part 1: completeness

- **Form** (`contribuir.astro`, Subir tab): when category is `programa`, a
  required question "¿Qué estás subiendo?" with three radios:
  "El programa completo" / "Solo la tapa" / "Algunas páginas". Stored as
  `payload.alcance: 'completo' | 'tapa' | 'parcial'`. `validate('upload', …)`
  requires it for `programa` and drops it for other categories.
- **Admin review** (`admin.ts`): uploads of category `programa` show the
  contributor's answer and two checkboxes:
  - "Programa completo (todas las páginas, legibles)", pre-checked only when
    `alcance === 'completo'`;
  - "Es la tapa (identifica la edición)", pre-checked only when
    `alcance === 'tapa'`.
  The admin can change either. `approveUpload` writes `complete: <bool>` and
  `tapa: <bool>` through the existing `payload_override` (no migration needed).
- **Coverage rule** (`stateOf`): `full` only when category is `programa`, it has
  pages, and `payload.complete === true`; otherwise `some`.
- **Existing approved uploads** have no `complete` flag and turn yellow
  (`some`). *Our call:* this is accepted as correct, since they were approved
  under the old, overstated rule. Any that really are complete can be fixed with
  a one-off SQL update by id; no admin "edit after approval" UI is built.
- The catalog rule (a scanned `programa` PDF = full) is unchanged; that
  material is curated.
- A cover alone (`tapa: true`, `complete` false) is `some` (yellow).

### Part 1b: the cover ("tapa") identifies the edition

The cover is what identifies each year's eisteddfod (its artwork), so an
edition gets one cover image, chosen in this order:

1. The most recently approved upload with `tapa: true` *(our call for when
   there are several)*; its first page image (or thumb).
2. Otherwise, page 1 of the edition's programa: the catalog `programa` PDF's
   first page, or the first page of an approved upload with `complete: true`.
3. Otherwise none.

Used in two places (chosen):
- **Year page header** (`[festival]/[year].astro`): the cover shows large at
  the top, as the edition's face.
- **Festival timeline** (`[festival]/index.astro`): the cover is the first of
  that year's thumbnails (no duplicate if it is also a catalog thumb).

Not used on the home grid (rejected: busier, heavier on phones). The choice is
made at build time from the catalog and the export; restricted catalog items
never supply a cover (their files are not published).

### Part 2: pending drafts on the edition page

- `edicion.ts`, when signed in, also reads the user's own rows for this
  festival/year with `status = 'pending'` (already allowed by RLS
  `contributions_select`).
- Each renders in its section (uploads / datos / recuerdos) as a dashed card
  with a "Pendiente de revisión" pill (same style as `perfil`'s
  `.pill-pending`). Text of facts and memories is shown as entered.
- **Upload preview:** new storage policy `uploads_select_own` (bucket
  `uploads`, first folder = `auth.uid()`), so the owner can create a signed URL
  for their own original. Images show as a thumbnail; PDFs show a file label
  with the name. *Our call* (you OK'd the proposal; the preview needs only this
  one policy).
- Pending cards never feed `editionState`, cells or timelines.
- Offline / signed out: nothing extra renders; the static page is unchanged.

## Left to the builder

- Exact copy polish (es-AR voseo) and card styling.
- Where the pending query lives (new helper in `src/lib/contrib.ts` is natural).
- Test updates: `contrib.test.ts` (validation), `uploads.test.ts` (rule),
  `admin.test.ts` (override), `supabase/tests/db.test.ts` (storage policy).
