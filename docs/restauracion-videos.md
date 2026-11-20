# Restoring the content of the videos

The archive keeps about 1,300 videos of the eisteddfodau. A video only plays; what was *said and
sung* in it is the content worth restoring: findable, citable, readable without watching hours.
This plan puts the pieces already built in order and shows where the sung words fit.

## Layers (what each one restores)

| # | Layer | Restores | State |
|---|---|---|---|
| 1 | Harvest and private copy | the video itself, safe from deletion | done (VIDEOS.tsv, monthly 360p backup) |
| 2 | Speech transcription | what announcers, juries and presenters say | done for Spanish: YouTube automatic + Whisper, quality gate. Welsh held for review (#32) |
| 3 | Structure | where each competition and ceremony starts | chapters for long sessions (#26), competition number in clip titles; share links to a moment (#47) |
| 4 | **Sung words** | the text of each piece, line by line, at its moment | **in progress**: comp. 75 Chubut 2025 done (#48, #49); list in `docs/letras-pendientes.md` |
| 5 | Review | errors fixed by people | "Informar un error" in the player; Welsh review (#32); spot checks of layer 4 |

Juventud and Mimosa videos stay without text (children named aloud, #29); that holds for layer 4 too.

## Layer 4: sung words

**How:** the programa names the piece, the maintainer supplies its text, `scripts/align_lyrics.py`
lines it up with what YouTube heard, and the player shows it as "letra alineada, tiempos aproximados".
The texts never come from Claude. The mechanical steps are in the `video-lyrics` skill.

**Scope**, from `python3 -m scripts.letras_pendientes` (2026-11-20):

| Phase | What | Size | Needs from the maintainer |
|---|---|---|---|
| A | Titled pieces whose words are probably free (liturgical Latin, traditional, old poets) | 13 pieces | the text as sung; quick rights confirmation |
| B | Remaining titled pieces | 50 pieces | the text, and a rights decision per piece (modern poets, folk songs with a known author) |
| C | "A elección" pieces: identify which piece was sung | 120 appearances | listen or read the announcement, give the title; then as A or B |
| D | Videos with no transcription (Welsh-only, children) | — | out of scope until #32 / #29 |

Ordering inside each phase: pieces sung in more videos first, since one text serves all of them.

**Done when** each sung piece of a transcribed Chubut or Trevelin video either shows its text, or is
recorded as not publishable (rights refused) or not identifiable.

**Quality bar:** before publishing, the preview (`python3 -m scripts.align_lyrics …`) shows no
warnings, and the text matches the words YouTube heard (wrong same-title songs are the main trap).

**Measures:** pieces with text and videos with lyrics (top of `docs/letras-pendientes.md`); player
error reports on lyric lines.

## Later

- Phase C as a crowd task on /tareas/ ("¿qué obra se canta acá?"), the way years are confirmed now.
- Word-level times from YouTube's captions or Whisper for tighter highlighting.
