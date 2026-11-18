# Otros festivales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify the archive's non-main festival videos per the approved rules, keep them (and the Trevelin children) off the site, and make future harvests follow the same rules.

**Architecture:** The archive (`../VIDEOS.tsv`, `../Videos/`, not a git repo) is the store; the folder name is the event. `harvest.py` decides folders for new videos; `scripts/export_videos.py` decides what reaches the site.

**Tech Stack:** Python 3 stdlib, pytest.

**Spec:** `docs/superpowers/specs/2026-11-18-otros-festivales-design.md`

## Global Constraints

- Main festivals stay exactly `Eisteddfod_del_Chubut`, `Eisteddfod_de_la_Juventud`, `Eisteddfod_Mimosa`, `Eisteddfod_de_Trevelin`.
- Folder targets: Camwy → `Micro_Eisteddfod_de_Camwy`; William Morris → `Eisteddfod_de_Dolavon`; Infantil/Juvenil de Trevelin → `Eisteddfod_de_Trevelin`; Esquel folder disappears.
- `k8Vuwdn8fmc` is not archived; `ITLEsdZoBAM` → `_sin_clasificar`, kind `noticia`, year 2023.
- No public change: `src/data/videos.json` must gain no video.
- No Claude attribution in commits.

## Review Focus

- A Trevelin title with "Infantil"/"Juvenil" in another case or with "niños" → still held back (test in Task 2).
- An "Eisteddfod del Chubut" title that mentions "Gales" as a choir's origin → not dropped (test in Task 1).
- Re-running the migration → no change the second time (Task 3 step 3).
- A moved row whose thumbnail is missing → row moves, `thumb_path` empty, no crash (Task 3).
- The backup's symlinked list changes under a running backup → saved files keep their INDEX path (Task 3 step 4 check).

---

### Task 1: Harvest rules

**Files:**
- Modify: `.claude/skills/youtube-eisteddfod-harvest/harvest.py` (`FESTIVALS`, `EXPLICIT`, `WALES`, `classify`)
- Create: `tests/test_harvest_rules.py` (load module with `importlib.util.spec_from_file_location`)

**Interfaces:** Produces `classify(d: dict, hint=None) -> dict | None` unchanged in shape.

- [ ] **Step 1: Failing tests**
  - `test_trevelin_children_go_to_trevelin`: `classify({"title": "Eisteddfod Infantil Trevelin 2020. Premiados competencia 22.", "uploader_id": "@EisteddfodTrevelin"})["festival"] == "Eisteddfod_de_Trevelin"`; same for "Eisteddfod Juvenil Trevelin 2012".
  - `test_camwy_is_micro`: title "Eisteddfod Camwy 2014 - Gwanwyn", uploader `@kevinhughes26` → `Micro_Eisteddfod_de_Camwy`.
  - `test_william_morris_is_dolavon`: "Mini Eisteddfod William Morris (29/6/2013) en la localidad de Dolavon", `@emiliopinciroli162` → `Eisteddfod_de_Dolavon`.
  - `test_eisteddfod_de_gales_dropped`: "Alun Ial Jones (Teithiau): Eisteddfod Gales de Carreg Las // Radio Nacional Esquel" → `None`.
  - `test_chubut_with_gales_choir_kept`: "Eisteddfod del Chubut 2019 - Coro de Gales" → `Eisteddfod_del_Chubut`.
- [ ] **Step 2:** `python3 -m pytest -q tests/test_harvest_rules.py` → FAIL.
- [ ] **Step 3:** Point the Infantil/Juvenil/Camwy/William Morris entries at their target folders (keep their patterns, so they still win over looser ones); delete the `Eisteddfod_de_Esquel` entries (Esquel alone names no festival). Add a title-only `ABROAD = r"eisteddfod (de )?gales"` check in `classify` that returns `None` even when Patagonia is named.
- [ ] **Step 4:** tests PASS; full `python3 -m pytest -q` PASS.
- [ ] **Step 5:** Commit `harvest: Otros festivales rules (Camwy, Dolavon, Trevelin one event, no Gales)`.

### Task 2: Export holds back the Trevelin children

**Files:** Modify `scripts/export_videos.py`; Test `tests/test_export_videos.py`.

**Interfaces:** Produces `held_back(row: dict) -> bool`.

- [ ] **Step 1: Failing test** `test_trevelin_children_held_back_until_29`: rows "Eisteddfod Infantil Trevelin 2020 - x", "EISTEDDFOD JUVENIL TREVELIN 2012", "Eisteddfod de los niños Trevelin" (all `Eisteddfod_de_Trevelin`) are not exported; "Eisteddfod de Trevelin 2014 - Coro" is.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `held_back(row)`: festival `Eisteddfod_de_Trevelin` and title matches `r"infantil|juvenil|ni[ñn]os"` (case-insensitive). Comment: children, waits for issue #29. Skip such rows in `export`.
- [ ] **Step 4:** PASS; `python3 -m scripts.export_videos` then `git diff --stat src/data/videos.json` → no change (they were never exported).
- [ ] **Step 5:** Commit `videos: keep Trevelin's children's videos off the site until #29`.

### Task 3: Migrate the archive data

**Files:** one-off script in the scratchpad (not committed); data `../VIDEOS.tsv`, `../Videos/`.

- [ ] **Step 1:** Copy `../VIDEOS.tsv` to `../VIDEOS.tsv.bak-2026-11-18`.
- [ ] **Step 2:** Script: per Global Constraints, rewrite `festival` (and `kind`/`year` for `ITLEsdZoBAM`), drop `k8Vuwdn8fmc` (delete its thumbnail), move each thumbnail to `Videos/<festival>/<year>/<same name>` and set `thumb_path` (empty if the file is missing); remove empty old folders. Write with the same `FIELDS` order and `lineterminator="\n"` as `harvest.py`.
- [ ] **Step 3:** Run twice; second run reports 0 changes. Check counts: `Micro_Eisteddfod_de_Camwy` 27, `Eisteddfod_de_Dolavon` 9, `Eisteddfod_de_Trevelin` 223, no `Camwy`/`William_Morris`/`Esquel`/`Infantil`/`Juvenil` folders; every non-empty `thumb_path` exists.
- [ ] **Step 4:** `python3 -m scripts.export_videos` → `git diff src/data/videos.json` empty. `python3 scripts/backup/videos.py find 3zA1P7AQNS8` still prints its saved file.

### Task 4: Write the rules down

**Files:** Modify `.claude/skills/youtube-eisteddfod-harvest/SKILL.md`; GitHub issue #29 comment.

- [ ] **Step 1:** SKILL.md: a short "Otros festivales" section with the rule, the folder targets, `noticia`, abroad not archived, Trevelin children and Otros held back until #29.
- [ ] **Step 2:** `gh issue comment 29` naming what waits for it (Otros folders, 32 Trevelin children's videos).
- [ ] **Step 3:** Commit `docs: Otros festivales rules` with the spec and this plan; push.
