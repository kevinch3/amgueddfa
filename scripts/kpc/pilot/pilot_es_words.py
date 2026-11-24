"""Pilot (2026-11-24): turbo forced to Spanish with word timings and probabilities, first UNTIL s of one video.
  venv/bin/python pilot_es_words.py VIDEO UNTIL -> pilot-mix/<id>.es-words.json (new file; nothing else written)"""
import json, subprocess, sys, tempfile, time
from pathlib import Path
from faster_whisper import WhisperModel, decode_audio
W = Path(__file__).resolve().parent
vid, until = sys.argv[1], float(sys.argv[2])
dest = W / "pilot-mix" / f"{vid}.es-words.json"
with tempfile.TemporaryDirectory() as t:
    wav = Path(t) / "c.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", str(until), "-i", str(W / "audio" / f"{vid}.m4a"), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    audio = decode_audio(str(wav), sampling_rate=16000)
t0 = time.time()
m = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8")
segs, _ = m.transcribe(audio, language="es", beam_size=5, vad_filter=False, condition_on_previous_text=False, word_timestamps=True)
rows = [{"s": round(s.start, 2), "e": round(s.end, 2), "text": s.text.strip(), "lp": round(s.avg_logprob, 3),
         "words": [[round(w.start, 2), round(w.end, 2), w.word.strip(), round(w.probability, 3)] for w in (s.words or [])]}
        for s in segs if s.text.strip()]
dest.write_text(json.dumps({"id": vid, "until": until, "model": "large-v3-turbo", "language": "es", "segments": rows}, ensure_ascii=False), encoding="utf-8")
print(f"{time.strftime('%H:%M:%S')} es-words ok {vid}: {len(rows)} segments in {time.time() - t0:.0f}s", flush=True)
