# Video text reconstruction

## Intent

Each video on the site gets one text: what was said and sung, in the right language, with names spelled correctly, line by line at its moment. Visitors read it in the player and it is published without a person checking it. This is the step that joins layers 2 (speech), 3 (structure) and 4 (sung words) of `docs/restauracion-videos.md`.

**Goals**
- A model assembles the text from every source and the edition's context.
- Code then verifies the model added nothing that nobody heard.
- Every line keeps its source.

**Non-goals**
- Summaries, translations, and lyrics written by the model.
- Human review. The maintainer may add it later; it is not part of this design.

**Anti-goals.** These would make it a failure even if it runs:
- an invented sentence, name or lyric published under the archive's name;
- a Welsh stretch published from a model that the A/B test did not pick;
- a Juventud or Mimosa video gaining text (children, #29).

## Inputs (per video)

| Input | From | Notes |
|---|---|---|
| The video | private backup (`INDEX.tsv`) | base and timeline; never published |
| Spanish speech | YouTube captions (`.es-orig.vtt`), Whisper es (`.whisper.json`) | already filtered by the quality gate |
| Welsh speech | the model the A/B test picks (pilot: turbo vs techiaith) | with line confidence and word times |
| Sung words | `data/letras/` aligned by `scripts/align_lyrics.py` | lyric lines are copied verbatim, never edited |
| Structure | competition chapters (`public/marcadores-video/`), the competition number in clip titles | which competition is on at each moment |
| Context | that competition's programa line (titles, composers, poets), the edition's approved facts (venue, winners), festival names | becomes the window's word list |

## Approaches considered

1. **Rules only:** pick the source by language and confidence, then fix spellings from a word list. Predictable and free, but it cannot use context.
2. **Model picks and corrects, code checks:** chosen by the maintainer (2026-11-20).
3. **Model rewrites freely:** rejected, because it risks invented text with nobody reviewing it.

## Design

**Unit:** windows of about 60 s, with 5 s of overlap, cut at speech pauses where possible.

**Model call:** one per window, through Claude Code in non-interactive mode, on the maintainer's subscription. There is no API key and no batch API. The command is:

```
claude -p --model claude-sonnet-5-5 --effort medium --tools "" \
  --strict-mcp-config --mcp-config <empty> --no-session-persistence \
  --output-format json --system-prompt-file <rules> --json-schema <schema>
```

- It runs from a scratch folder, so no project instructions (CLAUDE.md) load.
- The structured result is the last `result` event's `structured_output`.
- Calls run a few at a time, to respect the subscription's usage limits.
- A smoke test on 2026-11-20 succeeded: `apiKeySource: none`, about 5k tokens of fixed overhead per call.
- The result has this shape:

```json
{"lines": [{"t": 12.4, "lang": "cy|es|en", "text": "…",
            "src": ["yt_es", "whisper_es", "cy", "letra"],
            "fixes": [{"from": "Stedbot", "to": "Eisteddfod"}]}]}
```

The prompt's rules:
- Use only words from the sources, the lyric lines, or the window's word list.
- Pick the source that fits the language and the context.
- Correct a spelling only to a word in the word list.
- Copy lyric lines unchanged.
- Leave out a stretch when no source makes sense, rather than guessing.

**Checker (code; it decides what is published).** For each returned line:
1. Every word appears in a source line within ±5 s, in the window's lyric lines, or in the word list (compared without accents or case).
2. Every `fixes.to` is in the word list.
3. The time lies inside the window and lines run in order.
4. A `letra` line equals a lyric line exactly.

If a window has any failed line, the **whole window** falls back to the rules from approach 1. Each check is logged.

**Output:** `public/transcripciones-video/<id>.json` with `src: "reconstruida"` and a `fuente` on each line. The player badge reads "Reconstrucción automática"; the lyric badge and the per-line source behave as now. The export keeps today's gates: published languages, scope (Chubut and Trevelin), and no Juventud or Mimosa.

**Runs**
- `scripts/reconstruct_videos.py` (Python SDK) works in steps: `prepare` → `submit` → `collect` → `check` → `export`.
- Each window stores a hash of its inputs, so a rerun only resends windows whose inputs changed (new lyrics, a new Welsh model, new facts).
- Model replies are kept privately (`../.reconstruccion/`) for auditing.

**Welsh gating:** until the A/B test names a winner, Welsh stretches have no Welsh source and stay out, as today. Spanish and lyrics go ahead.

**Measures:**
- the checker's pass rate per window;
- the share of lines from each source;
- fallback windows per video.

All three are reported after each run. The A/B result sets which Welsh source is used.

## Decided by the maintainer
- Approach 2. Published without review.
- The A/B test (reviewers) chooses the Welsh model.
- A project skill `video-reconstruction` will hold the procedure (run steps, guard rules, reruns, cost approval). It is written after the pilot run, so it describes real commands. It points to `video-lyrics` for lyrics.

## Left to the builder
- The exact length of the windows and the pause detection.
- The prompt wording.
- How words are split into tokens for the checker.
- Batch size.
- The player's wording, which needs the 7 languages.

## Model and access
Nothing open. Decided on 2026-11-20:
- The model is `claude-sonnet-5-5`.
- Calls run on the maintainer's Claude subscription through `claude -p`. There is no API key and no batch API.
- Usage counts against the subscription's limits. The pilot reports the usage per video before the full run.
