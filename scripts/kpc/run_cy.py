"""Welsh transcription of the archive's Chubut and Trevelin videos with Bangor University's
techiaith model (whisper-large-ft-cy-en, CTranslate2 int8), chosen 2026-11-20 after the A/B review.

  run_cy.sh  (sets LD_LIBRARY_PATH for the pip CUDA libs, nice, nohup)
  venv/bin/python run_cy.py ids.txt      # one video id per line (or comma-separated)

audio/<id>.m4a -> out-cy/<id>.json:
  {"id", "model", "duration", "segments": [{"s", "e", "text", "lp", "ns", "cr"}]}
Every file is cut into one-hour 16 kHz mono WAV chunks (long sessions ran out of GPU
memory in one piece) and timestamps are shifted. Skips ids already done; generated, not checked.
"""
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from faster_whisper import WhisperModel

W = Path(__file__).resolve().parent
AUDIO, OUT = W / "audio", W / "out-cy"
MODEL = "techiaith/whisper-large-ft-cy-en-ct2"
CHUNK = 3600


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def main():
    raw = Path(sys.argv[1]).read_text().replace(",", "\n").split()
    OUT.mkdir(exist_ok=True)
    model = WhisperModel(MODEL, device="cuda", compute_type="int8")
    done = 0
    for vid in raw:
        src, dest = AUDIO / f"{vid}.m4a", OUT / f"{vid}.json"
        if dest.exists() or not src.exists():
            continue
        t = time.time()
        try:
            dur = duration(src)
            rows = []
            with tempfile.TemporaryDirectory() as tmp:
                wav = Path(tmp) / "c.wav"
                for start in range(0, max(int(dur), 1), CHUNK):
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(CHUNK), "-i", str(src),
                                    "-ac", "1", "-ar", "16000", str(wav)], check=True)
                    segs, _ = model.transcribe(str(wav), language="cy", beam_size=5, vad_filter=False,
                                               condition_on_previous_text=False)
                    rows += [{"s": round(s.start + start, 2), "e": round(s.end + start, 2), "text": s.text.strip(),
                              "lp": round(s.avg_logprob, 3), "ns": round(s.no_speech_prob, 3), "cr": round(s.compression_ratio, 2)}
                             for s in segs if s.text.strip()]
            dest.write_text(json.dumps({"id": vid, "model": MODEL, "duration": round(dur, 1), "segments": rows},
                                       ensure_ascii=False), encoding="utf-8")
            done += 1
            print(f"{time.strftime('%H:%M:%S')} ok {vid} {dur:.0f}s in {time.time() - t:.0f}s ({done})", flush=True)
        except Exception as e:  # keep going; a bad file is retried on the next run
            print(f"{time.strftime('%H:%M:%S')} error {vid}: {e}", flush=True)
    print("finished", done, flush=True)


if __name__ == "__main__":
    main()
