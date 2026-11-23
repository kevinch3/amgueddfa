---
name: video-lyrics
description: Use when adding the lyrics of a sung piece (choir, solo, hymn) to an Eisteddfod video's transcript, when the maintainer pastes a song text for a video, when asked which lyrics are still needed (letras pendientes), or when an aligned lyric shows at the wrong time.
---

# Lyrics in video transcripts

The player's automatic text (YouTube / Whisper) turns singing into nonsense. The programa names the
piece; with its text, `scripts/align_lyrics.py` puts each line at the moment it is sung. Plan:
`docs/restauracion-videos.md` (layer 4). Pending list: `docs/letras-pendientes.md`.

## The rule

The maintainer's instruction: "Make any effort if you found that the song or the context is known or
can be get, then take the chance to do it." So when a piece is known, or can be found out (the
programa, the announcement, the video title, what was heard), go and get its text, within these limits:

- **Never type, recall or complete lyrics yourself**, not even "well-known" ones. Every word comes
  from a source: the maintainer, or a fetched public page.
- **Public domain** (authors and translators dead before 1956, traditional, liturgical, the 1620 Bible):
  fetch the text from a cited public source (Wikisource, a hymnal scan, gobaith.cymru, CPDL, Project
  Gutenberg…), copy it from the fetched page by script, never retyped, and check it against what is
  sung before saving: same stanzas, same wording, refrains written out as sung. Front matter:
  `derechos: Texto de dominio público` and `fuente: <URL>, <edition>, obtenido por el archivo`. Check the
  death dates yourself; a translation has its own copyright.
- **Copyrighted** texts come only from the maintainer (pasted, or a file they point to). If asked for
  the words, give the title, author and where to find them (e.g. oxfordsong.org, a hymnal, the score).
- Store only the original-language text.
- **Which piece a performance is** («a elección», free repertoire, a clip with no competition) goes to
  `data/letras/identificaciones.json`, keyed by video: `t` (seconds, in a session), `titulo`, `autoria`
  (author, or tune), `confianza` (alta / media / baja), `evidencia` (announcement, title, what the
  recognisers heard: never quote what is sung), `derechos` (dominio_publico / con_derechos /
  sin_confirmar), `letra` when the text is saved, `nota` for what stays in doubt. An identified piece
  with no text stays a gap («falta el texto»), listed in «Obras identificadas, sin texto».

## Steps

All in a worktree (`../amgueddfa-wt-*`), never the main checkout. The backup disk must be mounted
for the export (`/run/media/kevinch3/4eff8b2b-…/amgueddfa-backup`).

1. **What's needed:** `python3 -m scripts.letras_pendientes` regenerates `docs/letras-pendientes.md`
   (pieces by priority, videos and times; "a elección" ones to identify; why each gap is open).
   For the top rows, fetch the public-domain texts (see the rule) and ask the maintainer for the
   copyrighted ones, as sung (refrains written out), in the original language; identify the «a
   elección» performances you can. Not every piece will get a text, and that is fine: the gaps are
   documented.
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
   derechos: Derechos confirmados por el mantenedor del archivo   # or "Texto de dominio público"
   fuente: <where the text came from>, aportado por <who>   # or "<URL>, <edition>, obtenido por el archivo"
   ---
   Stanza one, line one
   …

   Stanza two…
   ```
   Stanzas separated by blank lines (the aligner repeats whole stanzas when the choir does).
   One file per piece, reused by every video where it is sung.
4. **Find the span** (seconds) where the piece is sung in each video. `desde` is the first sung
   moment (the intro's first note at the earliest, never the announcement) and `hasta` the last
   sung moment (the held final chord, before the applause): never the next chapter, the jury or
   the next announcement. A span that runs on over speech is what put lyric lines on announcers.
   - single-competition clip: from the first sung note after the announcement to the last one;
   - long session: find the competition by its chapter (`public/marcadores-video/<id>.json`, or
     the time in the pending list), then mark the singing inside it, not the chapter's ends;
   - two pieces in one competition: one span each, split at the applause or silence between them;
   - a performance cut short, a false start or a stopped backing track: one span per take, each
     ending where its singing stops (the aligner leaves out the lines that were not sung);
   - nothing of the text sung in the span (narration, another piece): no span, a `huecos.json` entry.
5. **Preview:** `python3 -m scripts.align_lyrics <video> <slug> <desde> <hasta>`. Fix the span or
   the text until there are no `WARN` lines you can't explain. Lines under 1 s apart mean invented
   repeats or a span that is too short; a first line long after `desde` means the span starts too
   early. The lyric runs only from its first to its last *anchored* line (one heard with at least
   two matched words, or most of a short line); lines outside those are placed at the pace they
   were sung, only while they fit inside the span and before speech heard there. `N lines not placed
   at the end, from stanza S line L on` means the text is longer than what was sung (a truncated
   performance, a shorter version) or `hasta` cuts the singing: listen, then move `hasta` or accept
   it (and note a skipped stanza as `estrofa_omitida`). `not placed at the start` is the same before
   the first anchored line (sung before the recording or `desde`, or right after the announcer);
   lines before it that were heard in the same long segment (a Welsh-model block) start with that
   segment instead. `no line heard clearly enough to anchor it` spreads every line evenly over the span: mark
   `desde` and `hasta` on the singing exactly, or log a gap.
   The rebuilt text (`video-reconstruction`) aligns from the raw sources instead: a Welsh piece from
   the Welsh model's lines above its confidence filter, any other from the Spanish sources only. Preview
   that too when the video will be rebuilt, and watch for lines piled at the start (the first line heard
   comes late) or at the end (the last heard segment holds a whole stanza): a pile of a few lines is
   approximate timing, a whole stanza piled is a gap (`alineador` or `gales_insuficiente`).
6. **Add the span** to `data/letras/videos.json`: `"<video>": [{"letra": "<slug>", "desde": 95, "hasta": 292}]`
   (append to the video's list if it already has one).
   **If it can't be placed** (the text differs from what is sung, the Welsh model heard too little,
   the aligner piles lines, the piece is not in that video…), don't force it: add an entry to
   `data/letras/huecos.json`: `letra` (slug) or `obra` (title as in the report, plus `autoria` when
   titles are shared), optional `videos`, optional `desde` (`{video: seconds}`, where that video's
   link points), `motivo` (a code of `MOTIVOS` in `scripts/letras_pendientes.py`) and a
   one-sentence Spanish `detalle` that never quotes what is sung. When you later place a video
   that has an entry, take it out of the entry: the report raises on entries for aligned videos,
   and on any slug, title, video or code it doesn't know. In a video already aligned, an entry whose
   `desde` falls outside the aligned span records another performance of the piece there. A sung
   stanza missing from the text, or one the singers skip, is `texto_distinto` or `estrofa_omitida`.
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
| Writing lyrics from memory to "save time" | Never; fetch a public-domain text from a cited source, or ask for it |
| A public-domain text saved without checking it against the singing | Compare stanzas and wording with what was heard; a different version is a gap (`texto_distinto`) |
| Quoting sung words in an identification or a gap entry | Describe where the evidence comes from, never what is sung |
| Storing the translation next to the original | Original only |
| Span covering the announcer's introduction | Start at the first sung line; the speech stays as YouTube heard it |
| Text as printed when the choir repeats a refrain many times inside a stanza | Write the refrain out as sung, or accept approximate times for those lines |
| A Juventud or Mimosa video | No transcripts there (children, #29): out of scope |
| Editing `docs/letras-pendientes.md` by hand | It is generated; rerun the script |
| Leaving a text unplaced with no reason | Add the gap to `data/letras/huecos.json` |
