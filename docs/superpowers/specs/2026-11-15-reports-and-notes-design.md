# Reports and notes: say what's wrong, propose the fix, add what you know

## Why

Videos and documents are gathered in bulk, so some of them end up in the wrong place.
Chubut 2015 lists two "Patagonia 150 – Lucy Taylor @ Eisteddfod Genedlaethol
2015" videos (`MKRCg__AXC8`, `milk52XMm-4`). They are from the National
Eisteddfod of Wales, which talked about Patagonia that year, not from an
eisteddfod in Patagonia. People who know this must be able to say it is wrong
and what the fix is. Once an admin agrees, the site must correct itself at once,
without waiting for the admin to edit `VIDEOS.tsv` and rebuild.

People also know things about a document that its file and name don't say: what it
is, which pages are missing, who is in the photo. They need a way to add that, and
an admin approves it before it shows.

## Goals / non-goals / anti-goals

Goals:
- **"Informar un error"** on every video and every document page: what is wrong
  (a choice), an explanation, and the proposed fix.
- Approving a report whose fix is structured **applies it live**: the video or
  document is hidden, or moved to another eisteddfod / year (and section, for
  documents). The static HTML catches up at the next export + build, and the fix
  survives a re-export of `VIDEOS.tsv`.
- **"Agregar información"** on every document page: a note that shows publicly on
  the document page once approved, credited like memories.
- Admins review both in "Para revisar", and can use "Editar y aprobar" to correct
  the proposed fix before it applies.

Non-goals (for now):
- Reports on community content (facts, memories, transcriptions).
- Notes on videos (a video's "Otra cosa" report covers corrections).
- Writing approved fixes back into `VIDEOS.tsv` or the archive folders.
- An "undo" button. An approved hide can be reversed with SQL (set the row to
  `rejected`); a move can be reversed with another report.
- Showing the reports themselves publicly.

Anti-goals:
- Nothing changes before an admin approves. Exception: admins' own reports
  approve on submit, as every admin contribution already does.
- Nothing is deleted. A hidden video stays in `videos.json` and a hidden document
  stays in the catalog and keeps its page; only where they are listed changes.
- A report's explanation never becomes public. It may name people or carry
  hearsay; only the fix is needed to apply it.

## Approaches considered (chosen: B)

- A) An approved report is a to-do for the admin, who fixes `VIDEOS.tsv` or the
  catalog by hand and rebuilds. Smallest build, but the site stays wrong until
  someone edits files on the one machine that has the archive.
- **B) Common fixes apply themselves (chosen by the user).** Hide or move on approval,
  live, the same way tag corrections already move documents. Free-text fixes
  stay manual.

## Design

### Data
- New migration: `contributions.type` also accepts `'report'` and `'note'`
  (replace the check constraint).
- **Report** row: `festival` / `year` are where the thing was listed when reported
  (so the queue and per-festival points work).
  - Document: `item_id` = the item id;
    `payload = { objetivo: 'documento', problema, texto, arreglo? }`.
  - Video: `item_id` = null;
    `payload = { objetivo: 'video', video: { id, title, channel, kind }, problema, texto, arreglo? }`.
    Storing a copy of the video's title, channel and kind lets a page show a video
    that was moved in without loading the whole video list.
  - `problema` ∈ `no_corresponde` (not from an eisteddfod of the Patagonia) |
    `otra_edicion` (another eisteddfod, year, or for documents section) | `otro`.
  - `arreglo` is required when `problema = 'otra_edicion'`: `{ festival?, year?, category? }`
    (category only for documents), with at least one field different from the current
    value.
  - `texto`: required, 10–1000 characters.
- **Note** row: `item_id` = the item id, `festival` / `year` from the item,
  `payload = { text }`, 10–1000 characters.
- `approve_contribution`: **report 10 points, note 5** *(our call)*. Approved
  reports count toward **Ojo de lince** together with tags *(our call)*.
- `public_contributions` drops `texto` from report payloads, the same way it already
  drops `storage_path` from uploads. So the export (`data/approved/contributions.json`,
  committed) carries the fix but never the explanation. Admins still read the
  explanation in the queue, from the table.

### Applying fixes (one pure rule, used at build time and in the browser)
- **Documents:** extend `applyTags` (`src/lib/tags.ts`). An approved document report
  with `otra_edicion` applies its `arreglo` exactly as a tag does. `no_corresponde`
  sets a new `hidden: true`. Rows are applied oldest approval first, as now.
  - `IndexItem` / `Taggable` gain `hidden`. `inScope` is false for hidden items,
    and `changedItems` watches `hidden`, so live cards vanish and coverage is
    recalculated by the code that already does this.
  - At build time: edition, festival and general lists, coverage, the timeline and
    `/datos/documentos.json` leave hidden items out. `items()` keeps them so
    `/item/<id>/` still builds, and that page shows a notice ("Este documento se
    retiró: no corresponde a los eisteddfodau de la Patagonia") marked `noindex`.
  - `latestTagAt` / `<meta name="amg-tags-at">` and the live query in
    `live-catalog.ts` also cover `type = 'report'`.
- **Videos:** a new `applyVideoReports(videos, reports)` in `src/lib/videos.ts`.
  `no_corresponde` removes the video. `otra_edicion` sets its festival / year (and
  clears `year_inferred`). `otro` changes nothing. Unknown video ids are ignored.
  - At build time: the video list = `applyVideoReports(videos.json, approved reports from the export)`.
    Since the overlay is keyed by video id, re-exporting `VIDEOS.tsv` never undoes it.
  - Live on edition pages: one query for approved video reports newer than the
    build. It removes cards that were hidden or moved out, adds cards that were
    moved in (built from the copy in the payload), and updates the count in the
    heading.

### Contributor UI
- **Video card:** under each card, a small "Informar un error" text button (outside
  the YouTube link). One shared `<dialog>` per edition page is filled from the
  clicked card. Signed-out visitors see the usual sign-in prompt in the dialog.
- **Report form (videos and documents):**
  - "¿Qué está mal?":
    - "No es de un eisteddfod de la Patagonia (por ejemplo, es del Eisteddfod de Gales)"
    - "Es de otro eisteddfod o de otro año" (reveals eisteddfod + year, plus section
      for documents)
    - "Otra cosa"
  - Then "Contanos qué está mal y cómo debería ser" (required), "Enviar", and a
    thank-you line (admins read "publicado").
- **Document page** ("¿Nos das una mano?" box): the existing "¿El año es correcto?"
  stays (quick confirmations), plus "Informar un error" (inline form) and
  "Agregar información" (textarea → note).
- **Approved notes** show in the document's "De dónde viene" card under
  "Información aportada", with "Aportó <nombre>". They come from the static export,
  and approvals made after the build are merged in live, as transcriptions already do.
- The profile page's list of contributions labels the two new types.

### Admin queue
- The type filter adds "Error informado" and "Información".
- Video report card: thumbnail, YouTube link, title, the edition it was listed
  under, the problem, the explanation, and the fix in words ("Ocultar del sitio" /
  "Mover a Eisteddfod del Chubut 2014" / "Sin cambio automático").
- Document report card: link to the document, then the same lines.
- The approve button names what will happen ("Aprobar y ocultar", "Aprobar y
  mover", "Aprobar") *(our call)*. "Editar y aprobar" works as today on the JSON
  payload, so an admin can turn an `otro` into an `otra_edicion`, or fix the year.

## Left to the builder
- es-AR copy (vos), dialog styling, where exactly the link sits on the video card.
- The constraint's real name (likely `contributions_type_check`), checked against
  the PGlite harness.
- Tests: validation of the new kinds (`contrib.ts`); the pure overlays (tags with
  reports, `hidden` in placement, `applyVideoReports`); DB tests for the new types,
  points and the stripped `texto` in the view; a build test that a hidden fixture
  video and document are left out while the item page still builds.
