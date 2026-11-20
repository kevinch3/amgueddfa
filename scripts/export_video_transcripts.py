"""Video transcriptions for the site's player, from the private video backup.

  python3 -m scripts.export_video_transcripts [BACKUP_ROOT]

Reads the backup (docs/backup.md: INDEX.tsv and, next to each video, YouTube's
.vtt files, .info.json and Whisper's .whisper.json) and writes one small file
per video of the site's list to public/transcripciones-video/<id>.json:

    {"src": "subida" | "youtube" | "whisper", "lang": "cy", "seg": [[12.3, "line"], ...]}

Which one: subtitles someone uploaded, else YouTube's automatic transcription in
the detected language (<lang>-orig), else Whisper's (Spanish only, filtered:
clean_whisper). Only Chubut and Trevelin:
Juventud and Mimosa sessions name children aloud (issue #29), their videos still
play without a transcription. Files of videos that no longer qualify are removed.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "public" / "transcripciones-video"
DEFAULT_BACKUP = Path("/run/media/kevinch3/4eff8b2b-61f1-4df2-bb61-5f9ba0faa94d/amgueddfa-backup")
FESTIVALS = {"chubut", "trevelin"}

# Whisper over music without words: a whole 30 s window with a word or two, stock phrases
# from its training subtitles, loops. Real speech comes in lines of a few seconds.
STOCK = re.compile(r"gracias por ver|suscr[ií]b|subt[ií]tulo|amara\.org|diolch am wylio|thanks for watching|^cymru[.!]?$", re.I)
LOOP = re.compile(r"\b(\w+)\b(?:\W+\1\b){2,}", re.I | re.U)
MIN_LINES, MIN_WORDS = 6, 40
# Whisper's Welsh (mostly singing) is often phonetic nonsense that no score here tells apart from
# the good ones: held in the backup until someone checks it (user decision 2026-11-19).
WHISPER_LANGS = {"es"}

# Quality gate (2026-11-20, after a Welsh Gorsedd video showed YouTube's "English" nonsense):
# automatic text is published only in Spanish, with at least 55% real Spanish words and 40 words.
SPANISH_DICT = Path("/usr/share/dict/spanish")
MIN_SPANISH_SHARE, MIN_TEXT_WORDS = 0.55, 40


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def spanish_words() -> set[str]:
    if not SPANISH_DICT.exists():
        sys.exit(f"{SPANISH_DICT} missing (install the wspanish word list)")
    return {_fold(w.strip()) for w in SPANISH_DICT.read_text(encoding="latin-1").splitlines() if w.strip()}


def useful(t: dict, words: set[str]) -> bool:
    """Whether a transcription is worth showing: the author's subtitles always; machine text
    (YouTube automatic, Whisper) only when it is Spanish and reads as Spanish."""
    if t["src"] == "subida":
        return True
    if t.get("lang") != "es":
        return False
    toks = [_fold(w) for _, line in t["seg"] for w in re.findall(r"[^\W\d_]+", re.sub(r"\[[^\]]*\]", "", line))]
    return len(toks) >= MIN_TEXT_WORDS and sum(w in words for w in toks) / len(toks) >= MIN_SPANISH_SHARE


TS = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s+-->")
TAG = re.compile(r"<[^>]+>")


def seconds(h: str | None, m: str, s: str, ms: str) -> float:
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_vtt(text: str) -> list[list]:
    """Cues as [[start, line], ...]: tags stripped, each line once.

    YouTube's automatic captions repeat the previous line in every cue (rolling
    two-line display) and carry per-word timing tags; a line is kept the first
    time it appears, with the start of the cue it first appears in.
    """
    out: list[list] = []
    recent: list[str] = []
    start = None
    for raw in text.replace("\r", "").split("\n"):
        if "-->" in raw:
            m = TS.search(raw)
            start = round(seconds(*m.groups()), 1) if m else None
            continue
        if start is None:
            continue  # header (WEBVTT, Kind, Language) or a cue id
        line = re.sub(r"\s+", " ", TAG.sub("", raw)).strip()
        if not line or line in recent:
            continue
        out.append([start, line])
        recent = (recent + [line])[-2:]  # the rolling display repeats the last two lines
    return out


def pick(stem: Path) -> dict | None:
    """The transcription to publish for one backed-up video (its path without suffix)."""
    folder, name = stem.parent, stem.name
    vtts = {p.name[len(name) + 1:-4]: p for p in folder.glob(f"{glob_escape(name)}.*.vtt")}
    try:
        info = json.loads((folder / f"{name}.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    uploaded = [k for k in (info.get("subtitles") or {}) if k != "live_chat" and k in vtts]
    if uploaded:
        lang = sorted(uploaded, key=lambda k: (not k.startswith(("es", "cy")), k))[0]
        return {"src": "subida", "lang": lang.split("-")[0], "seg": parse_vtt(vtts[lang].read_text(encoding="utf-8"))}
    orig = [k for k in vtts if k.endswith("-orig")]
    if orig:
        k = sorted(orig)[0]
        return {"src": "youtube", "lang": k[:-5], "seg": parse_vtt(vtts[k].read_text(encoding="utf-8"))}
    w = folder / f"{name}.whisper.json"
    if w.exists():
        d = json.loads(w.read_text(encoding="utf-8"))
        if d.get("language") not in WHISPER_LANGS:
            return None
        seg = clean_whisper(d.get("segments", []))
        return {"src": "whisper", "lang": d.get("language", ""), "seg": seg} if seg else None
    return None


def clean_whisper(segments: list) -> list:
    """Whisper's [start, end, text] segments worth publishing, as [start, text]; [] when too little is left."""
    out = []
    for start, end, text in segments:
        text = text.strip()
        words = len(text.split())
        if not words or STOCK.search(text) or LOOP.search(text):
            continue
        if end - start >= 25 and words / (end - start) < 0.5:
            continue
        out.append([round(float(start), 1), text])
    if len(out) < MIN_LINES or sum(len(t.split()) for _, t in out) < MIN_WORDS:
        return []
    return out


def glob_escape(name: str) -> str:
    return re.sub(r"([\[\]*?])", r"[\1]", name)


def export(backup: Path, videos: list[dict], out: Path = OUT, words: set[str] | None = None) -> dict:
    wanted = {v["id"] for v in videos if v["festival"] in FESTIVALS}
    with (backup / "INDEX.tsv").open(newline="", encoding="utf-8") as f:
        files = {r["id"]: r["file"] for r in csv.DictReader(f, delimiter="\t") if r.get("file")}
    out.mkdir(parents=True, exist_ok=True)
    written = set()
    counts = {"subida": 0, "youtube": 0, "whisper": 0}
    for vid in sorted(wanted):
        if vid not in files:
            continue
        t = pick((backup / "videos" / files[vid]).with_suffix(""))
        if not t or not t["seg"] or (words is not None and not useful(t, words)):
            continue
        body = json.dumps(t, ensure_ascii=False, separators=(",", ":"))
        p = out / f"{vid}.json"
        if not p.exists() or p.read_text(encoding="utf-8") != body:
            p.write_text(body, encoding="utf-8")
        written.add(vid)
        counts[t["src"]] += 1
    removed = 0
    for p in out.glob("*.json"):
        if p.stem not in written:
            p.unlink()
            removed += 1
    return {"written": len(written), "removed": removed, **counts}


if __name__ == "__main__":
    backup = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BACKUP
    if not (backup / "INDEX.tsv").exists():
        sys.exit(f"{backup}: no INDEX.tsv (backup disk not mounted?)")
    videos = json.loads((REPO / "src" / "data" / "videos.json").read_text(encoding="utf-8"))["videos"]
    print(export(backup, videos, words=spanish_words()))
