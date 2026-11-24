"""Which words are in which seconds: short clips of one video, transcribed separately by Bangor (cy) and turbo (es).
  venv/bin/python clips.py VIDEO A-B [A-B ...]   (prints only; writes nothing)"""
import subprocess, sys, tempfile
from pathlib import Path
from faster_whisper import WhisperModel, decode_audio
W = Path(__file__).resolve().parent
vid, spans = sys.argv[1], [tuple(map(float, a.split("-"))) for a in sys.argv[2:]]
clips = []
with tempfile.TemporaryDirectory() as t:
    for a, b in spans:
        wav = Path(t) / f"{a}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(b - a), "-i", str(W / "audio" / f"{vid}.m4a"), "-ac", "1", "-ar", "16000", str(wav)], check=True)
        clips.append(((a, b), decode_audio(str(wav), sampling_rate=16000)))
for name, lang in (("techiaith/whisper-large-ft-cy-en-ct2", "cy"), ("large-v3-turbo", "es")):
    m = WhisperModel(name, device="cuda", compute_type="int8")
    for (a, b), au in clips:
        segs, _ = m.transcribe(au, language=lang, beam_size=5, vad_filter=False, condition_on_previous_text=False, word_timestamps=True)
        print(f"{lang} {a:.0f}-{b:.0f}: " + " | ".join(f"{a + s.start:.1f}-{a + s.end:.1f} {s.text.strip()}" for s in segs), flush=True)
    del m
