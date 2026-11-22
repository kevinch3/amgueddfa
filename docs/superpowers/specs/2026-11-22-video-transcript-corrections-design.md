# Video transcript corrections: collaborators fix the text, the maintainer approves

## Why

Every Chubut and Trevelin video on the site now shows a checked text (1,315 videos, 45,000 lines),
built by machine from YouTube, Whisper, Bangor's Welsh model and the lyrics. It still has mishearings,
garbage lines over music, wrong language labels and missed speech. People who know the events can
fix them, but today a logged-in collaborator has no way to: the player shows the text read-only, and
"Informar un error" on a video only takes free text with no time or line.

The maintainer wants an edit button for logged-in collaborators, with corrections approved later in
the same flow as every other contribution (2026-11-22).

## Decisions taken with the maintainer (2026-11-22)

- **Line by line, one batch.** A collaborator edits individual lines; all the lines changed in one go
  are sent as **one** submission and reviewed as a before/after list.
- **Four kinds of change:** fix the words of a line; remove a garbage line; set a line's language
  (Spanish or Welsh); add a missing line at a time in the video.
- **Live on approval.** An approved correction shows in the player at once; search and the static
  files catch up at the next export.
- **Approach A:** a new contribution type in the existing `contributions` table, reviewed in the same
  `/admin/` queue, with the same RLS, daily limit, points and `/perfil/` list. (B, a separate table
  with per-line rows and its own review screen, was rejected as a second flow.)
- **Undo from `/admin/`:** approved corrections can be withdrawn (points taken back) or re-anchored
  to their line after a rebuild, with buttons in a new Videos tab.

## Goals / non-goals / anti-goals

Goals:
- A signed-in collaborator with a display name can open edit mode on any Chubut or Trevelin video
  that has a transcript, make any number of the four changes, and send them as one contribution.
- The maintainer sees each change as before/after with its time, can untick changes, and approves
  the rest (or rejects with a reason), in the existing queue.
- Approved changes show in the player immediately, for everyone, and are written into
  `public/transcripciones-video/<id>.json` at the next export, so search and the files have them.
- A correction survives every later reconstruction and export: it is re-applied each time, anchored
  to its line, and never silently dropped.
- The contributor sees their own pending changes in the player (marked pending) and on `/perfil/`.

Non-goals (this design):
- Changing a line's time, or splitting/joining lines (an "add" covers missed speech).
- Editing lyric lines (lines whose source is `letra`): lyrics come from the maintainer's texts in
  `data/letras/` and the lyrics page; the player says so on those lines.
- Juventud and Mimosa (no transcripts there, issue #29) and videos with no transcript.
- Notifications (the site has none today), real-time co-editing, per-line approval as separate rows.
- Feeding corrections back into the reconstruction (its checker rejects unheard words by design).

Anti-goals (a failure even if it works):
- A correction landing on the wrong line after a rebuild.
- An approved correction lost by the next reconstruction or export without anyone being told.
- Anyone's pending text shown to other visitors before approval.
- Text of children's festivals becoming editable or visible.

## Constraints found in the code (recon 2026-11-22)

- Video text is a generated static file per video, rebuilt from the private backup on the
  maintainer's machine by `scripts/reconstruct_videos.py` and `scripts/export_video_transcripts.py`.
  CI never writes these files. Corrections therefore live in the database and are re-applied on top.
- Lines have **no stable id**. Positions change between rebuilds (in #105 only 28 % kept position and
  text); start times were 98.6 % stable but are not unique (226 lines share an exact time).
- The reconstruction checker rejects words nobody heard, so corrections are applied after it, at
  export and in the player, never inside it.
- `approve_contribution(cid, fills_gap, payload_override)` merges the override **shallowly**
  (`payload || override`): replacing the `cambios` key replaces the whole list, which is what
  partial approval needs.
- 30 contributions per user per 24 h (`limit_daily`): one batch is one row.
- The player draws each line as one `<button data-i>` that seeks; a second control cannot nest in it.
- `asTranscript` accepts only the four known `src` values; a new per-line source tag needs an
  `reproductor.origen.<tag>` key in all 7 locales (enforced by `tests-js/i18n.test.ts`).
- Largest transcript: 2,956 lines, 188,000 characters.

## Design

### Data: contribution type `video_text`

One row per submission in `public.contributions`:
- `type = 'video_text'`; `festival`, `year` = the video's edition (chubut or trevelin only);
  `item_id = null` (as video reports do); `status = 'pending'`.
- `payload`:

```json
{
  "video": {"id": "UW0GV9sicGs", "title": "Eisteddfod del Chubut - Sesión día sábado"},
  "base": "2026-11-22T10:05:00Z",
  "cambios": [
    {"t": 2664.0, "antes": "Benedicto de la Competencia Número noventa y ocho",
     "texto": "Veredicto de la Competencia Número noventa y ocho"},
    {"t": 3121.4, "antes": "¡Suscríbete al canal!", "quitar": true},
    {"t": 3300.2, "antes": "Diolch yn fawr i chi gyd", "idioma": "cy"},
    {"t": 3412.0, "texto": "Gracias a la comisión organizadora.", "idioma": "es"}
  ]
}
```

- A change with `antes` targets an existing line; without `antes` it **adds** a line at `t`.
  On an existing line, `texto`, `idioma` and `quitar` may be combined (`quitar` excludes the others).
  An add needs `texto` and `idioma`.
- `base` is the transcript file's export time as the editor saw it (from a new `"exportado"` field
  in the JSON; see Export). It is informational: anchoring never depends on it.
- Validation (`validate('video_text')` in `src/lib/contrib.ts`, mirrored by the DB check where
  cheap): video id `/^[\w-]{6,20}$/`; festival chubut|trevelin; 1–200 changes; `t` a number ≥ 0;
  `antes` ≤ 2,000 chars; `texto` 1–500 chars after trimming; `idioma` `es`|`cy`; no two changes with
  the same `t` and `antes`; an edit whose `texto` equals `antes` is dropped client-side.
- **Points:** 2 per approved change, at most 30 per submission (`least(2 * jsonb_array_length(...), 30)`).
  Mirrored in `POINTS`/`pendingPoints()` in `src/lib/game.ts`.
- Migration `supabase/migrations/2026112200000X_video_text.sql`: widen the `type` check; add the
  `video_text` branch to `approve_contribution`'s points; add the two admin RPCs below
  (`admin_withdraw_contribution`, `admin_set_video_text_changes`). RLS, limits, the
  `public_contributions` view and `scripts/export_approved.mjs` already pass any type through.

### Anchoring and applying (one pure rule, same tests in TypeScript and Python)

`applyCorrections(transcript, rows)` takes a transcript `{seg, fuentes, idiomas?, lang}` and the
approved `video_text` rows for that video in `reviewed_at` order, and returns the corrected
transcript plus the list of changes it could not place ("orphans").

Finding the line a change with `antes` targets (no fuzzy similarity: a wrong guess is worse than none):
1. Candidates: lines whose start is within **±5 s** of `t`, not lyric lines; nearest in time first.
2. **Exact:** a candidate within **±2 s** whose folded text (lower case, no accents, collapsed spaces,
   no punctuation) equals folded `antes`. The change applies to the whole line.
3. **Inside a longer line:** a later rebuild joined fragments, so folded `antes` appears as one
   contiguous run inside a candidate's folded text. A `texto` change replaces only that run (mapped
   back to the original characters), a `quitar` removes only that run (and the line if nothing is
   left); an `idioma` change on such a match is **not** applied (the joined line may hold other
   speech) and is reported instead.
   Step 3 (and an equal line 2–5 s away, which counts as a run) is only a guess, so it is tried only
   when folded `antes` has **at least 3 words** ("Gracias." or "¡Bravo!" stand in many lines nearby)
   and `t` is **not on sung text**: the nearest line within ±2 s is not a lyric line (nor as near as
   the nearest), and `t` does not lie between two consecutive lyric lines (decided at the final
   review, 2026-11-22: a removal of Whisper's "Gracias." over a song, once lyrics replaced that
   line, must not strip "gracias" from the presenter's line 3 s earlier). Exact matches are unaffected.
4. Otherwise the change is **unanchored** ("sin anclar"): not applied, reported (see Admin).
   A split line (`antes` spread over two lines) is unanchored by design.

Applying, per change, in row order (a later approved change to the same line wins):
- `texto`: replaces the line's text (or the matched run); the line's `fuentes` gain `"colab"`.
- `idioma`: sets the line's language (written into `idiomas`, which is then always present for that
  file); an explicit language from a correction overrides `line_language`'s guess at every later export.
- `quitar`: removes the line (and its `fuentes`/`idiomas` entries), or only the matched run.
- add: inserts `[t, texto]` with `fuentes ["colab"]` and the given language, in time order; skipped
  if a line with the same folded text already exists within ±2 s (idempotent).

**Never applied twice.** The export always starts from the machine text (`data/reconstruccion/`),
applies every approved row, and records the ids it applied in the file as
`"correcciones": ["<contribution id>", ...]` (kept by `asTranscript` when it is an array of strings).
The player applies only approved rows whose id is not in that list. Without this, re-applying a baked
`quitar` would hit the next identical line nearby (18 such pairs within 2 s today, e.g. "¡Bravo!").

The rule is implemented twice, `src/lib/video-corrections.ts` and `scripts/video_corrections.py`,
and both run the **same test vectors** from `tests/fixtures/video-corrections/*.json` (input
transcript, rows, expected output, expected orphans).

### Export (static files and search)

`scripts/export_video_transcripts.py`, reconstruction path, after `with_term_fixes` and before
`main_language`: read approved `video_text` rows from `data/approved/contributions.json` (already
exported every 15 min by CI), apply them with `scripts/video_corrections.py`, then compute the main
language and `idiomas` as today, keeping corrections' explicit languages. It writes
`"exportado": <ISO time>` and `"correcciones": [ids applied]` into each file it rewrites, and prints
unanchored changes as `sin anclar <video> <t> «antes» (contribución <id>)` plus a count in the
summary; the video-reconstruction skill gets a row: after a rebuild, check `/admin/` → Videos.

Search reads the files at build time, so it shows corrections after that export and deploy.

### Player: live corrections for everyone

`src/scripts/reproductor.ts`, after `loadTranscript(id)` succeeds: one `liveQuery` of
`public_contributions` for `type = 'video_text'` and `payload->video->>id = id`, ordered by
`reviewed_at` (cached per video for the page view; offline or timeout → the file as is). Rows whose id
is already in the file's `correcciones` are skipped; the rest go through `applyCorrections` before
rendering.

A corrected or added line keeps its normal look plus a small mark, and its hover/focus title reads
"Corregida por {nombre}" (credit from `display_name`, as `byLine()` does elsewhere); the
`colab` origin gets `reproductor.origen.colab` in all 7 locales. The footer credit line lists the
contributors of the video's approved corrections.

### Player: edit mode for collaborators

- An "Editar transcripción" button in the player's action bar, shown when `gate()` gives a signed-in
  profile with a display name, the festival is chubut or trevelin, and a transcript is loaded.
  Signed out, it shows the usual `gateMessage()` link (sign in, come back to this video).
- In edit mode each non-lyric line row gets a "✎" control beside (not inside) the seek button.
  Clicking it opens that line's inline editor: a text input prefilled with the current text, a
  language choice (Español / Cymraeg), a "Quitar esta línea" checkbox, and OK / Deshacer. Lyric
  lines show "Letra: se corrige desde la página de letras" instead.
- "+ Agregar una línea en {tiempo}" adds a new line at the video's current time (pause the video
  where the speech starts), with text and language fields.
- Changed lines are highlighted; a counter reads "{n} cambios"; "Enviar {n} correcciones" submits
  one `video_text` contribution; "Cancelar" asks in-page before discarding.
- Drafts are kept per video in `localStorage` (try/catch; a convenience only) so closing the player
  or the tab does not lose a long session of edits; sending or cancelling clears the draft.
- The video keeps playing and seeking while editing; auto-scroll pauses while an editor is open.
- After sending: the `.contrib-ok` line ("¡Gracias! Quedó pendiente de revisión.", or "Ya está
  publicado" for an admin, whose rows are approved on insert), and the author's changes show in
  their own player with a dashed "pendiente" mark (their own pending rows are readable to them by
  RLS; `ownPending` gains `video_text` for the player only).
- Errors use the existing `contrib.error.*` keys (`limite`, `sesion`) plus validation messages.
- Accessibility: every control labelled; the editor takes focus when opened and returns it to the
  "✎" control when closed; the change counter is a polite live region; 44 px targets.

### Admin queue

`/admin/` → Cola gets `video_text` in its type filter and a readable card:
- Header: video title with a link that opens it on YouTube at the first change's time; the edition;
  "de {nombre} · enviado {fecha}"; "{n} cambios".
- One row per change, ticked by default: time (link to YouTube at `t`), the kind (corregir /
  quitar / idioma / agregar), and before → after with word-level differences highlighted.
  The "before" shown is the line's **current** text from the published file (fetched with
  `asTranscript`), with a warning when it no longer matches `antes` (the line changed since the
  edit; anchoring may still place it).
- "Aprobar seleccionadas" calls `approve_contribution(id, false, {"cambios": <ticked list>})`;
  "Rechazar" asks for a reason as today. Unticking everything disables approval.

### Admin: undo and re-anchor approved corrections (decided 2026-11-22)

Nothing can un-approve a contribution today (`approve_contribution` and `reject_contribution` take
pending rows only). A new `/admin/` tab **Videos** lists the approved `video_text` corrections,
newest first, grouped by video, each with its changes and author:
- **Retirar** (asks a reason in the page): new RPC `admin_withdraw_contribution(cid, note)`, admin
  only, for approved `video_text` rows: sets `status = 'rejected'`, `review_note`, `reviewed_at`,
  takes `points_awarded` back from the author's points and sets it to 0 (badges stay). The row leaves
  `public_contributions`, so the player stops applying it at once and the next export drops it.
- **Sin anclar:** the tab runs `applyCorrections` in the browser on each listed video's current file
  and shows the changes it could not place. Each has **Re-anclar**: pick the line it belongs to from
  the transcript lines within ±60 s of `t` (or "agregar como línea nueva en t"); this calls new RPC
  `admin_set_video_text_changes(cid, cambios)`, admin only, approved `video_text` rows only, which
  validates and replaces `cambios` (author, credit and points unchanged). Or **Retirar**.
- `/perfil/` shows a withdrawn correction as rejected with its reason, like any rejection.

### Profile

`/perfil/` lists the row with `perfil.tipos.video_text` ("Corrección de transcripción"), its status,
points, and a link to the edition page with `#v=<id>&t=<first change>`.

## Testing

- DB (PGlite harness): the new type is accepted pending; points 2 per change capped at 30; partial
  approval through `payload_override` replaces `cambios`; RLS: others cannot read a pending row;
  withdraw takes points back and hides the row from `public_contributions`; set-changes validates and
  is admin-only; neither works on pending rows or other types.
- Shared vectors run in vitest and pytest: exact match, ±2 s drift, joined fragment (run inside a
  longer line, for texto and quitar), idioma on a joined line reported, split line unanchored,
  two identical lines near each other (only the anchored one changes), baked ids skipped in the
  player, add idempotency, quitar, idioma override, two corrections to one line.
- vitest: `validate('video_text')`; player overlay with a stubbed `liveQuery`; i18n keys in 7 locales.
- pytest: export applies approved rows, keeps explicit languages, reports orphans, writes `exportado`.
- Manual: edit a long session (2,956 lines) in edit mode on a phone width; approve partially; see it
  live; run the export; see it in search.

## Left to the builder

- Exact component split inside `reproductor.ts` (a separate `editor-transcripcion.ts` module is
  expected), CSS details within the existing tokens, and the word-diff implementation.
- Whether the live query filters by `payload->video->>id` server-side or fetches the edition's
  `video_text` rows once per page (either is fine at today's volume).
- Copy in the other six locales (Spanish is the source).
