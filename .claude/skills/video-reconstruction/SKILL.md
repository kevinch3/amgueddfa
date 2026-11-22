---
name: video-reconstruction
description: Use when rebuilding the text of Eisteddfod videos (Chubut, Trevelin) from their YouTube, Whisper and Welsh transcriptions plus lyrics and programa context, when new lyrics, a Welsh model, facts or videos arrive and the published transcript should follow, when asked to run or extend the reconstruction pilot, or when a reconstructed line looks wrong in the player.
---

# Video text reconstruction

Each video's published text is rebuilt about 60 s at a time.
1. The sources are YouTube captions, Spanish Whisper, Welsh once chosen, and aligned lyrics.
2. Claude (Sonnet 5.5, via `claude -p` on the maintainer's subscription) picks lines and fixes misheard words from a word list built from the programa and the edition's facts.
3. **Code decides what is published**: `scripts/reconstruct/checker.py` rejects any word nobody heard. A failed window uses rules instead of the model.

Design: `docs/superpowers/specs/2026-11-20-reconstruccion-videos-design.md`. Pilot: `docs/research/2026-11-20-reconstruccion-piloto.md`. Plan context: `docs/restauracion-videos.md` (layers 2–4).

## Rules that don't bend

- **Lyrics come only from the maintainer** (skill `video-lyrics`). Never type, recall or complete lyrics, not even public-domain ones.
- **Never loosen the checker** to make a window pass. A rules fallback is the intended outcome when the model strays.
- **Welsh comes from Bangor's model** (`techiaith/whisper-large-ft-cy-en-ct2`), chosen 2026-11-20 after the A/B review.
  - Its files sit next to the videos as `<stem>.cy-techiaith.json`, and `WELSH_SOURCE = "cy-techiaith"`.
  - KPC writes them to `out-cy/` with `run_cy.py`; bring them in with `scripts/backup/videos.py import-cy` (see `docs/backup.md`).
  - Videos with a Welsh file are in scope even when nothing is published today.
- **Spanish for videos Whisper took for Welsh** (#112) comes from KPC's `run_es.py`, as `<stem>.whisper-es.json`, brought in with `import-es`. In a segment it found Spanish, its text replaces the Bangor line, which may be a translation.
- **Juventud and Mimosa are never reconstructed** (children, #29). The scope check is `in_scope()`, and the export applies it again.
- **Usage needs the maintainer's OK above 50 windows.** Show the dry run's window count first. The pilot cost about USD 0.028 API-equivalent per window, and the full archive is about 8,500 windows.
- **No `--bare`, no API key, no batch API.** Bare mode refuses the subscription.

## How Welsh is handled (2026-11-20)

- **Which Welsh lines are used:**
  - Bangor's lines below **0.6 confidence** are dropped: background under music or chatter (`MIN_CY_CONF`).
  - On videos that also have Spanish text, a Bangor line is dropped where Spanish speech is within 3 s: 5+ words for a line that reads Welsh, any for one that reads Spanish (`SPANISH_SPEECH_WORDS`, `SPANISH_NEAR`). Bangor writes Welsh over Spanish speech too, and sometimes translates it.
  - A Spanish source's line that reads as Welsh is not Spanish speech here: Spanish Whisper writes Welsh speech too, with "en" for "yn". The export also labels such lines Welsh (`line_language`: 2+ lowercase Welsh words outnumbering Spanish ones).
- **Prompt v5 rules:**
  - Keep any line that reads as real speech, even when it is the only source.
  - Drop only noise and loops.
  - Each Welsh line shows its `conf`.
- **What the checker accepts in Welsh lines (and only there):**
  - **Initial mutations** of a heard word: *o Cymru → o Gymru*, *am dychwelyd → am ddychwelyd*.
  - **Sound-alike corrections** of a heard word that the story makes clear, recorded in `fixes`:
    - *dylenneg → telyneg*, *cyfarth → cyfarch*, *hefod → defod*;
    - the sound-key similarity must be ≥ 0.7 (`sounds_alike`);
    - number words never change.
  - Spanish lines may correct only to the word list.
- **Glossary of known mishearings, `data/glosario.md`:**
  - It holds `heard → right` lines, from the maintainer or from cases that are certain.
  - A hint reaches only the windows where the heard word occurs, and the right word joins that window's word list.
  - When someone reports a misheard name: add a line, then rerun the videos that contain it. Only the windows with the word are asked again.
- **Spanish words wrong everywhere, `TERM_FIXES` in `scripts/export_video_transcripts.py`:**
  - It holds folded heard form → (right spelling, is a name). The export applies it to what the Spanish recognisers wrote (Welsh speech included: gerd → gerdd) and to the Welsh model's Spanish lines, never to Bangor's Welsh lines or lyrics. Nothing is asked again: rerun the export.
  - `TERM_FIXES_IN_CONTEXT` holds the forms that are also real names or words (Benedicto, Valdor), fixed only next to the words that tell them apart.
  - Add an entry only when the heard form is wrong in every Spanish line of `public/transcripciones-video/` (grep them all). If it is right in some places, or needs judgement per window, use the glossary instead.
- **Prompt changes:** bump `PROMPT_VERSION` in `windows.py`; every window is asked again on its next run.

## Steps

Work in a worktree (`../amgueddfa-wt-*`), with the backup disk mounted (`/run/media/kevinch3/4eff8b2b-…/amgueddfa-backup`).

```bash
python3 -m scripts.reconstruct_videos --dry-run --ids <id> [<id> …]   # windows per video, how many to ask
python3 -m scripts.reconstruct_videos --ids <id> [<id> …]             # ask, check, write data/reconstruccion/<id>.json
python3 -m scripts.export_video_transcripts                            # public/transcripciones-video/ prefers the reconstruction
npm run build && npm test && python3 -m pytest -q tests
```

- `--limit N` caps the number of videos. Leaving out `--ids` means every in-scope video, which is huge: ask first.
- `--jobs N` asks N windows at once (N parallel `claude -p` calls; same replies, shorter wait). A window takes about 30 s, so a long session of 500+ windows wants `--jobs 6`.
- `--ids-file F` reads the ids from a file (use it for ids starting with `-`).
- The final summary line gives windows by kind (`modelo`, `reglas`, `vacias`), the calls asked, and USD API-equivalent.
- The run stops by itself after 3 model errors in a row (usage limit or outage): wait and rerun. Cached replies (`../.reconstruccion/replies/<id>/<hash>.json`) are never asked again.
- Check a few videos in the player:
  - run `npx astro preview --port <free port>` (another session may hold 4321–4330);
  - the badge reads "Reconstrucción automática";
  - hovering a line names its source.
- Commit `data/reconstruccion/`, the changed `public/transcripciones-video/*.json`, and a short note of the summary: `videos: reconstruction for <what>`. Do not add AI attribution lines. Squash-merge, which deploys.

## When to rerun

| What changed | Rerun |
|---|---|
| New lyrics or span in `data/letras/` | that video |
| New approved facts (venue, winners, presenters) for an edition | that edition's videos |
| Programa transcription added or fixed | that edition's videos |
| New Welsh files imported (`import-cy`) | those videos |
| New Spanish-pass files imported (`import-es`) | those videos |
| `prompt.md` or `schema.json` edited | everything (bump `PROMPT_VERSION` in `windows.py`) |
| New video harvested | that video |

Only windows whose inputs changed are asked again, because each window carries a hash of its inputs.

## Reading the result

| Sign | Meaning | Do |
|---|---|---|
| `reglas` > 0 | the model wrote an unheard word, an unverified fix or source, or a call failed | normal in small numbers. The reason is printed per window (`rule 1…5`) |
| A video in the summary's `sin texto` list | no source made sense (garbled singing). No file is written and today's transcript stays | supply the piece's lyrics (`video-lyrics`); don't force text |
| A word without accents or capitals | the word list was folded again | check `display_words()` in `model.py` |
| An automatic line inside a song | the model kept a heard line next to the lyric | acceptable; better span times in `data/letras/videos.json` fix it |
| A listener reports a wrong Welsh word | a mishearing no rule closed | add `heard → right` to `data/glosario.md`, rerun that video |
| A Spanish word or name misspelt the same way in many videos (Várdico, Sampini) | Spanish recognition's b/v, s/z/c, ll/y swaps | add it to `TERM_FIXES` after checking every line, rerun the export |
| Welsh text over music at the start | Bangor writing over background | should be gone (conf < 0.6); if not, check the `lp` values in its file |

## Common mistakes

- **Running without `--dry-run` first** on many videos burns the subscription. Count first.
- **Editing `data/reconstruccion/*.json` by hand** is wrong: the next run overwrites it. Fix an input (lyrics, facts, programa) and rerun.
- **Raising the checker's ±5 s or adding words to `BASE_WORDS`** to rescue a window is still loosening the checker.
- **Reconstructing a video with no published transcript** is out of scope by design: `in_scope()` requires one.
