---
name: video-visual
description: Use when reading what the archive's videos SHOW rather than say - on-screen text (OCR of slides, title cards, banners, credits), a vision model describing scenes (ceremonies, robes, flower dance, kneeling), linking performance clips to their programa competition, or running any of this on the laptop, KPC, Google Colab or Kaggle GPUs. Also when a Colab runtime keeps being reclaimed, a Kaggle dataset upload is cut off, or someone asks who is on screen.
---

# What the videos show (frames, OCR, vision model)

The sound is covered by the reconstruction (skill `video-reconstruction`). This is the picture.

1. **Frames:** pick one frame every 5 s, kept only when the picture changed. That is about 500 frames per hour of video.
2. **OCR** (Tesseract) on every kept frame.
3. **A vision model** (Qwen2.5-VL-7B) writes one sentence per chosen frame.
4. **Clip links:** performance clips are tied to their programa competition from title codes and on-screen cards.

Code: `scripts/visual/` (`frames.py`, `ocr_frames.py`, `vlm.py`, `runs.py`, `clip_comps.py`), tests in `tests/test_visual*.py`. Ops helpers for the cloud GPUs live beside this file.

## Rules that don't bend

- **Never name a person from their face.** Names come only from text: a card or caption read by OCR, the speech transcript, the programa, or facts.
  - The prompt says "describe roles only".
  - The vision model cannot tell you who presented. It can only say "a presenter at a podium".
- **Everything raw stays private** in `../.visual/<id>/`, outside the repo: frames, `ocr.json`, `vlm*.jsonl`, and the review lists (`clip-comps.tsv`).
  - Only reviewed text and links reach the site.
  - Cloud copies are **private** Kaggle datasets, deleted after the run. Colab runtimes are deleted when done.
- **Scope:** Chubut and Trevelin only. Never Juventud, Mimosa, or the `Infantil`/`Juvenil` Trevelin folders (children, #29).
- **No lyrics or recited words in public text.** Slide texts (prayers, anthems) become lyric *candidates* for the maintainer (skill `video-lyrics`).
- **Facts read on screen** (chair donor or maker, sponsors) are candidates. Load them only with the maintainer's OK (skill `app-data-update`).

## Which machine does what

| Step | Machine | Why |
|---|---|---|
| `frames.py` (ffmpeg, one at a time) | **Laptop** | The videos are on its backup disk. 277 h of video take about 1.5 h. |
| `ocr_frames.py <dir> 6` | **KPC CPU** (8 cores, plenty of RAM), plus the laptop with 2 workers | ~19 frames/s together. `OMP_THREAD_LIMIT=1` per Tesseract is built in (without it 6 workers ran at 3–4 s/frame). |
| `vlm.py`, the 7B in 4-bit | **Kaggle 2× T4** first, **Colab** T4/L4/A100 too | 2.5 s/frame on a T4. |
| — | **Not KPC's GPU** | The P4000 (Pascal) took 27 s/frame in 4-bit: bitsandbytes has no fast path. |
| `clip_comps.py` | **Laptop** | Reads `../.visual/*/ocr.json`, writes `public/marcadores-video/`. |

**Balance between machines:** one video's frames always go through one machine. Split the work into chunks of about 4 h of GPU time. Kaggle takes chunks one after another; Colab takes one in parallel.

## Model and frames (measured 2026-11-25)

- **Precision: 4-bit.**
  - 8-bit: 2.8× slower (7.2 against 2.55 s/frame), 83% identical cues, same ceremony runs.
  - 8-bit needs the vision encoder unquantised, `llm_int8_skip_modules=["model.visual", …]`. Transformers 5 matches from the path start, so `"visual"` alone fails with `cublasLt ran into an error`.
  - The 3B is ruled out: it broke the format, echoed the prompt and made up text.
- **Prompt:** two lines, `TEXT:` and `WHAT:` (one sentence). Name no festival in it: told "Eisteddfod", the model "reads" that word on frames without it.
- **Cues come from the sentence, by word, not from labels:** robes/gowns, dance, flowers/bouquets, kneel, judges/panel.
  - One-word scene labels were too coarse: anyone at a podium was a "ceremony".
  - Yes/no questions came back unlabelled and one answer short.
- **Frames for the model** (`select`): every 4th kept frame, each OCR hit with its neighbours, and every scene cut.
  - Sessions and ceremonies: about 32.5k frames, ~23 T4-h.
  - Clips are mostly identified by title and card, so the vision model is optional there.

## Reading the cues (`runs.py`)

A single frame proves nothing: labels flicker. Use runs: a 5-frame majority, at least 3 frames.

| Run | Usually means |
|---|---|
| **robes**, then **dance**, then **kneel**, within a few minutes | a **chairing or crowning** (2001: dance 34:35, kneel 35:10) |
| **robes** alone | the Gorsedd on stage, a procession |
| **dance** alone | a **dance competition**, not a ceremony |
| **flowers** alone | bouquets handed to winners |

Ceremony runs become **candidate** chapters, reviewed against `scripts/video_markers.py`'s `ceremonia` markers before anything is published.

## Steps

1. **Frames and OCR, all videos:** run `frames.py` per video on the laptop, then `ocr_frames.py` on KPC. Both resume (`frames.json`, `ocr.json`). Count real text with `has_text` (3+ words of 4+ letters); Tesseract turns textures into "A y | —".
2. **Clip links:** `python3 -m scripts.visual.clip_comps`.
   - Sources: title code `CH2013022`, title numbers ("Comp. 76, 28 y 70"), then the card.
   - A card that contradicts the code or title goes to review, never public.
   - A single-competition clip starts at 0:00, even when its card comes late.
   - Check the 6–20 review rows by eye before merging.
3. **Vision model:**
   - **Kaggle:** `python3 kaggle_chunk.py prepare <list>`, upload, then push the notebook with `--accelerator NvidiaTeslaT4` (2× T4). Pull the output when the status is complete.
   - **Colab:** `bash go_chunk.sh <chunk>` keeps the kernel busy, fetches results every 2 min, and resumes on a new runtime after a reclaim.
4. **Clean up:** delete the Kaggle dataset and notebooks, and the Colab runtimes. `kaggle quota` and `list_runtimes` should show nothing left running.

## Cloud traps

| Symptom | Cause | Do |
|---|---|---|
| Colab runtime gone after ~25 min, mid-run | Colab judges by the **kernel**: a detached GPU subprocess looks idle | Run `keepbusy.py` for the whole run; restart it on 502s (`go_chunk.sh` does) |
| `execute_code` times out on a short call | Calls to one session queue behind a long one | New session, or reattach with the same `executionId` |
| Colab refuses every GPU (FAILED_PRECONDITION) | Capacity or cooldown | Retry every 2 min across L4, A100, G4, T4; use Kaggle meanwhile |
| Kaggle dataset "ready" but files missing, upload ended `499` | Tens of thousands of single files cut off | Upload **a few `.tar` files**; Kaggle unpacks them into folders |
| `tar: opción no reconocida` with `-T list`, or the results tar stops growing although the log shows more videos done | Ids starting with `-` (`-0VtD_5HIlA`) read as options, also from a shell glob `*/x` | Prefix names and globs with `./` (`./*/vlm.4bit.jsonl`); count the tar's files against the log's `frames read` lines before deleting a runtime |
| Kaggle job QUEUED for hours | One GPU session per account; an open interactive notebook holds it | Keep one job; ask the maintainer to stop open sessions; `kaggle quota` |
| Kaggle CLI login | New `KGAT_…` tokens live in `~/.kaggle/access_token` (the maintainer puts it there) | Never paste or print it |

## Common mistakes

- **Publishing scene runs directly.** They are candidates; dancing alone is a competition.
- **Reloading the model per video:** about a minute each. Pass a `.txt` list of folders to `vlm.py`.
- **Trusting a late card over the title.** In 2015 a card read as 8 (the Corona) sat in a clip titled Comp. 86.
- **Expecting OCR on old videos.** 2001–2018 streams show only banners and the stage motto. Slides and title cards are mostly 2010s–2020s (688 of 1,532 videos have any real text).
- **Asking the picture for presenters' names.** 2018 test: the recordings name ceremony roles, never the session presenters. That needs a human source.
