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

from scripts.align_lyrics import LETRAS, apply as apply_lyrics, credit, spans_for

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
    if t.get("lang") != "es":  # nobody speaks English on stage: no English text, not even the author's
        return False
    if t["src"] == "subida":
        return True
    toks = [_fold(w) for _, line in t["seg"] for w in re.findall(r"[^\W\d_]+", re.sub(r"\[[^\]]*\]", "", line))]
    return len(toks) >= MIN_TEXT_WORDS and sum(w in words for w in toks) / len(toks) >= MIN_SPANISH_SHARE


# "Eisteddfod" as heard by YouTube and Whisper: Stedbot, Estéduo, Steadwood, Istedbot, "stad vot"…
# An invented word that sounds like it becomes Eisteddfod; a real Spanish word (estado, estero,
# estadio) only right before "del Chubut", never in "Santiago del Estero".
_SPLIT = re.compile(r"\b(?:[eiy]?s{1,2}t[ae]d|ist[ae]d)\s+[bv]o[tdl]?\b", re.I)
_CHUBUT = re.compile(r"\b(estados?|estero|estadio|estudo)(?=\s+del\s+ch[iu]but)", re.I)


# Real words that sound like it (missing from the base-form dictionary).
_NOT_IT = {"estetico", "estetica", "esteticas", "esternon", "estertor", "estertores", "estados", "estefan", "esteban",
           "estaba", "estaban", "estabas", "estabamos", "estara", "estaran", "estaras", "estare", "estaremos", "estio",
           "estadia", "estero", "estado", "estadio", "estudio", "estudios"}
# 1. The "-dfod" tail: st + vowel + d/t + b v w f g p (Stedbot, Steadwood, statbot, Istedvo, Steedgod).
_TAIL = re.compile(r"^(?:l|e|i|y|ei|is|es)?s{1,2}t[eai]+[dt]+[bvwfgp]")
# 2. Context: an "est…" word where "Eisteddfod" belongs (Estéduo, Estedo, esteo, Estadua, Estejo).
_EST = r"(?:[eiy]|ei|is|es|l)?s{1,2}t[eéaáií][^\W\d_]{0,9}"
_AFTER = re.compile(r"(?i)\b((?:comisi[oó]n|corona|presidente|asociaci[oó]n|premio|sesi[oó]n|edici[oó]n|organizadora|plata|sill[oó]n)\s+(?:del?|de\s+la)\s+)(" + _EST + r")\b")
_BEFORE = re.compile(r"(?i)(?<!santiago del )\b(" + _EST + r")(?=\s+(?:del\s+ch[iu]but|de\s+la\s+juventud|mimosa|trevelin)\b)")
_SPLIT = re.compile(r"\b(?:[eiy]?s{1,2}t[ae]d|ist[ae]d)\s+[bv]o[tdl]?\b", re.I)
_WORD = re.compile(r"\b[^\W\d_]{4,}\b(?!@)")
_ENDINGS = [("s", ""), ("es", ""), ("os", "o"), ("as", "a"), ("ido", "er"), ("ido", "ir"), ("ado", "ar"), ("ando", "ar")]


def _real_word(f: str, words: set[str]) -> bool:
    return f in words or f in _NOT_IT or any(f.endswith(e) and f[: -len(e)] + r in words for e, r in _ENDINGS)


def fix_eisteddfod(text: str, words: set[str]) -> str:
    """"Eisteddfod" as heard by YouTube and Whisper (Stedbot, Estéduo, Steadwood, "stad vot"…), written right."""
    text = _SPLIT.sub("Eisteddfod", text)
    text = _AFTER.sub(lambda m: m.group(1) + (m.group(2) if _real_word(_fold(m.group(2)), words) else "Eisteddfod"), text)
    misheard = {"estado", "estados", "estero", "estadio", "estudo"}
    text = _BEFORE.sub(lambda m: "Eisteddfod" if _fold(m.group(1)) in misheard or not _real_word(_fold(m.group(1)), words) else m.group(1), text)
    return _WORD.sub(lambda m: "Eisteddfod" if _fold(m.group(0)) != "eisteddfod" and _TAIL.match(_fold(m.group(0))) and not _real_word(_fold(m.group(0)), words) else m.group(0), text)


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


RECON = REPO / "data" / "reconstruccion"


# Joining caption fragments into sentences (issue #97). YouTube's captions come in 2-5 s chunks with no
# punctuation ("de" / "tomando" / "quien"), and the reconstruction keeps their timing.
SENTENCE_END = re.compile(r"[.?!…»\"]\s*$")
MARKER = re.compile(r"^\s*[\[(][^\])]*[\])]\s*$")  # [música], (aplausos): always a line of their own
TRAILING_MARKERS = re.compile(r"(\s*[\[(][^\])]*[\])])+\s*$")  # "menos. [canto]": the sentence ends before the tag
# Whisper (Spanish and the Welsh model) starts each sentence or verse with a capital, often with no full stop
# before it: a capitalised Whisper fragment begins a new line.
WHISPER_SOURCES = ("whisper_es", "cy")
CAPITAL_START = re.compile(r"^[¿¡«\"'(]*[A-ZÁÉÍÓÚÑÜŴŶÂÊÎÔÛ]")
JOIN_GAP = 6.0     # s from one fragment's start to the next: 85% of continuations, measured on the published text
JOIN_WORDS = 20    # a joined line stays a readable subtitle
JOIN_SPAN = 15.0   # s from the line's first fragment to its last


def join_fragments(t: dict, spans: list[tuple[float, float]] | tuple = ()) -> dict:
    """A reconstruction with consecutive fragments of one sentence joined into one line (first time, the
    union of their sources). Lines are never joined across a sentence end (a full stop, or a capital that
    starts a Whisper fragment), a pause over JOIN_GAP, the same second (two subtitle lines), a change of
    language (a Welsh-model line vs a Spanish one), a lyric (the transcript's spans and `spans`, those
    declared in data/letras/videos.json: one verse per line) or a tag."""
    fu = t.get("fuentes")
    if not fu or len(fu) != len(t["seg"]):
        return t
    spans = [(l["desde"], l["hasta"]) for l in t.get("letras", [])] + list(spans)
    lyric = lambda time, f: "letra" in f or any(a <= time < b for a, b in spans)
    lang = lambda f: "cy" if "cy" in f else "es"
    seg, fuentes = [], []
    for (time, text), f in zip(t["seg"], fu):
        if seg:
            t0, prev = seg[-1]
            pf = fuentes[-1]
            whisper_start = any(x in f for x in WHISPER_SOURCES) and CAPITAL_START.match(text)
            if (not SENTENCE_END.search(TRAILING_MARKERS.sub("", prev)) and not MARKER.match(prev) and not MARKER.match(text)
                    and not whisper_start and time != prev_time
                    and time - prev_time <= JOIN_GAP and time - t0 <= JOIN_SPAN
                    and len(prev.split()) + len(text.split()) <= JOIN_WORDS
                    and lang(pf) == lang(f) and not lyric(t0, pf) and not lyric(time, f)):
                seg[-1] = [t0, f"{prev} {text}"]
                fuentes[-1] = pf + [x for x in f if x not in pf]
                prev_time = time
                continue
        seg.append([time, text])
        fuentes.append(list(f))
        prev_time = time
    return {**t, "seg": seg, "fuentes": fuentes}


def main_language(t: dict) -> str:
    """The language most of a reconstruction's text is in, by length: a line the Welsh model heard is
    Welsh, any other Spanish. Counting source lines instead lets YouTube's many short "Spanish"
    mishearings of Welsh outvote it (Chubut 2008 3u6cv4eV1IA was labelled castellano)."""
    fu = t.get("fuentes")
    if not fu or len(fu) != len(t["seg"]):
        return t.get("lang", "es")
    size = {"cy": 0, "es": 0}
    for (_, text), f in zip(t["seg"], fu):
        if "letra" not in f:
            size["cy" if "cy" in f else "es"] += len(text)
    return max(size, key=size.get) if any(size.values()) else t.get("lang", "es")


def export(backup: Path, videos: list[dict], out: Path = OUT, words: set[str] | None = None, recon: Path = RECON, letras: Path = LETRAS) -> dict:
    wanted = {v["id"] for v in videos if v["festival"] in FESTIVALS}
    with (backup / "INDEX.tsv").open(newline="", encoding="utf-8") as f:
        files = {r["id"]: r["file"] for r in csv.DictReader(f, delimiter="\t") if r.get("file")}
    out.mkdir(parents=True, exist_ok=True)
    written = set()
    counts = {"subida": 0, "youtube": 0, "whisper": 0}
    for vid in sorted(wanted):
        if vid not in files:
            continue
        rec = recon / f"{vid}.json"
        if rec.exists():
            # The reconstruction (scripts/reconstruct_videos.py) already chose and checked every line.
            t = {k: v for k, v in json.loads(rec.read_text(encoding="utf-8")).items() if k not in ("ventanas", "modelo")}
            if t.get("letras"):
                t["letras"] = credit(t["letras"], spans_for(vid, letras), letras)
            t["lang"] = main_language(t)
            t = join_fragments(t, [(sp["desde"], sp["hasta"]) for sp in spans_for(vid, letras)])
            body = json.dumps(t, ensure_ascii=False, separators=(",", ":"))
            p = out / f"{vid}.json"
            if not p.exists() or p.read_text(encoding="utf-8") != body:
                p.write_text(body, encoding="utf-8")
            written.add(vid)
            counts["reconstruida"] = counts.get("reconstruida", 0) + 1
            continue
        t = pick((backup / "videos" / files[vid]).with_suffix(""))
        if not t or not t["seg"] or (words is not None and not useful(t, words)):
            continue
        if words is not None:
            t["seg"] = [[s, fix_eisteddfod(x, words)] for s, x in t["seg"]]
        # Known lyrics of the pieces sung, in place of the automatic guesses (data/letras/).
        t = apply_lyrics(t, spans_for(vid, letras), letras)
        body = json.dumps(t, ensure_ascii=False, separators=(",", ":"))
        p = out / f"{vid}.json"
        if not p.exists() or p.read_text(encoding="utf-8") != body:
            p.write_text(body, encoding="utf-8")
        written.add(vid)
        counts[t["src"]] = counts.get(t["src"], 0) + 1
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
