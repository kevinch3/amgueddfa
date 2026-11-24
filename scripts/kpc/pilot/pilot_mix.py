"""Pilot (2026-11-24): language and timing for mixed Welsh/Spanish speech, one video, new files only.

  venv/bin/python pilot_mix.py VIDEO_ID UNTIL_S      -> pilot-mix/<id>.words.json, pilot-mix/<id>.lang.json

1. Bangor's Welsh model again, same settings as run_cy.py plus word_timestamps=True:
   {"segments": [{"s","e","text","lp","ns","cr","words": [[s, e, word, p], ...]}]}
2. Whisper large-v3-turbo language detection on short slices of the audio (3 s and 5 s, hop 1 s):
   {"slices": {"3": [[s, es, cy, en], ...], "5": [...]}}
One job, run in sequence; reads audio/<id>.m4a; never writes outside pilot-mix/.
"""
import json, subprocess, sys, tempfile, time
from pathlib import Path
from faster_whisper import WhisperModel, decode_audio

W = Path(__file__).resolve().parent
OUT = W / "pilot-mix"; OUT.mkdir(exist_ok=True)
vid, until = sys.argv[1], float(sys.argv[2])
SR = 16000
log = lambda m: print(f"{time.strftime('%H:%M:%S')} {m}", flush=True)

with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / "c.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", str(until), "-i", str(W / "audio" / f"{vid}.m4a"),
                    "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    audio = decode_audio(str(wav), sampling_rate=SR)

    dest = OUT / f"{vid}.words.json"
    if not dest.exists():
        t = time.time()
        m = WhisperModel("techiaith/whisper-large-ft-cy-en-ct2", device="cuda", compute_type="int8")
        segs, _ = m.transcribe(audio, language="cy", beam_size=5, vad_filter=False,
                               condition_on_previous_text=False, word_timestamps=True)
        rows = [{"s": round(s.start, 2), "e": round(s.end, 2), "text": s.text.strip(), "lp": round(s.avg_logprob, 3),
                 "ns": round(s.no_speech_prob, 3), "cr": round(s.compression_ratio, 2),
                 "words": [[round(w.start, 2), round(w.end, 2), w.word.strip(), round(w.probability, 3)] for w in (s.words or [])]}
                for s in segs if s.text.strip()]
        dest.write_text(json.dumps({"id": vid, "until": until, "model": "techiaith/whisper-large-ft-cy-en-ct2",
                                    "word_timestamps": True, "segments": rows}, ensure_ascii=False), encoding="utf-8")
        log(f"words ok {vid}: {len(rows)} segments in {time.time() - t:.0f}s")
        del m

    dest = OUT / f"{vid}.lang.json"
    if not dest.exists():
        t = time.time()
        m = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8")
        out = {}
        for size in (3, 5):
            rows = []
            for s in range(0, int(until) - size + 1):
                _, _, probs = m.detect_language(audio=audio[s * SR:(s + size) * SR])
                d = dict(probs)
                rows.append([s, round(d.get("es", 0), 3), round(d.get("cy", 0), 3), round(d.get("en", 0), 3)])
            out[str(size)] = rows
            log(f"lang {size}s ok: {len(rows)} slices")
        dest.write_text(json.dumps({"id": vid, "until": until, "model": "large-v3-turbo", "hop": 1, "slices": out}),
                        encoding="utf-8")
        log(f"lang ok {vid} in {time.time() - t:.0f}s")
log("finished")
