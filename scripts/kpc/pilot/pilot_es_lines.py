"""Pilot (2026-11-24): turbo in Spanish on each Bangor line's own audio (the line = Bangor's words split at a pause
>= 0.6 s, a sentence end or 14 words), with word probabilities.
  venv/bin/python pilot_es_lines.py VIDEO -> pilot-mix/<id>.es-lines.json (new file; reads pilot-mix/<id>.words.json)"""
import json, re, subprocess, sys, tempfile, time
from pathlib import Path
from faster_whisper import WhisperModel, decode_audio
W = Path(__file__).resolve().parent
vid = sys.argv[1]
src = json.loads((W / "pilot-mix" / f"{vid}.words.json").read_text())
lines = []
for seg in src["segments"]:
    cur = []
    for s, e, w, p in seg["words"]:
        if cur and (s - cur[-1][1] >= 0.6 or len(cur) >= 14): lines.append(cur); cur = []
        cur.append((s, e, w, p))
        if re.search(r"[.?!]$", w): lines.append(cur); cur = []
    if cur: lines.append(cur)
with tempfile.TemporaryDirectory() as t:
    wav = Path(t) / "c.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", str(src["until"]), "-i", str(W / "audio" / f"{vid}.m4a"), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    audio = decode_audio(str(wav), sampling_rate=16000)
t0 = time.time()
m = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8")
rows = []
for ln in lines:
    a, b = max(0, ln[0][0] - 0.2), ln[-1][1] + 0.2
    segs, _ = m.transcribe(audio[int(a * 16000):int(b * 16000)], language="es", beam_size=5, vad_filter=False,
                           condition_on_previous_text=False, word_timestamps=True)
    ws = [[round(a + w.start, 2), round(a + w.end, 2), w.word.strip(), round(w.probability, 3)] for s in segs for w in (s.words or [])]
    rows.append({"s": ln[0][0], "e": ln[-1][1], "cy": " ".join(w[2] for w in ln), "cy_p": round(sum(w[3] for w in ln) / len(ln), 3),
                 "es": " ".join(w[2] for w in ws), "es_p": round(sum(w[3] for w in ws) / len(ws), 3) if ws else 0.0, "es_words": ws})
(W / "pilot-mix" / f"{vid}.es-lines.json").write_text(json.dumps({"id": vid, "model": "large-v3-turbo", "lines": rows}, ensure_ascii=False), encoding="utf-8")
print(f"{time.strftime('%H:%M:%S')} es-lines ok {vid}: {len(rows)} lines in {time.time() - t0:.0f}s", flush=True)
