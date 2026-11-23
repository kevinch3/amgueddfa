# Welsh Whisper: laptop CPU vs KPC's P4000 (2026-11-23)

An ad-hoc benchmark, run while KPC was still working through the 25 Welsh-pass sessions it
had left (53 h of audio). The question: could the maintainer's laptop share the queue and
finish the pass sooner?

## Setup

Both machines used the same model and settings as KPC's `run_cy.py`:
- **Model:** `techiaith/whisper-large-ft-cy-en-ct2`.
- **Libraries:** faster-whisper 1.2.1 and CTranslate2 4.9.0.
- **Settings:** int8, `language="cy"`, `beam_size=5`, no VAD,
  `condition_on_previous_text=False`.

| | KPC | Laptop |
|---|---|---|
| Device | Quadro P4000, 8 GB (Pascal), CUDA int8 | AMD Ryzen 5 8640HS (6 cores / 12 threads, Zen 4), CPU int8, `cpu_threads=6`, `nice 19` |
| Memory | about 3 GB of GPU memory | 4.4–4.6 GB resident (1.7 GB just after loading the model) |
| Other load | GPU to itself (immich ML and nicotind-analysis stopped) | desktop in use, 14.4 GiB RAM, about 5 GB free |

KPC's figures come from its `cy-pub.log`, the real run: it logs each video's audio length and
how long it took. The GPU's only job, `run_cy.py`, was not interrupted. The laptop ran clips
KPC had already transcribed, so both the speed and the text could be compared.

## Speed

The rate is the seconds of work for each second of audio; lower is faster.

| Audio | P4000 | Laptop | Laptop is |
|---|---|---|---|
| Whole log so far: 484 videos, 90.5 h | 25.9 h, **0.29** | — | — |
| A 2-hour session (Cnfg_2htUXk), 10 minutes from 30:00 | **0.27** (the whole session: 1,949 s for 7,139 s) | 393 s for 600 s, **0.66** | 2.4× slower |
| A 153 s clip (l40GCOGznLk) | 16 s, **0.10** | 130 s, **0.85** | 8× slower |

On the short clip, the laptop spent 90 s on the first 30-second window, probably retrying at
higher temperatures over music. A first try on another clip (tBOZwvjnT6w, 226 s) did not
finish in 10 minutes. KPC has no time for that clip to compare: its run had failed with a GPU
memory error (see below).

## Text

The text was compared by word-sequence similarity (difflib's ratio on the lower-cased words):
- 0.55 on the 153 s clip;
- 0.53 on the 10-minute excerpt.

Where they differ:
- **Low-confidence windows (applause, music, hall noise):** almost all the difference is here.
  The GPU's average log-probability there was between −0.8 and −1.0, and each machine invents
  different text. CPU and CUDA int8 use different kernels, so on uncertain audio the beam search
  takes different paths.
- **Clear speech:** close to word for word on both machines.
- **Window placement:** in the excerpt the 30-second windows also start at another point, since
  the cut begins at 30:00.

Neither output is checked. The reconstruction treats either one as one input among several.

## What it means

**Running both machines:**
- On long sessions the two together would get through about 40% more audio per hour:
  3.7 seconds of audio per second on the GPU plus 1.5 on the laptop.
- For the 25 sessions left, KPC alone needs about 13 h, so it ends around 06:00 the next day.
  With the laptop it would take about 9–10 h, ending around 03:00.

**Short clips:** they stay on the GPU, where the laptop is 8× slower.

**A second GPU process:** it adds nothing.
- The GPU runs at 98% with one process, so a second one only splits that speed.
- An out-of-memory error kills both, as happened on 2026-11-22.
- All 24 failures in this pass were GPU memory errors: 12 "out of memory" and 12 "invalid device
  ordinal". They happened while immich ML and nicotind-analysis also held about 3.6 GB of the
  card. None were caused by the audio.

**Decision (maintainer, 2026-11-23):** the laptop was not used.
- The worker needs about 4.5 GB for about 9 h, which would push the desktop into swap. On that
  laptop `/tmp` is a RAM disk, and several sessions and a local Supabase stack were also open.
- The text is rebuilt in a later session anyway, so finishing 3 hours earlier overnight gains
  little.

## If a second worker is wanted later

- **Shared queue:** since 2026-11-23, KPC's `run_cy.py` claims each id before transcribing it.
  It creates `claims/<id>` with `mkdir` (atomic) and writes its name in `claims/<id>/owner`.
  - It skips an id that another worker claimed less than 30 minutes ago, and takes over a claim
    left longer than that.
  - A helper refreshes its claim every 5 minutes while it works.
  - So two machines can share `cy-pub-ids.txt` without doing the same session twice.
- **Helper script:** the laptop helper is kept outside the repo, in `../.whisper-laptop/`
  (`worker.py`, the model, and a venv).
  - It takes long sessions from the end of KPC's order, and only those it would finish before
    KPC could finish everything else.
  - It writes `out-cy/<id>.json` in `run_cy.py`'s format and logs an `ok … (laptop)` line to
    `cy-pub.log`.
- **Laptop setup:**
  - Use a Python 3.12 venv, and pin `av==17.1.0`: PyAV 19 breaks faster-whisper 1.2.1, with
    `open() got an unexpected keyword argument 'metadata_errors'`.
  - Keep the audio and the temporary WAV files on disk, not in `/tmp`.
