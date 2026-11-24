"""The mixed Welsh/Spanish pass (design: docs/superpowers/specs/2026-11-24-gales-castellano-mezclados-design.md),
for a GPU runtime such as Google Colab. The notebook beside this file (pase_mezcla.ipynb) is built from it by
make_notebook.py; edit this file, then rebuild the notebook.

For each audio file in AUDIO (any format ffmpeg reads, named <video id>.<ext>) it writes three new files to OUT:
  <id>.words.json     Bangor's Welsh model with word times  {"segments": [{"s","e","text","lp","ns","cr","words": [[s,e,w,p]]}]}
  <id>.es-lines.json  turbo forced to Spanish on each Bangor line's own clip
                      {"lines": [{"s","e","cy","cy_p","cy_words","es","es_p","es_words"}]}
  <id>.es-words.json  turbo forced to Spanish over the whole audio, for speech Bangor didn't write
Same settings as the KPC pilot (scripts/kpc/pilot/). A video whose three files exist is skipped, and each file is
written under a temporary name and then renamed, so a runtime that disconnects loses only the video in progress.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SR = 16000
CY_MODEL = "techiaith/whisper-large-ft-cy-en-ct2"
ES_MODEL = "large-v3-turbo"
PAUSE, MAX_WORDS, PAD = 0.6, 14, 0.2
KINDS = ("words", "es-lines", "es-words")


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


def split_lines(words, pause=PAUSE, max_words=MAX_WORDS):
    """Bangor's words [[s, e, w, p], ...] of one segment -> lines: cut at a pause >= pause s, after max_words words,
    or after a word ending a sentence."""
    lines, cur = [], []
    for w in words:
        if cur and (w[0] - cur[-1][1] >= pause or len(cur) >= max_words):
            lines.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.?!]$", w[2]):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    return lines


def mean_p(words):
    return round(sum(w[3] for w in words) / len(words), 3) if words else 0.0


def _words(seg, offset=0.0):
    return [[round(offset + w.start, 2), round(offset + w.end, 2), w.word.strip(), round(w.probability, 3)]
            for w in (seg.words or [])]


def _run(model, audio, lang):
    segs, _ = model.transcribe(audio, language=lang, beam_size=5, vad_filter=False,
                               condition_on_previous_text=False, word_timestamps=True)
    return list(segs)


def load_audio(path, until=None):
    from faster_whisper import decode_audio
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        cmd = ["ffmpeg", "-v", "error", "-y"] + (["-t", str(until)] if until else []) + \
              ["-i", str(path), "-vn", "-ac", "1", "-ar", str(SR), str(wav)]
        subprocess.run(cmd, check=True)
        return decode_audio(str(wav), sampling_rate=SR)


def cy_words(model, audio):
    return [{"s": round(s.start, 2), "e": round(s.end, 2), "text": s.text.strip(), "lp": round(s.avg_logprob, 3),
             "ns": round(s.no_speech_prob, 3), "cr": round(s.compression_ratio, 2), "words": _words(s)}
            for s in _run(model, audio, "cy") if s.text.strip()]


def es_lines(model, audio, segments):
    rows = []
    for seg in segments:
        for ln in split_lines(seg["words"]):
            a, b = max(0.0, ln[0][0] - PAD), ln[-1][1] + PAD
            ws = [w for s in _run(model, audio[int(a * SR):int(b * SR)], "es") for w in _words(s, a)]
            rows.append({"s": ln[0][0], "e": ln[-1][1], "cy": " ".join(w[2] for w in ln), "cy_p": mean_p(ln),
                         "cy_words": ln, "es": " ".join(w[2] for w in ws), "es_p": mean_p(ws), "es_words": ws})
    return rows


def es_words(model, audio):
    return [{"s": round(s.start, 2), "e": round(s.end, 2), "text": s.text.strip(), "lp": round(s.avg_logprob, 3),
             "words": _words(s)} for s in _run(model, audio, "es") if s.text.strip()]


def write(path, doc):
    tmp = path.with_name(path.name + ".part")
    tmp.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def done(out, vid):
    return all((out / f"{vid}.{k}.json").exists() for k in KINDS)


def run(audio_dir, out, until=None, compute_type="int8", only=None):
    """Process every audio file in audio_dir (or only the ids in `only`) that isn't done yet."""
    from faster_whisper import WhisperModel
    audio_dir, out = Path(audio_dir), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    todo = sorted(p for p in audio_dir.iterdir() if p.is_file() and not p.name.endswith(".part")
                  and (only is None or p.stem in only) and not done(out, p.stem))
    log(f"{len(todo)} to do in {audio_dir}")
    if not todo:
        return
    cy = WhisperModel(CY_MODEL, device="cuda", compute_type=compute_type)
    es = WhisperModel(ES_MODEL, device="cuda", compute_type=compute_type)
    meta = {"until": until, "compute_type": compute_type}
    for p in todo:
        vid, t0 = p.stem, time.time()
        audio = load_audio(p, until)
        secs = len(audio) / SR
        f = out / f"{vid}.words.json"
        if f.exists():
            segments = json.loads(f.read_text(encoding="utf-8"))["segments"]
        else:
            segments = cy_words(cy, audio)
            write(f, {"id": vid, **meta, "model": CY_MODEL, "word_timestamps": True, "segments": segments})
        t1 = time.time()
        f = out / f"{vid}.es-lines.json"
        if not f.exists():
            write(f, {"id": vid, **meta, "model": ES_MODEL, "lines": es_lines(es, audio, segments)})
        t2 = time.time()
        f = out / f"{vid}.es-words.json"
        if not f.exists():
            write(f, {"id": vid, **meta, "model": ES_MODEL, "language": "es", "segments": es_words(es, audio)})
        t3 = time.time()
        log(f"{vid}: {secs:.0f} s of audio; Bangor {t1 - t0:.0f} s, turbo per line {t2 - t1:.0f} s, "
            f"turbo long-form {t3 - t2:.0f} s; {(t3 - t0) / secs:.2f} s per s of audio")


def side(r, clear=0.10):
    """Which model wins a line, as in the design's step 2: cy, es, or mixed (decided word by word)."""
    gap = r["cy_p"] - r["es_p"]
    return "cy" if gap >= clear or not r["es_words"] else "es" if gap <= -clear else "mixed"


def compare(out, ref, vid):
    """Compare this runtime's files for vid with another machine's (e.g. KPC's pilot); returns printable lines."""
    load = lambda d, k: json.loads((Path(d) / f"{vid}.{k}.json").read_text(encoding="utf-8"))
    rep = []
    a, b = load(out, "words")["segments"], load(ref, "words")["segments"]
    same = sum(x["text"] == y["text"] for x, y in zip(a, b))
    wa = [w for s in a for w in s["words"]]
    wb = [w for s in b for w in s["words"]]
    shift = sorted(abs(x[0] - y[0]) for x, y in zip(wa, wb) if x[2] == y[2])
    rep.append(f"Bangor segments: {len(a)} here, {len(b)} there; {same} with the same text")
    if shift:
        rep.append(f"Bangor words: {len(wa)} here, {len(wb)} there; same word at the same place: {len(shift)}, "
                   f"start time differs by median {shift[len(shift) // 2]:.2f} s, max {shift[-1]:.2f} s")
    la, lb = load(out, "es-lines")["lines"], load(ref, "es-lines")["lines"]
    pairs = [(x, y) for x, y in zip(la, lb) if (x["s"], x["e"], x["cy"]) == (y["s"], y["e"], y["cy"])]
    agree = sum(side(x) == side(y) for x, y in pairs)
    rep.append(f"lines: {len(la)} here, {len(lb)} there; {len(pairs)} identical Bangor lines; "
               f"same winner (cy / es / mixed) on {agree} of them; same turbo text on "
               f"{sum(x['es'] == y['es'] for x, y in pairs)}")
    for x, y in pairs:
        if side(x) != side(y):
            rep.append(f"  differs at {x['s']:.1f} s: here {side(x)} ({x['cy_p']} vs {x['es_p']}), "
                       f"there {side(y)} ({y['cy_p']} vs {y['es_p']})")
    ea, eb = load(out, "es-words")["segments"], load(ref, "es-words")["segments"]
    rep.append(f"turbo long-form: {len(ea)} segments here, {len(eb)} there; "
               f"{sum(x['text'] == y['text'] for x, y in zip(ea, eb))} with the same text")
    return rep


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else None)
