---
name: video-lyrics
description: Use when adding the lyrics of a sung piece (choir, solo, hymn) to an Eisteddfod video's transcript, when the maintainer pastes a song text for a video, when asked which lyrics are still needed (letras pendientes), or when an aligned lyric shows at the wrong time.
---

# Lyrics in video transcripts

The player's automatic text (YouTube / Whisper) turns singing into nonsense. The programa names the
piece; with its text, `scripts/align_lyrics.py` puts each line at the moment it is sung. Plan:
`docs/restauracion-videos.md` (layer 4). Pending list: `docs/letras-pendientes.md`.

## The rule

**Never type, recall or complete lyrics yourself**, not even "well-known" or public-domain ones.
The text comes from the maintainer (pasted, or a file they point to). If asked for the words, give
the title, author and where to find them (e.g. oxfordsong.org, a hymnal, the choir's score).
Translations have their own copyright: store only the original-language text.

## Steps

All in a worktree (`../amgueddfa-wt-*`), never the main checkout. The backup disk must be mounted
for the export (`/run/media/kevinch3/4eff8b2b-…/amgueddfa-backup`).

1. **What's needed:** `python3 -m scripts.letras_pendientes` regenerates `docs/letras-pendientes.md`
   (pieces by priority, videos and times; "a elección" ones to identify). Ask the maintainer for
   the texts of the top rows, as sung (refrains written out), in the original language.
2. **Check the text is the right piece** before anything else: compare it with what YouTube heard
   in the video (`python3 -c` over the segments in the span of `data/reconstruccion/<id>.json`, or
   `public/transcripciones-video/<id>.json` when there is no reconstruction: the published text joins
   caption fragments into sentences, so its times are coarser)
   and with the programa line (title, composer). Same-title songs are the trap: a pasted
   «Rosa amarela» was a 2010s pop song, not the folk song Villa-Lobos arranged. If the heard words
   don't match, say so and ask.
3. **Save the text** in `data/letras/<slug>.md`:
   ```
   ---
   titulo: Bonita rama de sauce
   autor: Carlos Guastavino; texto de Arturo Vázquez
   idioma: es            # cy, pt, la, en… (sets the lines' language in the player)
   derechos: Derechos confirmados por el mantenedor del archivo   # or "Texto tradicional (dominio público)"
   fuente: <where the text came from>, aportado por <who>
   ---
   Stanza one, line one
   …

   Stanza two…
   ```
   Stanzas separated by blank lines (the aligner repeats whole stanzas when the choir does).
   One file per piece, reused by every video where it is sung.
4. **Find the span** (seconds) where the piece is sung in each video:
   - single-competition clip: from the first sung line after the announcement to the applause;
   - long session: from the competition's chapter (`public/marcadores-video/<id>.json`, or the
     time in the pending list) to the next chapter or the applause;
   - two pieces in one competition: one span each, split at the applause or silence between them.
5. **Preview:** `python3 -m scripts.align_lyrics <video> <slug> <desde> <hasta>`. Fix the span or
   the text until there are no `WARN` lines. Lines under 1 s apart mean invented repeats or a
   span that is too short; a first line long after `desde` means the span starts too early.
6. **Add the span** to `data/letras/videos.json`: `"<video>": [{"letra": "<slug>", "desde": 95, "hasta": 292}]`
   (append to the video's list if it already has one).
7. **Export and check:** `python3 -m scripts.export_video_transcripts` (about 5 s; rewrites only
   changed files). `git status` must show only the expected `public/transcripciones-video/*.json`.
   Then `python3 -m scripts.letras_pendientes`, `npm run build`, `npm test`, `python3 -m pytest -q tests`.
8. **Look at it** in the player: `npx astro preview --port <free port>` (check the port is free:
   another session may own 4321-4330), open the edition page, open the video; lyric lines show in
   italics with ♪ and the badge says "letra alineada".
9. **If the video already has a reconstruction** (`data/reconstruccion/<id>.json`), rerun it so the
   published text picks up the lyrics: skill `video-reconstruction` (`python3 -m scripts.reconstruct_videos --ids <id>`).
10. **Commit** `videos: «<title>» aligned in <festival> <year> comp. <n>` with `data/letras/`, the
   transcript JSON and `docs/letras-pendientes.md`; no AI attribution lines. PR, squash-merge (the
   merge deploys amgueddfa.org).

## Common mistakes

| Mistake | Fix |
|---|---|
| Writing lyrics from memory to "save time" | Never; ask for the text |
| Storing the translation next to the original | Original only |
| Span covering the announcer's introduction | Start at the first sung line; the speech stays as YouTube heard it |
| Text as printed when the choir repeats a refrain many times inside a stanza | Write the refrain out as sung, or accept approximate times for those lines |
| A Juventud or Mimosa video | No transcripts there (children, #29): out of scope |
| Editing `docs/letras-pendientes.md` by hand | It is generated; rerun the script |
