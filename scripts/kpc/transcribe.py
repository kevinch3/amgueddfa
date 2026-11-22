"""Whisper transcriptions for archive videos that have none on YouTube.

  run.sh  (sets LD_LIBRARY_PATH for the pip CUDA libs, nice, nohup)

audio/<id>.m4a -> out/<id>.vtt + out/<id>.json (language, probability, segments).
Skips ids already done; language limited to es / cy / en (Welsh singing is
otherwise taken for English or other languages).
"""
import json, sys, time
from pathlib import Path
from faster_whisper import WhisperModel

W = Path(__file__).resolve().parent
AUDIO, OUT = W / "audio", W / "out"
OUT.mkdir(exist_ok=True)
LANGS = ("es", "cy")
# Whisper fills music and silence with stock lines; a file with nothing else gets no .vtt.
JUNK = {"", ".", "you", "thank you.", "thank you", "music", "gracias.", "gracias", "¡gracias!",
        "subtítulos realizados por la comunidad de amara.org", "transcribed by eso, translated by —",
        "subtitulado por la comunidad de amara.org", "i", "oh", "the"}

def ts(s):
    h, rem = divmod(s, 3600); m, sec = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{sec:06.3f}"

def main():
    model = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8")
    files = sorted(AUDIO.glob("*.m4a"), key=lambda p: p.stat().st_size)
    done = 0
    for p in files:
        vid = p.stem
        if (OUT / f"{vid}.json").exists():
            continue
        t = time.time()
        try:
            kw = dict(vad_filter=False, condition_on_previous_text=False, beam_size=5)
            segs, info = model.transcribe(str(p), **kw)
            # The archive is Spanish or Welsh: Spanish only when Whisper is sure of it;
            # anything else (Welsh singing is usually taken for English) is read as Welsh.
            lang = "es" if (info.language == "es" and info.language_probability >= 0.5) else "cy"
            if lang != info.language:
                segs, info2 = model.transcribe(str(p), language=lang, **kw)
            segs = [s for s in segs if s.text.strip().lower() not in JUNK]
            if sum(len(s.text.split()) for s in segs) < 4:
                segs = []
            vtt = ["WEBVTT", "", f"NOTE Whisper large-v3-turbo, language {lang} (detected {info.language}, p={info.language_probability:.2f}); generated, not checked", ""]
            for s in segs:
                vtt += [f"{ts(s.start)} --> {ts(s.end)}", s.text.strip(), ""]
            if segs:
                (OUT / f"{vid}.vtt").write_text("\n".join(vtt), encoding="utf-8")
            (OUT / f"{vid}.json").write_text(json.dumps({
                "id": vid, "language": lang, "detected": info.language,
                "probability": round(info.language_probability, 3), "duration": round(info.duration, 1),
                "segments": [[round(s.start, 2), round(s.end, 2), s.text.strip()] for s in segs],
            }, ensure_ascii=False), encoding="utf-8")
            done += 1
            print(f"{time.strftime('%H:%M:%S')} ok {vid} {lang} {info.duration:.0f}s in {time.time()-t:.1f}s ({done})", flush=True)
        except Exception as e:  # keep going; a bad file is retried on the next run
            print(f"{time.strftime('%H:%M:%S')} error {vid}: {e}", flush=True)
    print("finished", done, flush=True)

if __name__ == "__main__":
    main()
