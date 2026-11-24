# Mixed Welsh and Spanish speech in the reconstruction

**Status:** draft for the maintainer's review (2026-11-24). Nothing here is built yet.

## Intent

At the Eisteddfod in the Wladfa, people switch languages within one breath. A presenter thanks a reciter in Welsh, announces the next competition in Spanish, and asks the adjudicator in Welsh whether they are ready, all inside thirty seconds. The video text should show each passage in the language it was spoken, at the moment it was spoken, once.

Today it doesn't. In the 2018 Saturday session (utHSvsjwvwo) the maintainer found, in four minutes:
- a Welsh announcement that disappeared;
- recited lines that disappeared;
- Welsh lines that show and vanish before their words are said;
- the same words shown twice, once from each recogniser;
- language marks (CY) that miss Welsh lines.

**Goals**
- Every stretch of speech appears once, from the source that heard it best.
- Each line shows when its words are said, and stays until they end.
- The language decision rests on what was spoken (the audio), not on how a recogniser happened to spell it.
- The maintainer's cases below are fixed tests, so later rule changes can't break them silently.

**Non-goals**
- Showing language inside a line (CY marks on a passage, `lang` on part of a line, the editor's language choice). That is the next project. It will build on the per-passage language this design produces.
- Translating, or any text the sources didn't hear.
- Changing the checker or the model's prompt.

**Anti-goals.** These would make it a failure even if it runs:
- Welsh speech written in Spanish spelling, or Spanish speech in Welsh spelling, chosen over the other recogniser's good text;
- a passage published twice;
- loosening the checker to let more text through.

## What goes wrong today (measured 2026-11-24, 1,341 rebuilt videos)

`scripts/reconstruct/sources.py` decides between the Welsh model (Bangor) and the Spanish sources (YouTube, Spanish Whisper). It uses start times and a per-line language guess from marker words.

| Problem | Cause | Size |
|---|---|---|
| A Welsh line vanishes before it is said | Bangor writes segments of up to 30 s with no word times. Each becomes one line at its start, and the next source's line starts long before the segment ends. | 1,130 lines, 223 videos |
| Duplicates | A Spanish-source line is dropped as "the same speech" only within 10 s of a Bangor line's **start** (`SAME_SPEECH`). Copies later in a long segment survive. | 1,893 lines, 207 videos |
| Text lost before a Welsh segment | The same 10 s rule removes Spanish-source lines up to 10 s **before** a Bangor segment, though they are different speech. | 79 lines, 16 videos |
| Good Welsh dropped | Spanish Whisper writes Welsh speech as Spanish-looking gibberish. Five of its words within 3 s (`SPANISH_NEAR`, `SPANISH_SPEECH_WORDS`) count as Spanish speech, and Bangor's correct line is dropped. | up to 1,325 segments in 213 videos. In a sample of 14, 5 were real losses; the rest were Bangor writing real Spanish in Welsh spelling, a correct drop. |
| CY marks wrong | `line_language()` needs two Welsh marker words. Short Welsh lines from Spanish Whisper have none, so they are labelled Spanish. | |

The last two rows show the limit of text rules. Each recogniser forces what it hears into its own language, so whether a text looks Welsh partly depends on which model wrote it, not on what was said.

## The maintainer's cases (utHSvsjwvwo; these become tests)

| Time | What is right |
|---|---|
| 5:21 | The Welsh announcement of competition 22 (main recitation) is present, as Welsh. |
| 7:34, 7:38 | Two recited lines that only Spanish Whisper heard are present. |
| 7:45–7:59 | Each recited line appears once. Today it appears in Bangor's long line and again in Spanish Whisper's garbled one. |
| 8:01 | The end of the poem (Bangor, dropped today) is present. |
| 8:28–8:59 | No duplicates. The thanks and the closing question are Welsh; the reminder of competition 22 is Spanish, from Spanish Whisper. |
| 8:31 | Bangor's 30 s segment is split into its Welsh and Spanish parts, each at its own time. |

## Approaches

1. **Better text rules only.** Compare time spans rather than starts, split Bangor's long segments into clauses spread over the segment, and decide language per clause from the words. This needs no GPU, and fixes the timing, the duplicates and the losses before segments. It cannot reliably fix the good-Welsh drops or the marks.
2. **Language from Whisper's language detector on short slices.** Tried in the pilot and **rejected**. On this Welsh the detector says Spanish or English: over the 5:20 Welsh announcement it gives Welsh 0.01–0.04. It is also slow, at 0.7 s per slice.
3. **Both models on the same audio, the surer one wins** (recommended; it passed the pilot). Bangor is rerun with word times. Its words make the lines, and Spanish Whisper (turbo) transcribes each line's own audio. Each model scores its own words. Bangor is sure of Welsh and unsure of Spanish, and turbo the reverse, so comparing their confidence on the same seconds tells which language was spoken, word by word if needed.

The pilot (below) chose 3.

## Design

**1. Units.**
- **Bangor:** its segments are cut into lines at a pause of 0.6 s or more between words, at a sentence end, or at 14 words. Each line runs from its first word's start to its last word's end. Videos without word times keep today's segment lines.
- **Spanish sources:** lines as today, with their end times (Whisper and the VTTs have them).

**2. Language per Bangor line.** Turbo, forced to Spanish, transcribes each Bangor line's own audio (plus 0.2 s each side), with word probabilities. Short clips are needed: over a whole session turbo skipped 8:29–8:58 entirely, but on the line's own clip it heard it.
- **A clear winner** (mean word confidence 0.10 or more above the other) gives its text for the whole line.
- **Otherwise, word by word.** Each Bangor word is compared with turbo's words over the same seconds. A run of fewer than 3 words takes its neighbours' language. Each run is published from its winner. This is how a line that switches language without a pause gets split (5:32, 8:45).
- **Turbo's text goes through today's Spanish Whisper filters** (`clean_whisper`: stock phrases, loops) before it can win. Without them, its stock closing phrases ("subscribe", "thanks for watching") won over singing in the pilot.

**3. Same speech, by span.** Every Bangor line has now been decided in step 2, so the other Spanish sources (YouTube, the first Whisper pass) only add speech Bangor didn't write. One of their lines is dropped when it overlaps a decided line by at least half of its own length. It stays when nothing overlaps it. Lines from the same model next to each other that repeat a word at the cut (for example "número" in the pilot) are joined.

These rules replace `SPANISH_NEAR`, `SPANISH_SPEECH_WORDS` and `SAME_SPEECH` in `load_sources()`.

**4. What stays as it is.** The confidence floor (0.6), the English filter, the lyric spans, the window model and its checker, and the export. Each line keeps its source.

**5. Language for display.** Each published line gets the language decided in step 2, which replaces `line_language()`'s word-marker guess for Bangor lines. Mixed lines become rarer, because a line now ends where the speaker switched. Marking language within a line is the next project.

## Rollout

1. Pilot on utHSvsjwvwo, 0:00–30:00 (below).
2. Implement behind the tests above. Rebuild utHSvsjwvwo after the maintainer OKs its window count; the maintainer checks it in the player.
3. A KPC pass for the other videos: Bangor rerun with word times, then turbo on each of its lines. One GPU job at a time. Old files are kept in `versiones/` (#151).
4. Rebuild in batches, each with a dry-run count for the maintainer's OK. The 19 finished, unpublished Welsh videos go in the first batch.
5. Then the display project: marks within a line, the editor and the accessibility statement.

## Pilot (2026-11-24)

utHSvsjwvwo, 0:00–30:00, on KPC's P4000. The scripts are in `scripts/kpc/pilot/`. The outputs are on KPC in `pilot-mix/`, and no published or raw file changed.

| Run | Time on KPC (30 min of audio) | Result |
|---|---|---|
| Bangor with word times | 518 s | Usable. A clip test confirmed its timing at 8:38: Spanish Whisper's own segment had stretched over the Welsh that came before. It also filled a gap at 7:18–7:41 that the first run left empty. |
| Language detector, 3 s and 5 s slices | 2,602 s | Rejected: wrong on Welsh, and slow. |
| Turbo in Spanish over the whole audio | 70 s | Skips stretches (8:29–8:58), so it is kept only for speech Bangor didn't write. |
| Turbo in Spanish on each Bangor line | 244 s for 298 lines | Clear separation. Welsh lines: Bangor 0.87–0.96, turbo 0.38–0.66. Spanish lines: turbo 0.83–0.95, Bangor 0.76–0.80. |

**The maintainer's cases.** Both language methods use the same Bangor word-time lines and the same checks. Slices: each line takes the language its audio slices favour, and overlapping Spanish lines that sound like it are dropped. Confidence: step 2 above, without the stock-phrase filter.

| Case | Today | Slices 3 s | Slices 5 s | Confidence |
|---|---|---|---|---|
| 5:21 Welsh announcement present | missing | fail | fail | pass |
| 7:34 recited line present | missing | pass | pass | pass |
| 7:38 recited line present | missing | pass | pass | pass |
| No duplicates 7:45–7:59 | duplicated | pass | pass | pass |
| No duplicates 8:28–8:59 | duplicated | pass | pass | pass |
| 8:01 end of the poem present | missing | pass | pass | pass |
| 8:31: the Welsh introduction in Welsh, at 8:40 | one 30 s line at 8:31 | fail | fail | pass |
| 8:31: the Spanish reminder as Spanish, at 8:47 | in Welsh spelling | pass | pass | pass |
| 8:31: the closing question in Welsh, at 8:59 | inside the 30 s line | fail | pass | pass |
| **Total** | | 6/9 | 7/9 | 9/9 |

Most of the gain comes from Bangor's word times: span matching on its lines fixes the losses and duplicates with either language method. The slices fail exactly where the presenter speaks Welsh, because the detector calls it Spanish or English.

**Two checks were corrected during the pilot**, and the table uses the corrected versions for every method:
- 7:34 and 7:38 at first required a line *starting* at those times. Both recited lines are present inside one Bangor line at 7:35–7:41, so they are now checked by their words.
- The 8:31 Spanish check at first rejected the correctly spelled Spanish "recitación" as if it were Bangor's Welsh spelling. It now rejects Welsh-spelled forms only in Bangor's lines.

Of 298 Bangor lines, 120 are clearly Welsh, 124 clearly Spanish and 54 close or mixed (decided word by word).

**What the pilot also showed:**
- A real bilingual repeat (at 25:33, adjudication 84 is asked for in Welsh and then in Spanish) keeps both lines, as it should.
- Turbo's stock phrases won over singing until the Spanish Whisper filters apply; they are in step 2.
- Garbled singing stays garbled. Lyric spans remain the answer there.

**Cost of a full pass.** About 830 s of GPU per 30 min of audio: Bangor with word times, turbo per line, turbo long-form. That is about 2.2× real time on the P4000, so the in-scope archive would take roughly a week of GPU. The rerun replaces the Spanish pass (#112) and #125's detect-only run, both of which decided per 30 s segment.

## Left to the builder

- Thresholds (pause 0.6 s, clear gap 0.10, minimum run 3 words, overlap half), set on the pilot. Check them on two more sessions before the full pass: one mostly Spanish and one mostly Welsh.
- How the rebuild's model window and checker see the new lines. They are still lines from a named source, so the checker's rule (every word heard, at its time) applies unchanged.

## Open for the maintainer

- **Where to run the full pass** (about a week of GPU). KPC alone, one job at a time; or helped by Google Colab, which means uploading the private backup audio to Google.
