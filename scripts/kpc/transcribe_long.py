"""Whisper for the files transcribe.py could not hold in memory (multi-hour sessions).

  LD_LIBRARY_PATH=... venv/bin/python transcribe_long.py

Same output as transcribe.py (out/<id>.vtt + out/<id>.json) for audio without a
.json yet, but each file is cut into one-hour 16 kHz mono WAV chunks with ffmpeg
and transcribed chunk by chunk, timestamps shifted. The language is chosen once,
on the first chunk, with transcribe.py's rule (Spanish only when Whisper is sure).
"""
import json, subprocess, tempfile, time
from pathlib import Path
from faster_whisper import WhisperModel

from transcribe import AUDIO, OUT, JUNK, ts

CHUNK = 3600


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def chunk(p: Path, start: int, dest: Path) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(CHUNK), "-i", str(p),
                    "-ac", "1", "-ar", "16000", str(dest)], check=True)


def main():
    model = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8")
    kw = dict(vad_filter=False, condition_on_previous_text=False, beam_size=5)
    files = sorted((p for p in AUDIO.glob("*.m4a") if not (OUT / f"{p.stem}.json").exists()),
                   key=lambda p: p.stat().st_size)
    done = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "c.wav"
        for p in files:
            vid, t = p.stem, time.time()
            try:
                dur = duration(p)
                lang, detected, prob, segs = None, "", 0.0, []
                for start in range(0, max(int(dur), 1), CHUNK):
                    chunk(p, start, wav)
                    if lang is None:
                        _, info = model.transcribe(str(wav), **kw)
                        detected, prob = info.language, info.language_probability
                        lang = "es" if (detected == "es" and prob >= 0.5) else "cy"
                    part, _ = model.transcribe(str(wav), language=lang, **kw)
                    segs += [(s.start + start, s.end + start, s.text.strip()) for s in part
                             if s.text.strip().lower() not in JUNK]
                if sum(len(x[2].split()) for x in segs) < 4:
                    segs = []
                vtt = ["WEBVTT", "", f"NOTE Whisper large-v3-turbo, language {lang} (detected {detected}, p={prob:.2f}); generated, not checked; transcribed in {CHUNK // 60}-minute chunks", ""]
                for a, b, txt in segs:
                    vtt += [f"{ts(a)} --> {ts(b)}", txt, ""]
                if segs:
                    (OUT / f"{vid}.vtt").write_text("\n".join(vtt), encoding="utf-8")
                (OUT / f"{vid}.json").write_text(json.dumps({
                    "id": vid, "language": lang, "detected": detected, "probability": round(prob, 3),
                    "duration": round(dur, 1), "segments": [[round(a, 2), round(b, 2), txt] for a, b, txt in segs],
                }, ensure_ascii=False), encoding="utf-8")
                done += 1
                print(f"{time.strftime('%H:%M:%S')} ok {vid} {lang} {dur:.0f}s in {time.time()-t:.1f}s (long {done})", flush=True)
            except Exception as e:
                print(f"{time.strftime('%H:%M:%S')} error {vid}: {e}", flush=True)
    print("finished", done, flush=True)


if __name__ == "__main__":
    main()
