# Video Text Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pipeline that rebuilds each published video's text from its transcriptions, lyrics and edition context, with Claude choosing and correcting and a code checker deciding what gets published.

**Architecture:**
- A small Python package, `scripts/reconstruct/`, has one module per step: sources, context, windows, model call, checker, fallback, merge.
- A CLI, `scripts/reconstruct_videos.py`, runs those steps per video and writes `data/reconstruccion/<id>.json`, which is committed.
- `export_video_transcripts` prefers that file over the single picked source, and the player shows a "Reconstrucción automática" badge.

**Tech Stack:**
- Python 3 (stdlib only) and pytest;
- `claude -p` (Claude Code CLI 2.1.329) on the maintainer's subscription;
- TypeScript and Vitest for the player.

**Spec:** `docs/superpowers/specs/2026-11-20-reconstruccion-videos-design.md` (merged #53).

## Global Constraints

- **Model and command.** Model `claude-sonnet-5-5`, effort `medium`, run as:
  `claude -p --model claude-sonnet-5-5 --effort medium --tools "" --strict-mcp-config --mcp-config <empty> --no-session-persistence --output-format json --system-prompt-file <rules> --json-schema <schema>`
  - It runs from a scratch working directory (`../.reconstruccion/run/`), never from the repo.
  - The reply is the last event with `type == "result"`, read from its `structured_output`.
  - There is no API key, no Batches API, and no `--bare` (which would refuse the subscription).
- **Scope.** Only videos with `festival` in `{"chubut", "trevelin"}` that already have a published transcript. Juventud and Mimosa never get text (#29).
- **Welsh.** Welsh is not a source until the A/B review names a model: `WELSH_SOURCE = None` in `scripts/reconstruct/sources.py`.
- **Lyrics.** Lyric lines come only from `data/letras/` through `scripts/align_lyrics.py`. They are published verbatim, and nothing here writes or edits lyrics.
- **Windows.** About 60 s each, with 5 s of overlap. A line passes the checker only if every word appears:
  - in a source line within ±5 s,
  - in a lyric line of the window, or
  - in the window's word list.
  
  Words are compared without accents or case.
- **Failures.** One failed line fails its window, and that window uses the rules fallback.
- **Output.** Each output line keeps its sources (`fuentes`). The output file has `src: "reconstruida"`.
- **Private copies.** Raw model replies go to `../.reconstruccion/replies/<id>/<hash>.json`, never into the repo.
- **Commits.** Commit style is `area: …`, with no AI attribution lines. Work in the worktree `../amgueddfa-wt-seo` and never switch branches in the main checkout.

## Review Focus

1. **A window with only music or applause** (no words in any source): the expected result is no model call and no lines. Test in Task 3.
2. **`claude -p` exits non-zero, times out, hits the usage limit, or returns no `structured_output`.** That window falls back to rules, and the run stops after 3 failures in a row instead of using up the subscription. Test in Task 4.
3. **Words with punctuation, accents, apostrophes or capitals** ("¡Gracias!", "Eisteddfod's", "Gŵyl", "TRELEW"): they must match their source word. Test in Task 5.
4. **Lines in the 5 s overlap returned by both windows:** each line appears once in the final file. Test in Task 6.
5. **A rerun with unchanged inputs:** zero model calls, and the output file is byte-identical. Test in Task 7.

---

### Task 1: Timed sources per video

**Files:**
- Create: `scripts/reconstruct/__init__.py` (empty), `scripts/reconstruct/sources.py`
- Test: `tests/test_reconstruct_sources.py`

**Interfaces:**
- Consumes:
  - `parse_vtt`, `clean_whisper`, `glob_escape` from `scripts/export_video_transcripts.py`;
  - `spans_for(video_id)`, `parse_letra(text)`, `align(seg, stanzas, desde, hasta)`, and `LETRAS` from `scripts/align_lyrics.py`.
- Produces:
  - `Line = NamedTuple("Line", [("t", float), ("text", str), ("src", str), ("lang", str)])`
  - `WELSH_SOURCE: str | None = None`
  - `load_sources(stem: Path, video_id: str, letras: Path = LETRAS) -> list[Line]`: every timed line, sorted by `t`.
    - `src` is one of `"subida"`, `"yt_es"`, `"whisper_es"`, `"cy"`, `"letra"`.
    - The YouTube `-orig` captions of language `es` give `yt_es`; the uploaded subtitles give `subida`; the Spanish Whisper file gives `whisper_es`.
    - `cy` lines appear only when `WELSH_SOURCE` is set.
    - `letra` lines come from `align` over the `yt_es`/`whisper_es` lines, for each span in `spans_for(video_id)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_load_sources_reads_youtube_whisper_and_lyrics(tmp_path): ...
    # fixture: <stem>.es-orig.vtt (2 cues), <stem>.whisper.json (language es, 2 segments),
    # letras dir with prueba.md (2 lines) + videos.json {"vid": [{"letra":"prueba","desde":5,"hasta":40}]}
    # assert {l.src for l in lines} == {"yt_es", "whisper_es", "letra"}
    # assert [l.t for l in lines] == sorted(l.t for l in lines)
    # assert all(l.lang == "es" for l in lines if l.src != "letra")

def test_welsh_is_left_out_until_chosen(tmp_path):
    # fixture has <stem>.cy-whisper.vtt; WELSH_SOURCE is None
    # assert not any(l.src == "cy" for l in load_sources(stem, "vid", letras))
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_sources.py`. Expected: FAIL (ModuleNotFoundError).
- [ ] **Step 3: Implement `load_sources` in `scripts/reconstruct/sources.py`.** The lyric span's `lang` comes from the lyric file's `idioma` front matter.
- [ ] **Step 4: Run them to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git add scripts/reconstruct tests/test_reconstruct_sources.py && git commit -m "reconstruct: timed sources per video (YouTube, Whisper es, lyrics)"`

### Task 2: Context and word list

**Files:**
- Create: `scripts/reconstruct/context.py`
- Test: `tests/test_reconstruct_context.py`

**Interfaces:**
- Consumes:
  - `title_competitions(title)` and `front_items(text, stem)` from `scripts/letras_pendientes.py`;
  - `src/data/videos.json`, `src/data/catalog.json`, `src/data/transcripciones/*.md`, `data/approved/contributions.json`, `public/marcadores-video/<id>.json`.
- Produces:
  - `Context = NamedTuple("Context", [("text", str), ("words", frozenset[str])])`
  - `programa_lines(repo: Path, festival: str, year: int) -> dict[int, str]`: **every** numbered competition line of that edition's programa transcriptions. Unlike `sung_competitions`, it doesn't stop at sung ones.
  - `video_context(repo: Path, video: dict, t0: float, t1: float) -> Context`.
    - `text` holds the festival name, the year, the competition lines on screen in `[t0, t1)` (from the clip title, or the chapter whose start is the last before `t0`), and the edition's approved `venue`, `ganador_silla`, `ganador_corona` and `presentadores` values.
    - `words` is the folded tokens of `text` plus `{"eisteddfod", "gorsedd", "wladfa", "chubut", "trelew", "gaiman", "trevelin", "dolavon", "madryn"}`.
  - `fold(s: str) -> str` and `tokens(s: str) -> list[str]`, both in this module and reused by Task 5. They lower-case, drop accents (NFD, strip `Mn`), and split on anything but letters and apostrophes inside words.

- [ ] **Step 1: Write the failing tests**

```python
def test_context_names_the_competition_and_edition_facts(tmp_path):
    # repo fixture: videos.json with a clip titled "... Competencia Nº 75 ...", a programa transcription with "75. Segunda competencia principal...: «Rosa Amarela», Heitor Villalobos",
    # contributions.json approved fact venue "Gimnasio Municipal N.º 1, Trelew"
    ctx = video_context(repo, video, 0, 60)
    assert "Rosa Amarela" in ctx.text and "Gimnasio Municipal" in ctx.text
    assert {"rosa", "amarela", "villalobos", "gimnasio", "eisteddfod"} <= ctx.words

def test_tokens_fold_accents_case_and_punctuation():
    assert tokens("¡Gracias, TRELEW! Gŵyl Eisteddfod's") == ["gracias", "trelew", "gwyl", "eisteddfod's"]
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_context.py`. Expected: FAIL.
- [ ] **Step 3: Implement `programa_lines`, `video_context`, `fold` and `tokens` in `scripts/reconstruct/context.py`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "reconstruct: edition context and word list per window"`

### Task 3: Windows with an input hash

**Files:**
- Create: `scripts/reconstruct/windows.py`
- Test: `tests/test_reconstruct_windows.py`

**Interfaces:**
- Consumes: `Line` (Task 1) and `Context` (Task 2).
- Produces:
  - `Window = NamedTuple("Window", [("t0", float), ("t1", float), ("lines", tuple[Line, ...]), ("context", Context), ("hash", str)])`
  - `make_windows(lines: list[Line], duration: float, context_for: Callable[[float, float], Context], size: float = 60.0, overlap: float = 5.0) -> list[Window]`.
    - Cuts fall at the largest gap between consecutive line starts within ±10 s of each nominal cut.
    - Each window holds the lines with `t0 - overlap <= t < t1 + overlap`.
    - `hash` is the sha256 of the canonical JSON of `(t0, t1, lines, context.text, PROMPT_VERSION)`, where `PROMPT_VERSION = 1` lives in this module.
  - `needs_model(w: Window) -> bool`: false when no line in the window has a word token.

- [ ] **Step 1: Write the failing tests**

```python
def test_windows_cover_the_video_with_overlap(): ...
    # 200 s of lines every 3 s -> 4 windows; consecutive windows share lines in the 5 s overlap; t0 of first == 0, t1 of last == 200
def test_hash_changes_only_with_inputs(): ...
    # same inputs -> same hashes; edit one line's text -> only that window's hash changes
def test_music_only_window_needs_no_model():
    # window lines ["[música]", "[aplausos]"] -> needs_model(w) is False
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_windows.py`. Expected: FAIL.
- [ ] **Step 3: Implement `make_windows` and `needs_model`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "reconstruct: 60 s windows with overlap and input hash"`

### Task 4: The model call through `claude -p`

**Files:**
- Create: `scripts/reconstruct/model.py`, `scripts/reconstruct/prompt.md` (the system prompt: the rules from the spec's "Model call" section), and `scripts/reconstruct/schema.json`, which is the JSON Schema of `{"lines": [{"t": number, "lang": "cy"|"es"|"en"|"pt"|"la", "text": string, "src": [string], "fixes": [{"from": string, "to": string}]}]}` with `additionalProperties: false` everywhere.
- Test: `tests/test_reconstruct_model.py`

**Interfaces:**
- Consumes: `Window` (Task 3).
- Produces:
  - `class ModelError(Exception)`
  - `window_prompt(w: Window) -> str`: the user message. It contains the window's lines as `[t] (src, lang) text`, then the context text, then the word list sorted.
  - `ask(w: Window, run: Callable[[list[str], str], subprocess.CompletedProcess] = _run_claude, timeout: int = 300) -> dict`.
    - It returns `structured_output`.
    - It raises `ModelError` on a non-zero exit, a timeout, an `is_error` result, or a missing `structured_output`.
    - `_run_claude(argv, cwd)` calls `subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=…)`.
  - `CLAUDE_ARGV: list[str]`: the exact command from Global Constraints. The prompt and schema paths are absolute.

- [ ] **Step 1: Write the failing tests**

```python
def test_ask_reads_structured_output_from_last_result_event():
    fake = lambda argv, cwd: CompletedProcess(argv, 0, stdout=json.dumps([{"type":"system","subtype":"init"},{"type":"result","is_error":False,"structured_output":{"lines":[]}}]), stderr="")
    assert ask(window, run=fake) == {"lines": []}

@pytest.mark.parametrize("stdout,code", [("", 1), (json.dumps([{"type":"result","is_error":True}]), 0), (json.dumps([{"type":"result","is_error":False}]), 0), ("not json", 0)])
def test_ask_raises_model_error(stdout, code): ...

def test_argv_never_uses_bare_and_disables_tools_and_mcp():
    assert "--bare" not in CLAUDE_ARGV and CLAUDE_ARGV[CLAUDE_ARGV.index("--tools") + 1] == "" and "--strict-mcp-config" in CLAUDE_ARGV
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_model.py`. Expected: FAIL.
- [ ] **Step 3: Implement `window_prompt`, `ask` and `CLAUDE_ARGV`. Write `prompt.md` and `schema.json`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Smoke test against the real CLI (one call; the smoke test on 2026-11-20 succeeded).** Run `python3 -c "…ask(one real window)…"`. Expected: a dict whose `lines` is a list.
- [ ] **Step 6: Commit.** `git commit -m "reconstruct: window prompt and claude -p call (Sonnet 5.5, subscription)"`

### Task 5: The checker

**Files:**
- Create: `scripts/reconstruct/checker.py`
- Test: `tests/test_reconstruct_checker.py`

**Interfaces:**
- Consumes: `Window` (Task 3), and `tokens`/`fold` (Task 2).
- Produces: `check_window(w: Window, reply: dict) -> list[str]`, which returns the rule failures (an empty list means pass). The rules, verbatim from the spec:
  1. Every token of a line's `text` is a token of a window line within ±5 s of the line's `t`, of any `letra` line in the window, or of `w.context.words`.
  2. Every `fixes[].to` folds to tokens all in `w.context.words`.
  3. `w.t0 - 5 <= t < w.t1 + 5`, and the `t` values don't decrease.
  4. A line whose `src` contains `"letra"` equals some `letra` line's text exactly.

- [ ] **Step 1: Write the failing tests:** one passing reply, then one failing reply per rule.

```python
def test_reply_with_fix_from_word_list_passes(): ...      # "Stedbot" -> "Eisteddfod" (in words) -> []
def test_invented_word_fails(): ...                       # text adds "ganadora" heard nowhere -> ["rule 1: …ganadora…"]
def test_fix_outside_word_list_fails(): ...               # fixes to "Gaimán" not in words -> rule 2
def test_time_outside_window_or_backwards_fails(): ...    # rule 3
def test_edited_lyric_line_fails(): ...                   # src ["letra"] text differs by one word -> rule 4
def test_punctuation_accents_and_case_still_match(): ...  # source "¡GRACIAS a Trelew!" -> line "gracias a trelew" -> []
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_checker.py`. Expected: FAIL.
- [ ] **Step 3: Implement `check_window`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "reconstruct: checker (no unheard words, fixes from word list, times, verbatim lyrics)"`

### Task 6: Rules fallback and merge

**Files:**
- Create: `scripts/reconstruct/merge.py`
- Test: `tests/test_reconstruct_merge.py`

**Interfaces:**
- Consumes: `Window` (Task 3).
- Produces:
  - `OutLine = NamedTuple("OutLine", [("t", float), ("text", str), ("lang", str), ("fuentes", tuple[str, ...])])`
  - `rules_lines(w: Window) -> list[OutLine]`.
    - Lyric lines win inside their span.
    - Otherwise the lines come from the first available of `subida` > `yt_es` > `whisper_es` > `cy`, inside `[t0, t1)`.
  - `reply_lines(reply: dict) -> list[OutLine]`
  - `merge(windows: list[Window], per_window: list[list[OutLine]]) -> list[OutLine]`.
    - Each window keeps only its own lines in `[t0, t1)`, which drops overlap duplicates.
    - The result is sorted by `t`.

- [ ] **Step 1: Write the failing tests**

```python
def test_rules_prefer_lyrics_then_youtube(): ...
def test_merge_keeps_one_copy_of_overlap_lines(): ...   # same line at t=62 returned by window [0,60)+overlap and [60,120) -> once
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_merge.py`. Expected: FAIL.
- [ ] **Step 3: Implement `rules_lines`, `reply_lines` and `merge`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "reconstruct: rules fallback and window merge"`

### Task 7: CLI, cache and output file

**Files:**
- Create: `scripts/reconstruct_videos.py`
- Test: `tests/test_reconstruct_cli.py`

**Interfaces:**
- Consumes: everything above, plus `DEFAULT_BACKUP` and the `INDEX.tsv` reading from `export_video_transcripts`.
- Produces: `reconstruct_video(repo: Path, backup: Path, video: dict, ask=ask, replies: Path = REPLIES) -> dict | None`. It writes `data/reconstruccion/<id>.json`:

```
{"src": "reconstruida", "lang": "es", "modelo": "claude-sonnet-5-5", "seg": [[t, text], …],
 "fuentes": [[src, …], …], "letras": [...from align_lyrics.apply...],
 "ventanas": {"total": n, "modelo": n, "reglas": n, "vacias": n}}
```

  - A reply is cached at `replies/<id>/<hash>.json`, so a cached window is never asked again.
  - The run stops after 3 `ModelError`s in a row.

  The CLI is `python3 -m scripts.reconstruct_videos [--ids …] [--limit N] [--dry-run]`.
  - `--dry-run` prints the windows to ask per video without calling the model.
  - It picks only Chubut and Trevelin videos that have a file in `public/transcripciones-video/`.
  - At the end it prints the window counts and the usage (sum of the replies' `total_cost_usd`, labelled "equivalente API, cubierto por la suscripción").

- [ ] **Step 1: Write the failing tests**

```python
def test_rerun_with_same_inputs_makes_no_model_calls(tmp_path): ...  # second run: fake ask call count 0, output bytes identical
def test_failed_window_uses_rules_and_is_counted(tmp_path): ...       # fake ask raises ModelError once -> ventanas["reglas"] == 1
def test_three_model_errors_in_a_row_stop_the_run(tmp_path): ...      # raises SystemExit / returns None after 3
def test_juventud_video_is_never_reconstructed(tmp_path): ...         # video festival "juventud" -> None, no file written
```

- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_reconstruct_cli.py`. Expected: FAIL.
- [ ] **Step 3: Implement `reconstruct_video` and the CLI.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "reconstruct: CLI with reply cache, stop on repeated errors, output file"`

### Task 8: Export and player

**Files:**
- Modify: `scripts/export_video_transcripts.py`. In `export()`, use `data/reconstruccion/<vid>.json` when it exists, instead of `pick()` + `apply_lyrics`. It keeps the `FESTIVALS` scope and skips the `useful()` gate (that gate already passed when the video was chosen).
- Modify: `src/lib/video-transcript.ts`. Add `'reconstruida'` to `TranscriptSource`, keep an optional `fuentes: string[][]`, and accept both in `asTranscript`.
- Modify: `src/scripts/reproductor.ts`. When `tr.fuentes` exists, give each line a `title` naming its sources.
- Modify: `src/i18n/*.json` (7 languages). Add the key `reproductor.fuente.reconstruida`:
  - es "Reconstrucción automática"
  - cy "Ail-luniad awtomatig"
  - en "Automatic reconstruction"
  - fr "Reconstruction automatique"
  - it "Ricostruzione automatica"
  - sv "Automatisk rekonstruktion"
  - zh "自动重建"
- Test: `tests/test_export_video_transcripts.py`, `tests-js/video-transcript.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Python: `test_export_prefers_reconstruction(tmp_path)`. The output file has `src == "reconstruida"`, its `fuentes` has the same length as `seg`, and a Juventud video with a reconstruction file is still skipped.
  - Vitest: `asTranscript({src: 'reconstruida', lang: 'es', seg, fuentes})` keeps `fuentes`, and `asTranscript` still rejects an unknown `src`.
- [ ] **Step 2: Run them to verify they fail.** Run `python3 -m pytest -q tests/test_export_video_transcripts.py && npx vitest run tests-js/video-transcript.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the export preference, the type and parser change, the line titles, and the i18n keys.**
- [ ] **Step 4: Run the full suites.** Run `python3 -m pytest -q tests && npm run build && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "videos: export and player use the reconstructed text when present"`

### Task 9: Pilot on about 10 videos

**Files:**
- Create: `data/reconstruccion/*.json` (the pilot outputs), and `docs/research/2026-11-20-reconstruccion-piloto.md` (the report).

- [ ] **Step 1: Pick 10 videos.** They are `h5zX7SaZJt8` (with lyrics), 3 single-competition Chubut clips with YouTube captions, 3 with Whisper es, 1 long Chubut session (chapters), and 2 Trevelin videos. Run `python3 -m scripts.reconstruct_videos --dry-run --ids …`. Expected: window counts per video.
- [ ] **Step 2: Run them.** Run `python3 -m scripts.reconstruct_videos --ids …`. Expected: 10 output files, and a summary with the windows per kind and the usage.
- [ ] **Step 3: Export, build and test.** Run `python3 -m scripts.export_video_transcripts && npm run build && npm test`. Expected: pass. `git status` shows only the 10 transcripts and `data/reconstruccion/`.
- [ ] **Step 4: Look at it.** Run `npx astro preview` on a free port, then open `h5zX7SaZJt8` and the long session. Expected: the badge reads "Reconstrucción automática", the lyrics still show in italics with ♪, and the line titles name their sources.
- [ ] **Step 5: Write the report.** It covers the checker pass rate, the rule failures by rule, 5 before/after examples (not lyrics), the usage, and the estimate for all ~520 videos.
- [ ] **Step 6: Commit.** `git commit -m "videos: reconstruction pilot on 10 videos (report in docs/research)"`. Then PR and squash-merge.

### Task 10: The `video-reconstruction` skill

**Files:**
- Create: `.claude/skills/video-reconstruction/SKILL.md`. Write it with superpowers:writing-skills, from the pilot's real commands.
- Modify: `docs/restauracion-videos.md` (the layer table: reconstruction state), and `.claude/skills/video-lyrics/SKILL.md` (a pointer saying "then rerun reconstruction for that video").

- [ ] **Step 1: Write the skill:**
  - when to run it (inputs that change: lyrics, Welsh winner, facts, new videos);
  - the commands (`--dry-run` first, with usage shown before a full run, and the user's OK for runs over 50 videos);
  - the guard rules;
  - how to read the summary;
  - the commit and the deploy.
- [ ] **Step 2: Check it against the pilot.** A fresh read must reproduce Task 9's commands exactly.
- [ ] **Step 3: Commit.** `git commit -m "skills: video-reconstruction"`. Then PR and squash-merge.
