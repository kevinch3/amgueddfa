"""Spanish text for the Spanish speech in videos Whisper took for Welsh (issue #112).

  run_es.sh ids.txt                                   (LD_LIBRARY_PATH, nice, nohup)
  venv/bin/python run_es.py ids.txt [--cpu] [--since S] [--until S] [--out DIR] [--detect-only]

Whisper picked one language per file from its first 30 s, so sessions that open with music were
transcribed as Welsh and have no Spanish source. Here every segment Bangor's model found
(out-cy/<id>.json) gets Whisper large-v3-turbo's language detection on its own audio; a segment
where Spanish is likelier than Welsh (and at least MIN_ES) is transcribed in Spanish.

out-es/<id>.json: {"id", "model", "min_es", "duration", "segments": [{"s", "e", "es", "cy", "text"?}]}
  es / cy: detection probabilities (every segment of at least MIN_LEN s), so the threshold can be
  changed later without the GPU; text: Spanish segments only. Generated, not checked.
Skips ids already done and prints "missing" for ids without audio or Bangor output.
--cpu / --since / --until / --out: a pilot on the CPU (while the GPU is busy) over the first SECONDS.
--detect-only: only the probabilities, no Spanish text ("detect_only": true), for videos that already have
  Spanish text (Whisper ran in Spanish): they tell which stretches are Spanish speech (#125).
"""
import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

from faster_whisper import WhisperModel, decode_audio

W = Path(__file__).resolve().parent
AUDIO, CY, OUT = W / "audio", W / "out-cy", W / "out-es"
MODEL = "large-v3-turbo"
CHUNK = 3600       # s: Bangor's chunks too, so its segments never cross a chunk boundary
SR = 16000
MIN_ES = 0.5       # Spanish probability a segment needs (and more than Welsh)
MIN_LEN = 0.5      # s: shorter segments are not detected
# Whisper's stock line over silence. A lone "Gracias." stays: Bangor heard speech here and Spanish was detected.
JUNK = {"", "subtítulos realizados por la comunidad de amara.org"}


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def probs(model: WhisperModel, audio) -> tuple[float, float]:
    _, _, all_probs = model.detect_language(audio=audio)
    d = dict(all_probs)
    return round(d.get("es", 0.0), 3), round(d.get("cy", 0.0), 3)


def spanish(model: WhisperModel, audio) -> str:
    segs, _ = model.transcribe(audio, language="es", beam_size=5, vad_filter=False, condition_on_previous_text=False)
    text = " ".join(s.text.strip() for s in segs).strip()
    return "" if text.lower() in JUNK else text


def run(model: WhisperModel, vid: str, until: float | None, since: float = 0, detect_only: bool = False) -> dict:
    src = AUDIO / f"{vid}.m4a"
    cy = json.loads((CY / f"{vid}.json").read_text(encoding="utf-8"))["segments"]
    dur = duration(src)
    end = min(dur, until) if until else dur
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "c.wav"
        for start in range(0, max(int(end), 1), CHUNK):
            here = [s for s in cy if start <= s["s"] < start + CHUNK and since <= s["s"] < end]
            if not here:
                continue
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(CHUNK), "-i", str(src),
                            "-ac", "1", "-ar", str(SR), str(wav)], check=True)
            audio = decode_audio(str(wav), sampling_rate=SR)
            for s in here:
                a, b = s["s"] - start, min(s.get("e", s["s"] + 30) - start, CHUNK)
                if b - a < MIN_LEN:
                    continue
                piece = audio[int(a * SR):int(b * SR)]
                p_es, p_cy = probs(model, piece)
                row = {"s": s["s"], "e": s.get("e"), "es": p_es, "cy": p_cy}
                if p_es >= MIN_ES and p_es > p_cy and not detect_only:
                    row["text"] = spanish(model, piece)
                rows.append(row)
    return {"id": vid, "model": MODEL, "min_es": MIN_ES, "duration": round(dur, 1),
            **({"detect_only": True} if detect_only else {}), "segments": rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids")
    ap.add_argument("--cpu", action="store_true")
    ap.add_argument("--until", type=float)
    ap.add_argument("--since", type=float, default=0)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--detect-only", action="store_true")
    args = ap.parse_args()
    ids = Path(args.ids).read_text().replace(",", "\n").split()
    args.out.mkdir(exist_ok=True)
    model = WhisperModel(MODEL, device="cpu" if args.cpu else "cuda", compute_type="int8",
                         cpu_threads=4 if args.cpu else 0)
    done = 0
    for vid in ids:
        dest = args.out / f"{vid}.json"
        if dest.exists():
            continue
        if not (AUDIO / f"{vid}.m4a").exists() or not (CY / f"{vid}.json").exists():
            print(f"{time.strftime('%H:%M:%S')} missing {vid}", flush=True)
            continue
        t = time.time()
        try:
            res = run(model, vid, args.until, args.since, args.detect_only)
            dest.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
            done += 1
            n_es = sum(1 for r in res["segments"] if "text" in r)
            print(f"{time.strftime('%H:%M:%S')} ok {vid} {len(res['segments'])} segments, {n_es} Spanish, "
                  f"in {time.time() - t:.0f}s ({done})", flush=True)
        except Exception as e:  # keep going; a bad file is retried on the next run
            print(f"{time.strftime('%H:%M:%S')} error {vid}: {e}", flush=True)
    print("finished", done, flush=True)


if __name__ == "__main__":
    main()
