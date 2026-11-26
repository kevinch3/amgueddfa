"""Pack a vision chunk once, for Kaggle and for Colab.

  python3 kaggle_chunk.py prepare <name> <ids.txt>    # ids: video ids with frames.json + ocr.json in $VISUAL_STORE

Writes, under $VISUAL_STORE (default ../.visual beside the repo):
  chunks/<name>.txt, chunks/<name>.tar   - what go_chunk.sh (Colab) uploads
  kaggle/<name>/data/                    - a PRIVATE dataset: <name>.tar, <name>.txt, code.tar, dataset-metadata.json
  kaggle/<name>/run/                     - the notebook: run.py + kernel-metadata.json (one model per GPU, any count)
Only the frames the model will read go in (scripts.visual.vlm.select), with ./ before each name: video ids can
start with "-", which tar reads as an option. One archive, not 30k files: per-file uploads were cut off (HTTP 499).

Then (the maintainer's token is in ~/.kaggle/access_token; never print it):
  kaggle datasets create -p kaggle/<name>/data          # private by default
  kaggle kernels push -p kaggle/<name>/run --accelerator NvidiaTeslaT4   # GPU jobs can queue for hours
                                         # (NvidiaL4 is not offered: it silently runs on CPU)
  kaggle kernels status / output ... -p <dir>           # results: out/<id>.jsonl
  kaggle datasets delete ... ; kaggle kernels delete ...   # when done
"""
import json, os, shutil, subprocess, sys
from pathlib import Path

SK = Path(__file__).resolve().parent
REPO = SK.parents[2]
sys.path.insert(0, str(REPO))
from scripts.visual.ocr_frames import has_text  # noqa: E402
from scripts.visual.vlm import select  # noqa: E402

V = Path(os.environ.get("VISUAL_STORE", REPO.parent / ".visual"))
USER = os.environ.get("KAGGLE_USER", "kevinch3")

RUN = r'''# Vision chunk {name}: Qwen2.5-VL-7B 4-bit, one model per GPU, frames read from the private dataset; stops at 11 h.
import glob, os, shutil, subprocess, sys, time
W = "/kaggle/working"
found = lambda pat: (glob.glob(f"/kaggle/input/**/{{pat}}", recursive=True) or [None])[0]
ids = open(found("{name}.txt")).read().split()
tar = found("{name}.tar")
if tar and os.path.isfile(tar):  # kept as a file
    subprocess.run(["tar", "-xf", tar, "-C", W], check=True)
else:  # Kaggle unpacked it into folders
    for vid in ids:
        shutil.copytree(os.path.dirname(found(f"{{vid}}/frames.json")), os.path.join(W, vid), dirs_exist_ok=True)
code = found("code.tar")
if code and os.path.isfile(code):
    subprocess.run(["tar", "-xf", code, "-C", W], check=True)
else:
    shutil.copytree(os.path.dirname(os.path.dirname(found("scripts/visual/vlm.py"))), W + "/scripts", dirs_exist_ok=True)
os.makedirs(W + "/code", exist_ok=True)
shutil.move(W + "/scripts", W + "/code/scripts")
if not shutil.which("nvidia-smi"):
    sys.exit("no GPU attached: Kaggle gave a CPU session (an accelerator it does not offer falls back to CPU)")
ngpu = max(1, subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True).stdout.count("GPU "))
for g in range(ngpu):
    open(f"{{W}}/g{{g}}.txt", "w").write("\n".join(ids[g::ngpu]) + "\n")
subprocess.run([sys.executable, "-m", "pip", "-q", "install", "bitsandbytes"], check=True)
t0 = time.time()
procs = [subprocess.Popen([sys.executable, "-m", "scripts.visual.vlm", f"{{W}}/g{{g}}.txt", "Qwen/Qwen2.5-VL-7B-Instruct", "4", "4"],
                          env=dict(os.environ, CUDA_VISIBLE_DEVICES=str(g), PYTHONPATH=W + "/code"),
                          stdout=open(f"{{W}}/g{{g}}.log", "w"), stderr=subprocess.STDOUT) for g in range(ngpu)]
while any(p.poll() is None for p in procs) and time.time() - t0 < 11 * 3600:
    time.sleep(60)
for p in procs:  # Kaggle stops at 12 h and keeps nothing; stop at 11 h and keep the partial files (vlm.py resumes them)
    if p.poll() is None:
        p.kill()
print("exit codes", [p.wait() for p in procs], "hours", round((time.time() - t0) / 3600, 2))
os.makedirs(W + "/out", exist_ok=True)  # keep only the model's output; frames stay out of the saved results
for f in glob.glob(W + "/*/vlm.4bit.jsonl"):
    shutil.copy(f, f"{{W}}/out/{{os.path.basename(os.path.dirname(f))}}.jsonl")
for d in glob.glob(W + "/*/"):
    if os.path.exists(d + "frames.json"):
        shutil.rmtree(d)
shutil.rmtree(W + "/code")
print(len(glob.glob(W + "/out/*.jsonl")), "videos read")
'''


def prepare(name: str, ids_file: str) -> None:
    ids = [l.strip() for l in open(ids_file, encoding="utf-8") if l.strip()]
    stage = V / "chunks" / f"{name}.stage"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    frames = 0
    for vid in ids:
        src = V / vid
        meta = json.loads((src / "frames.json").read_text(encoding="utf-8"))
        ocr = json.loads((src / "ocr.json").read_text(encoding="utf-8"))
        sel = select(meta["kept"], {r["t"] for r in ocr if has_text(r["text"])}, set(meta["cuts"]))
        (stage / vid).mkdir()
        for t in sel:
            os.link(src / f"f{t:06d}.jpg", stage / vid / f"f{t:06d}.jpg")
        for f in ("frames.json", "ocr.json"):
            shutil.copy(src / f, stage / vid / f)
        frames += len(sel)
    (V / "chunks" / f"{name}.txt").write_text("\n".join(ids) + "\n", encoding="utf-8")
    tar = V / "chunks" / f"{name}.tar"
    subprocess.run(["tar", "-cf", str(tar), "-C", str(stage)] + [f"./{i}" for i in ids], check=True)
    shutil.rmtree(stage)
    data, run = V / "kaggle" / name / "data", V / "kaggle" / name / "run"
    for d in (data, run):
        d.mkdir(parents=True, exist_ok=True)
    shutil.copy(tar, data / f"{name}.tar")
    shutil.copy(V / "chunks" / f"{name}.txt", data / f"{name}.txt")
    subprocess.run(["tar", "-cf", str(data / "code.tar"), "-C", str(REPO), "scripts/__init__.py", "scripts/ocr.py",
                    "scripts/visual"], check=True)
    (data / "dataset-metadata.json").write_text(json.dumps(
        {"title": f"amgueddfa-vis-{name}", "id": f"{USER}/amgueddfa-vis-{name}", "licenses": [{"name": "other"}]}))
    (run / "run.py").write_text(RUN.format(name=name), encoding="utf-8")
    (run / "kernel-metadata.json").write_text(json.dumps(
        {"id": f"{USER}/amgueddfa-vis-{name}-run", "title": f"amgueddfa-vis-{name}-run", "code_file": "run.py",
         "language": "python", "kernel_type": "script", "is_private": True, "enable_gpu": True, "enable_internet": True,
         "dataset_sources": [f"{USER}/amgueddfa-vis-{name}"], "competition_sources": [], "kernel_sources": []}))
    print(f"{name}: {len(ids)} videos, {frames} frames (~{frames * 3.5 / 3600:.1f} T4-h); "
          f"{tar.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] != "prepare":
        sys.exit(__doc__)
    prepare(sys.argv[2], sys.argv[3])
