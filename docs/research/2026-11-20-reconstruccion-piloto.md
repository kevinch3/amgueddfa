# Video text reconstruction: pilot (2026-11-20)

Design: `docs/superpowers/specs/2026-11-20-reconstruccion-videos-design.md`. The script is `scripts/reconstruct_videos.py`, using Sonnet 5.5 through `claude -p` on the maintainer's subscription.

## What ran

There were 10 short clips: 8 from Chubut (2012–2025) and 2 from Trevelin. 5 had YouTube captions and 5 had Spanish Whisper, and one (`h5zX7SaZJt8`, comp. 75) has aligned lyrics. That made 34 windows: 32 were asked and 2 had only music.

The long session `3jnNklLlxQ0` (2019, 3.9 h, 234 windows) ran as a dry run only, to save subscription usage.

| | Run 1 (prompt v1) | Run 2 (prompt v2) |
|---|---|---|
| Windows passing the checker | 32/32 | 32/32 |
| Windows on rules fallback | 0 | 0 |
| Usage (API equivalent, covered by the subscription) | USD 0.88 | USD 0.89 |

## What the model did

- **Corrected names from the programa and the edition facts:**
  - "glasman" → Glanzmann
  - "Barbosa" / "Barbourou" → Ibarbourou
  - "tiir" → Tydur
  - "ch y" → Chubut
  - "soñando El alfarero" → "Sueño El alfarero" (the title of the recited poem)
- **Dropped lines no source made sense of.** Across the 10 videos it went from 333 lines to 239.
  - Most dropped lines were Whisper's garbled singing, for example "De un agua viva de morres negras".
  - It also dropped YouTube's English artefacts at the end of a clip ("with the", "plus") and the `[aplausos]` tags.
- **Trimmed garbage off the ends of lines:** "manteca tu oma y minona hilan en la" became "manteca".
- **Copied lyric lines unchanged** in comp. 75. All 47 lines are marked `letra`.

## Finding fixed during the pilot

In run 1 the model was shown the word list in the checker's folded form, so "sueno alfarero" came out without the ñ or capitals. Prompt v2 shows the words as the context spells them, and the checker still compares folded forms. The test is `test_word_list_keeps_accents_and_capitals_of_the_context`.

## Things to watch

- **Empty results.** `FtRH27iNJtM`, a sung piece with garbled Whisper text, ended with **no lines**, so the player now shows no transcription for it. That fits the rule "leaving out is better than guessing". It needs the song's lyrics (skill `video-lyrics`) to get text back.
- **Pass rate.** 100% of windows passed, partly because the model mostly keeps or removes heard words. The checker rejected nothing in this sample, so its value shows only when the model goes wrong. It is covered by tests.
- **Leftover duplicates.** Some kept lines duplicate a lyric at the edge of a song: one automatic "Se va, se va…" line at 2:55, inside the Guastavino span.

## Full run estimate

There are 517 published transcripts, totalling 142.6 h.

| Measure | Estimate |
|---|---|
| Windows | ~8,560 |
| Usage | ~USD 240 API-equivalent, on the subscription |
| Calls, one at a time | ~36 h |

Long sessions are most of it. Suggested order:
1. Short clips first, under 15 min.
2. Then sessions, one at a time, checking the subscription's limits between them.
