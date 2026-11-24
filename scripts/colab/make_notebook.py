"""Build pase_mezcla.ipynb from pase_mezcla.py (the notebook embeds the module, so it runs on its own in Colab).
  python3 scripts/colab/make_notebook.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PINS = ("faster-whisper==1.2.1 ctranslate2==4.9.0 av==17.1.0 "
        "nvidia-cublas-cu12==12.9.3.13 nvidia-cudnn-cu12==9.28.1.4")  # the versions on KPC, so both runs give the same results

INTRO = """# Mixed Welsh/Spanish pass (Amgueddfa)

Runs the pass from `docs/superpowers/specs/2026-11-24-gales-castellano-mezclados-design.md` on a GPU:
Bangor's Welsh model with word times, then turbo in Spanish on each of its lines and over the whole audio.

**Before running**
1. *Runtime → Change runtime type → T4 GPU* (or better).
2. Put the audio files in Google Drive, in `MyDrive/amgueddfa-colab/audio/`, each named `<video id>.<ext>`.
   The audio is private material from the archive's backup: don't share the folder.
3. *Runtime → Run all.* Google asks for access to Drive.

Results go to `MyDrive/amgueddfa-colab/out/`. A video already done is skipped, so after a disconnect just run all again.
The notebook is built from `scripts/colab/pase_mezcla.py`; don't edit it here."""

SETUP = f"""!nvidia-smi --query-gpu=name,memory.total --format=csv
!pip -q install {PINS}"""

CONFIG = """BASE = '/content/drive/MyDrive/amgueddfa-colab'  # or a folder in the runtime, e.g. '/content/amgueddfa-colab'
UNTIL = None      # seconds of each file to process; None = all of it (the KPC comparison test uses 1800)
ONLY = None       # a set of video ids to process, or None for every file in audio/
COMPUTE = 'int8'  # same as KPC

if BASE.startswith('/content/drive'):
    from google.colab import drive
    drive.mount('/content/drive')"""

RUN = """import importlib, pase_mezcla
importlib.reload(pase_mezcla)
pase_mezcla.run(f'{BASE}/audio', f'{BASE}/out', until=UNTIL, compute_type=COMPUTE, only=ONLY)"""


COMPARE = """# Only for the comparison test: KPC's files for the same audio in amgueddfa-colab/kpc/. Prints how close the runs are.
import os
ids = sorted({f.split('.')[0] for f in os.listdir(f'{BASE}/kpc')}) if os.path.isdir(f'{BASE}/kpc') else []
for vid in ids:
    print(vid)
    print('\\n'.join(pase_mezcla.compare(f'{BASE}/out', f'{BASE}/kpc', vid)))"""


def cell(kind, src):
    c = {"cell_type": kind, "metadata": {}, "source": src.splitlines(keepends=True)}
    if kind == "code":
        c.update(execution_count=None, outputs=[])
    return c


def build():
    module = (HERE / "pase_mezcla.py").read_text(encoding="utf-8")
    cells = [cell("markdown", INTRO), cell("code", SETUP), cell("code", CONFIG),
             cell("code", "%%writefile pase_mezcla.py\n" + module), cell("code", RUN), cell("code", COMPARE)]
    nb = {"cells": cells, "nbformat": 4, "nbformat_minor": 5,
          "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                       "kernelspec": {"name": "python3", "display_name": "Python 3"}}}
    return json.dumps(nb, ensure_ascii=False, indent=1) + "\n"


if __name__ == "__main__":
    (HERE / "pase_mezcla.ipynb").write_text(build(), encoding="utf-8")
    print("wrote", HERE / "pase_mezcla.ipynb")
