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
- **Welsh stays out** until the A/B review names a model: `WELSH_SOURCE = None` in `scripts/reconstruct/sources.py`. The review page is https://claude.ai/artifact/4s6RExhR7UmN2ZbidbBGs5, and the answer key is private in `../.reconstruccion/ab-pilot/key.json`.
- **Juventud and Mimosa are never reconstructed** (children, #29). The scope check is `in_scope()`, and the export applies it again.
- **Usage needs the maintainer's OK above 50 windows.** Show the dry run's window count first. The pilot cost about USD 0.028 API-equivalent per window, and the full archive is about 8,500 windows.
- **No `--bare`, no API key, no batch API.** Bare mode refuses the subscription.

## Steps

Work in a worktree (`../amgueddfa-wt-*`), with the backup disk mounted (`/run/media/kevinch3/4eff8b2b-…/amgueddfa-backup`).

```bash
python3 -m scripts.reconstruct_videos --dry-run --ids <id> [<id> …]   # windows per video, how many to ask
python3 -m scripts.reconstruct_videos --ids <id> [<id> …]             # ask, check, write data/reconstruccion/<id>.json
python3 -m scripts.export_video_transcripts                            # public/transcripciones-video/ prefers the reconstruction
npm run build && npm test && python3 -m pytest -q tests
```

- `--limit N` caps the number of videos. Leaving out `--ids` means every in-scope video, which is huge: ask first.
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
| A/B winner: set `WELSH_SOURCE` and copy the model's files next to the videos | Welsh-held videos first, then all |
| `prompt.md` or `schema.json` edited | everything (bump `PROMPT_VERSION` in `windows.py`) |
| New video harvested | that video |

Only windows whose inputs changed are asked again, because each window carries a hash of its inputs.

## Reading the result

| Sign | Meaning | Do |
|---|---|---|
| `reglas` > 0 | the model wrote an unheard word, or a call failed | normal in small numbers. The reason is printed per window (`rule 1…4`) |
| A video with 0 lines | no source made sense (garbled singing) | supply the piece's lyrics (`video-lyrics`); don't force text |
| A word without accents or capitals | the word list was folded again | check `display_words()` in `model.py` |
| An automatic line inside a song | the model kept a heard line next to the lyric | acceptable; better span times in `data/letras/videos.json` fix it |

## Common mistakes

- **Running without `--dry-run` first** on many videos burns the subscription. Count first.
- **Editing `data/reconstruccion/*.json` by hand** is wrong: the next run overwrites it. Fix an input (lyrics, facts, programa) and rerun.
- **Raising the checker's ±5 s or adding words to `BASE_WORDS`** to rescue a window is still loosening the checker.
- **Reconstructing a video with no published transcript** is out of scope by design: `in_scope()` requires one.
