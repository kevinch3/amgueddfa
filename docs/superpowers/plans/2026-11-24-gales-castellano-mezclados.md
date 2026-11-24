# Mixed Welsh and Spanish Speech: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild video text so that each stretch of mixed Welsh and Spanish speech appears once, at the time it was spoken, in the language it was spoken. The first video rebuilt this way is utHSvsjwvwo.

**Architecture:**
- A new GPU pass, `scripts/colab/pase_mezcla.py`, runs on KPC and on Colab. It writes three files per video, which are imported next to the backed-up video with earlier versions kept.
- A new module, `scripts/reconstruct/mezcla.py`, turns those files into decided lines: Bangor's text where Welsh won, turbo's text where Spanish won.
- `load_sources()` uses the decided lines and drops other Spanish lines by overlap of time spans. Videos without the three files keep today's rules unchanged.
- The rebuild marks its output `"mezcla": true`, and the export then trusts the decided language of Bangor's lines.

**Tech Stack:** Python 3 (scripts, pytest), faster-whisper 1.2.1 / CTranslate2 4.9.0 on GPU (KPC P4000, Colab T4 via Google's hosted Colab MCP).

**Spec:** `docs/superpowers/specs/2026-11-24-gales-castellano-mezclados-design.md` (approved 2026-11-24; #152, #153, #155). Pass notebook: #154.

## Global Constraints

- **Thresholds, verbatim from the spec:**
  - lines break at a pause of 0.6 s or more, at a sentence end, or at 14 words;
  - a clear winner is 0.10 or more of mean word confidence above the other;
  - a run shorter than 3 words takes its neighbours' language;
  - a Spanish-source line is dropped when it overlaps a decided line by at least half of its own length;
  - turbo hears each line with 0.2 s of audio added at each side.
- **Kept as is:**
  - `MIN_CY_CONF` 0.6, the English filter, the lyric spans, the window model, the checker, the prompt and `schema.json`;
  - the source names stay `subida`, `yt_es`, `whisper_es`, `cy`, `letra`, and turbo's text is published as `whisper_es`.
- **Raw files are never overwritten.** Imports go through `keep_earlier()` (#151).
- **One GPU job at a time on KPC.** Stop `immich_machine_learning` while it runs and start it again afterwards, as `gpu_turno.sh` does.
- **No lyrics in any public text:** code, tests, fixtures, commits, PRs, docs. Recited or sung words are lyrics too.
  - Test fixtures use invented neutral phrases.
  - The maintainer's real cases live privately in `../.reconstruccion/casos-mezcla.json`.
- **Never edit `data/reconstruccion` by hand.**
- **Before any rebuild,** run the dry run and show its window count. Anything above 50 windows needs the maintainer's OK.
- **Never use** `--bare`, an API key or the batch API.
- **Juventud and Mimosa are never rebuilt.**
- **Commits:** `area: …` style, with no Claude attribution lines. Squash-merge with `--subject "<area>: … (#N)"`.
- **Always work in a worktree,** never in the main checkout.

## Review Focus

1. **A video with only one or two of the three pass files** follows today's rules, never a half-mixed path. Test in Task 4.
2. **A Bangor segment with no word times** (`words: []`) still becomes a line, kept as Welsh if its confidence is at least 0.6. Its text must not vanish. Test in Task 4.
3. **Turbo text that wins on confidence but is a stock phrase or a loop** loses to Bangor. If nothing else is left, the line is Welsh. Test in Task 3.
4. **A Spanish-source line without an end time** is taken to last 1.0 s for the overlap rule. Test in Task 4.
5. **A Welsh lyric span on a mixed video** is timed from the decided Welsh lines (`heard_cy`). Test in Task 4.

---

### Task 1: The pass records its machine; `import-mezcla`

**Files:**
- Modify: `scripts/colab/pase_mezcla.py` (`run()` meta), then rebuild the notebook with `python3 scripts/colab/make_notebook.py`
- Modify: `scripts/backup/videos.py` (new `cmd_import_mezcla` and its subparser), `docs/backup.md` (layout entry)
- Test: `tests/test_colab_pase.py`, `tests/test_backup_videos.py`

**Interfaces:**
- Produces:
  - `pase_mezcla.gpu_name() -> str`: the first line of `nvidia-smi --query-gpu=name --format=csv,noheader`, or `"unknown"`.
  - Every output file's meta gains a `"machine"` field.
  - `videos.py import-mezcla <src>` copies `src/<id>.words.json` to `<stem>.cy-palabras.json`, `src/<id>.es-lines.json` to `<stem>.es-lineas.json`, and `src/<id>.es-words.json` to `<stem>.es-turbo.json`.
  - Exported constant `MEZCLA_SUFFIXES = (".cy-palabras.json", ".es-lineas.json", ".es-turbo.json")` in `scripts/reconstruct/sources.py`, used by `videos.py`.

- [ ] **Step 1: Write the failing tests:**
  - `test_gpu_name_without_nvidia_smi`: monkeypatch `shutil.which` to return None, then assert `gpu_name() == "unknown"`.
  - `test_import_mezcla_copies_all_three_and_keeps_earlier`: uses the `_one_video` fixture.
    - Importing `v.words.json`, `v.es-lines.json` and `v.es-words.json` gives three files beside the video, with the suffixes above.
    - A second import with changed content moves the first ones to `versiones/`.
  - `test_import_mezcla_skips_incomplete_ids`: an id with only `words.json` imports nothing, and the printed count is 0.
- [ ] **Step 2:** `python3 -m pytest -q tests/test_colab_pase.py tests/test_backup_videos.py` fails on the new tests.
- [ ] **Step 3:** Implement. `import-mezcla` imports an id only when all three files exist, and copies each file with `keep_earlier`.
- [ ] **Step 4:** The tests pass, `test_notebook_is_built_from_the_module` passes, and the whole `pytest` suite passes.
- [ ] **Step 5:** Commit: `backup: import the mixed-language pass; the pass records its GPU`.

### Task 2: Spanish lines keep their end times

**Files:**
- Modify: `scripts/export_video_transcripts.py` (`parse_vtt`, `clean_whisper`), `scripts/reconstruct/sources.py` (`Line`, `load_sources`)
- Test: `tests/test_export_video_transcripts.py`, `tests/test_reconstruct_sources.py`

**Interfaces:**
- Produces:
  - `parse_vtt_timed(text) -> list[list]` returns `[start, end, line]`, and `parse_vtt` becomes its 2-column view.
  - `clean_whisper_timed(segments) -> list` returns `[start, end, text]` with the same filters, and `clean_whisper` becomes its 2-column view.
  - `Line` gains a last field, `e: float | None = None`, after `conf`.
  - `load_sources` sets `e` on `subida`, `yt_es` and `whisper_es` lines, from the cue or segment end.

- [ ] **Step 1: Write the failing tests:**
  - `test_parse_vtt_timed_keeps_cue_end`: with the existing `VTT` fixture, the first row is `[1.0, 3.0, "competencia número doce"]`.
  - `test_spanish_lines_carry_their_end`: in `_fixture`, the `yt_es` line at 1.0 has `e == 3.0`, and a `whisper_es` line has `e == t + 2.0`.
- [ ] **Step 2:** The new tests fail. The existing tests stay unchanged.
- [ ] **Step 3:** Implement. A VTT line repeated across rolling cues keeps the end of the cue where it first appears.
- [ ] **Step 4:** The whole `pytest` suite passes, and `python3 -m scripts.export_video_transcripts` gives no diff in `public/transcripciones-video/`. Check with `git status --short public/ | head`; it must print nothing.
- [ ] **Step 5:** Commit: `videos: Spanish source lines keep their end times`.

### Task 3: Deciding each Bangor line (`scripts/reconstruct/mezcla.py`)

**Files:**
- Create: `scripts/reconstruct/mezcla.py`
- Test: `tests/test_reconstruct_mezcla.py`

**Interfaces:**
- Consumes: the `es-lineas` rows `{"s","e","cy","cy_p","cy_words","es","es_p","es_words"}`, written by `pase_mezcla.es_lines`, and `Line` from Task 2.
- Produces:
  - `decide(rows: list[dict], conf: dict[float, float]) -> list[Line]`. Lines with `src == "cy"` are Welsh; lines with `src == "whisper_es"` and `lang == "es"` are turbo's Spanish. Each has `t` and `e`, and `conf` is the segment's confidence for `cy` lines.
  - `conf` maps each row's start to its Bangor segment's `exp(lp)`. Task 4 builds it.
  - Constants: `CLEAR = 0.10`, `MIN_RUN = 3`, `JOIN_GAP = 1.0`.

- [ ] **Step 1: Write the failing tests.** All text is invented and neutral, never lyrics.
  - `test_clear_welsh_line_is_bangor_whole`: `cy_p 0.90`, `es_p 0.50` gives one line `("cy", "cy")` with Bangor's text, `t = s` and `e = e`.
  - `test_clear_spanish_line_is_turbo_whole`: `cy_p 0.78`, `es_p 0.92` gives one `whisper_es` line with turbo's text.
  - `test_close_line_splits_word_by_word`:
    - a row with 4 Bangor words at about 0.95 probability, where turbo's words over the same seconds are at about 0.4;
    - then 5 words where turbo's are at about 0.95 and Bangor's at about 0.4;
    - the mean gap is under 0.10;
    - expect two lines, `cy` then `whisper_es`. The second starts at the first turbo word's start.
  - `test_short_run_takes_neighbours_language`: the word labels `cy cy cy es es cy cy cy` give one `cy` line.
  - `test_stock_phrase_cannot_win`: turbo wins on confidence, but its text matches `STOCK` (use one of `STOCK`'s own phrases). The result is the Bangor line.
  - `test_empty_turbo_is_welsh`: `es_words: []` gives a `cy` line.
  - `test_repeat_at_cut_is_joined`: two `whisper_es` lines under 1.0 s apart, where the first ends and the second starts with the same word, give one line with that word once.
- [ ] **Step 2:** `python3 -m pytest -q tests/test_reconstruct_mezcla.py` fails, because the module doesn't exist yet.
- [ ] **Step 3: Implement `decide`.**
  - **Per row:**
    - gap = `cy_p - es_p`;
    - when gap ≥ CLEAR, or `es_words` is empty: Bangor, whole;
    - when gap ≤ −CLEAR: turbo, whole;
    - otherwise, word by word.
  - **Word by word:**
    - each Bangor word is labelled `cy` when its probability is at least the highest probability among turbo's words overlapping it in time, and `es` otherwise;
    - runs shorter than `MIN_RUN` take the label of the longer neighbouring run, or of the only neighbour;
    - each `cy` run publishes Bangor's words;
    - each `es` run publishes turbo's words whose start falls in the run's time.
  - **Filters:** turbo text goes through `clean_whisper_timed`'s STOCK and LOOP filters; a run left empty becomes `cy`.
  - **Join:** adjacent lines of the same source are joined when under `JOIN_GAP` apart and repeating a word at the cut.
- [ ] **Step 4:** The tests pass.
- [ ] **Step 5:** Commit: `videos: decide each Bangor line's language from both models' confidence`.

### Task 4: `load_sources` uses the decided lines and overlap of time spans

**Files:**
- Modify: `scripts/reconstruct/sources.py`
- Test: `tests/test_reconstruct_sources.py` (new `_mezcla_fixture`)

**Interfaces:**
- Consumes: `decide` (Task 3), `MEZCLA_SUFFIXES` (Task 1), `Line.e` (Task 2).
- Produces:
  - `has_mezcla(stem: Path) -> bool`: true when all three files exist.
  - `OVERLAP = 0.5` and `UNKNOWN_SPAN = 1.0`.
  - On the new path, `load_sources` returns the decided lines in place of the Bangor segments.

- [ ] **Step 1: Write the failing tests.** `_mezcla_fixture` writes the three files beside the stem, using invented text.
  - `test_welsh_kept_next_to_spanish_garble`, the 5:21 case: a clear-Welsh row has 6 words of `whisper_es` garble starting 1 s after it, overlapping only 0.4 of the garble line's length. The `cy` line is present, and the garble line is kept too, because the overlap is under half.
  - `test_spanish_line_before_welsh_segment_is_kept`, the 7:34 case: a `whisper_es` line that ends before the decided line starts is kept.
  - `test_duplicate_spanish_line_dropped_by_overlap`, the 7:45 case: a `yt_es` line overlapping a decided line by 60% of its own length is dropped. At 40% it is kept.
  - `test_unknown_end_counts_one_second`: a `subida` line with `e=None` is judged on a span from `t` to `t+1.0`.
  - `test_incomplete_pass_keeps_todays_rules`: only `cy-palabras.json` is present. The output equals today's output, with `SPANISH_NEAR` in force.
  - `test_segment_without_words_is_kept`: a Bangor segment with `words: []` and `lp` giving 0.8 confidence comes out as a `cy` line at its own `s`. With 0.5 confidence it is dropped.
  - `test_whisper_es_pass_ignored_when_mezcla`: a `.whisper-es.json` (#112) beside the files contributes nothing.
  - `test_welsh_lyric_timed_from_decided_lines`: a Welsh lyric span on a mixed video aligns from the decided `cy` lines.
- [ ] **Step 2:** The new tests fail, and the old tests pass.
- [ ] **Step 3: Implement.** When `has_mezcla(stem)`:
  - **Build `conf`:** read the segments in `cy-palabras`, and map each `es-lineas` row to its segment's `exp(lp)` by time containment.
  - **Bangor lines:**
    - rows whose segment is below `MIN_CY_CONF`, or whose text `is_english`, are dropped;
    - the remaining rows go through `decide`;
    - segments with no words are added as `cy` lines.
  - **Spanish sources:**
    - the `es-turbo` segments are added as `whisper_es` lines with ends, through `clean_whisper_timed`;
    - `.whisper-es.json` is skipped;
    - every `subida`, `yt_es` and `whisper_es` line that is not a decided line is dropped when its overlap with any decided line is at least `OVERLAP` of its own length (`e` or `t + UNKNOWN_SPAN`).
  - **Unchanged:** the `SPANISH_NEAR`, `SPANISH_SPEECH_WORDS` and `SAME_SPEECH` code is left as it is, for the other path. The lyric code is unchanged too.
- [ ] **Step 4:** The whole `pytest` suite passes.
- [ ] **Step 5:** Commit: `videos: mixed-language videos match sources by time span`.

### Task 5: The decided language reaches the player

**Files:**
- Modify: `scripts/reconstruct_videos.py` (writes `"mezcla": true` when `has_mezcla(stem)`), `scripts/export_video_transcripts.py` (`line_languages`, plus dropping `mezcla` before writing)
- Test: `tests/test_export_video_transcripts.py`, `tests/test_reconstruct_cli.py`

**Interfaces:**
- Consumes: `has_mezcla` (Task 4).
- Produces: in `line_languages`, when `t.get("mezcla")`, a line whose `fuentes == ["cy"]` is `"cy"`. Everything else is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `test_mezcla_bangor_line_is_welsh_even_with_spanish_words`: under `mezcla`, a `["cy"]` line whose Spanish words outnumber its Welsh ones gives `"cy"`. Without `mezcla` it gives `"es"`, as today.
  - `test_mezcla_flag_not_published`: the exported JSON has no `mezcla` key.
  - `test_cli_marks_mezcla`: with a stubbed `has_mezcla` returning True, the written reconstruction has `"mezcla": true`.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement as stated. Check that `join_fragments` and `drop_english` pass unknown keys through, and that `apply_corrections` keeps `explicit` working.
- [ ] **Step 4:** The whole `pytest` suite passes. Then run `npm run build && npm test`, with the local env loaded only through `set -a && . <scratchpad>/localtest/local.env && set +a`.
- [ ] **Step 5:** Commit: `videos: the decided language of Bangor's lines reaches the player`.

### Task 6: The maintainer's cases, checked privately

**Files:**
- Create: `scripts/reconstruct/casos.py`
- Create (private, never committed): `../.reconstruccion/casos-mezcla.json`
- Test: `tests/test_reconstruct_casos.py`, with a synthetic cases file

**Interfaces:**
- Produces: `python3 -m scripts.reconstruct.casos <video_id> <cases.json> [--reconstruccion]` prints `PASS`/`FAIL` per case and `N/M pass`, and exits 1 on any FAIL.
  - By default it checks the `load_sources` lines.
  - With `--reconstruccion` it checks `data/reconstruccion/<id>.json` instead.
- The cases file is a list of objects with these kinds:
  - `{"kind": "present", "name", "t", "tol", "words": [...], "lang"?}`: some line within `t ± tol` contains every folded word, with the given `lang` if one is set;
  - `{"kind": "once", "name", "from", "to", "words": [...]}`: the words appear in exactly one line in the window;
  - `{"kind": "absent_lang", "name", "from", "to", "src", "pattern"}`: no line from `src` in the window matches the regex.

- [ ] **Step 1:** Write `test_casos_kinds` with an invented cases file and invented lines, covering each kind passing and failing.
- [ ] **Step 2:** The test fails.
- [ ] **Step 3: Implement.**
  - Write the private cases file from the 9 checks in the pilot scorer, kept privately at `../.reconstruccion/mezcla-score3-piloto.py`. Copy its words exactly. The words stay in that private file only.
- [ ] **Step 4:** The test passes. Running on the pilot files is not possible until Task 7 imports them; note that in the ledger.
- [ ] **Step 5:** Commit `casos.py` and its test only: `videos: check the maintainer's cases from a private file`.

### Task 7: Thresholds on two more sessions, on both machines (GPU; needs the maintainer)

**Files:** no code. A report in `docs/research/2026-11-XX-mezcla-umbrales.md` with counts and times only, no quoted speech.

- [ ] **Step 1: Choose the sessions.**
  - Choose one mostly Spanish and one mostly Welsh in-scope session with an existing `cy-techiaith.json`, ranked by the share of Bangor lines `line_language()` calls Welsh. Exclude Juventud and Mimosa.
  - Show the two ids and their shares to the maintainer, and wait for an OK.
- [ ] **Step 2: Run on KPC.**
  - Use `pase_mezcla.py` on 0:00–30:00 of each session (`run(..., until=1800)`) inside a `gpu_turno`-style wrapper (stop immich ML, one job, restart it), writing to `pase-mezcla/`.
  - Also run utHSvsjwvwo 0:00–30:00, so `casos.py` has KPC files to check.
- [ ] **Step 3: Run on Colab.**
  - Use the same three clips through the hosted Colab MCP: `create_runtime` with a T4 from `list_runtime_specs`, upload the stream-copied m4a, run the pass with `execute_code`, and download the outputs.
  - Then `delete_runtime`.
- [ ] **Step 4: Import and compare.**
  - Import with `import-mezcla`, from KPC first. Colab's files go to a separate folder, used for the comparison only.
  - Run `pase_mezcla.compare` per session, and `casos.py` on utHSvsjwvwo for both machines.
- [ ] **Step 5: Report and ask.** Write the report: agreement per machine pair, the stretches where the decisions differ (times only), and whether 0.6 / 0.10 / 3 / 0.5 hold. Ask the maintainer to listen to five of the disagreeing stretches per session at the linked times, and to OK the thresholds or ask for changes.
- [ ] **Step 6:** Commit the report. PR, merge.

### Task 8: Rebuild utHSvsjwvwo (needs the maintainer)

- [ ] **Step 1: Run the whole session through the pass.**
  - It's 8.7 h of audio. Run it on Colab through the hosted MCP, about 2.5 h on a T4.
  - Or run it on KPC, about 4 h, if Colab has no GPU.
  - Import with `import-mezcla`.
- [ ] **Step 2:** `python3 -m scripts.reconstruct_videos --dry-run --ids utHSvsjwvwo`. Show the window count to the maintainer and wait for an OK.
- [ ] **Step 3:** Rebuild, export, then `python3 -m scripts.reconstruct.casos utHSvsjwvwo ../.reconstruccion/casos-mezcla.json --reconstruccion`, which must print `9/9 pass`. Then run `pytest`, `npm run build` and `npm test`.
- [ ] **Step 4:** Open a PR with the summary line, the casos result, and links into the player at 5:21, 7:34, 7:45, 8:01 and 8:31 (`#v=utHSvsjwvwo&t=<s>`). The maintainer checks them in the player before the merge.

The full pass over the archive and the rebuild batches (rollout steps 3 and 4) get their own plan after Task 8. That plan covers queues, the KPC and Colab split, compute units, and per-batch window counts.
