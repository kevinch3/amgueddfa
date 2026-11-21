"""Known lyrics in place of YouTube's guesses while a piece is sung.

A choir's words come out of automatic captions as near-nonsense ("tan foras, tan
bellas"), but the programa says which piece is sung. Given the text
(data/letras/<slug>.md) and the span of the video where it is sung
(data/letras/videos.json), the lyric lines replace the automatic ones in that
span, each at the time of the automatic line its words were matched to; lines
nobody matched are spread between their neighbours by syllables. Times are
approximate and the player says so.

Choirs repeat stanzas: a stanza is taken as sung again (up to 3 times) only
when the extra pass anchors at least half its lines to heard words.

Used by export_video_transcripts (a re-export keeps the result). Lyrics are
supplied by the maintainer, who confirms their rights.
"""
from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LETRAS = REPO / "data" / "letras"

MATCH = 0.6     # word similarity that counts as the same word heard
GAP = -0.2      # a heard word left unmatched
SKIP = -0.05    # a lyric word nobody heard (singing is often missed whole)
MISS = -0.5     # a mismatched pair
MAX_REPEAT = 3  # times a stanza may be sung


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z]+", _fold(re.sub(r"\[[^\]]*\]", " ", s)))


def _syllables(line: str) -> int:
    return max(1, len(re.findall(r"[aeiouy]+", _fold(line))))


def parse_letra(text: str) -> tuple[dict, list[list[str]]]:
    """Front matter (key: value lines) and the stanzas (blank-line separated) of a lyric file."""
    meta: dict = {}
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        text = text[m.end():]
    stanzas = [[l.strip() for l in block.splitlines() if l.strip()] for block in re.split(r"\n\s*\n", text.strip())]
    return meta, [s for s in stanzas if s]


def _dp(lyric: list[tuple[str, int]], heard: list[tuple[str, float]]) -> tuple[float, dict[int, float]]:
    """Global alignment of lyric words to heard words; score and, per lyric line, the earliest matched time."""
    n, m = len(lyric), len(heard)
    sim = [[SequenceMatcher(None, a, b).ratio() for b, _ in heard] for a, _ in lyric]
    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    P = [[""] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0], P[i][0] = D[i - 1][0] + SKIP, "u"
    for j in range(1, m + 1):
        D[0][j], P[0][j] = D[0][j - 1] + GAP, "l"
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sim[i - 1][j - 1]
            D[i][j], P[i][j] = max((D[i - 1][j - 1] + (s if s >= MATCH else MISS), "d"),
                                   (D[i - 1][j] + SKIP, "u"), (D[i][j - 1] + GAP, "l"))
    i, j, first = n, m, {}
    while i and j:
        if P[i][j] == "d":
            if sim[i - 1][j - 1] >= MATCH:
                line = lyric[i - 1][1]
                first[line] = min(first.get(line, heard[j - 1][1]), heard[j - 1][1])
            i, j = i - 1, j - 1
        elif P[i][j] == "u":
            i -= 1
        else:
            j -= 1
    return D[n][m], first


def _kept(anchors: dict[int, float]) -> dict[int, float]:
    """Anchors whose times increase with the line order (a later line heard earlier is dropped)."""
    keep, last = {}, float("-inf")
    for k in sorted(anchors):
        if anchors[k] > last:
            keep[k], last = anchors[k], anchors[k]
    return keep


def _times(lines: list[str], anchors: dict[int, float], start: float, end: float) -> list[float]:
    """Anchored lines keep their time (kept increasing); the rest are spread by syllables between neighbours."""
    keep = {k: v for k, v in _kept(anchors).items() if v >= start}
    last = max(keep.values(), default=start)
    pts = [(-1, start)] + sorted(keep.items()) + [(len(lines), max(end, last + 1))]
    out = [0.0] * len(lines)
    for (ia, ta), (ib, tb) in zip(pts, pts[1:]):
        if ia >= 0:
            out[ia] = ta
        span = ([ia] if ia >= 0 else []) + list(range(ia + 1, ib))
        total = sum(_syllables(lines[k]) for k in span) or 1
        acc = _syllables(lines[ia]) if ia >= 0 else 0
        for k in range(ia + 1, ib):
            out[k] = round(ta + (tb - ta) * acc / total, 1)
            acc += _syllables(lines[k])
    return out


def align(seg: list, stanzas: list[list[str]], desde: float, hasta: float) -> list[list]:
    """Lyric lines as [[time, line], ...] for the part of `seg` in [desde, hasta)."""
    inside = [(t, x) for t, x in seg if desde <= t < hasta]
    heard = [(w, float(t)) for t, x in inside for w in _words(x)]
    sung = [float(t) for t, x in inside if _words(x)]
    start = sung[0] if sung else float(desde)
    end = min(float(hasta), sung[-1] + 4) if sung else float(hasta)
    if not stanzas:
        return []

    def run(counts):
        lines = [line for st, k in zip(stanzas, counts) for line in st * k]
        score, anchors = _dp([(w, k) for k, l in enumerate(lines) for w in _words(l)], heard)
        return score, len(_kept(anchors)), lines, anchors

    # Each stanza once, then add a repeat only where the choir was heard singing it again:
    # the extra pass must anchor at least half its lines and raise the score.
    counts = [1] * len(stanzas)
    cur = run(counts)
    while True:
        best = None
        for i, st in enumerate(stanzas):
            if counts[i] >= MAX_REPEAT:
                continue
            trial = counts[:i] + [counts[i] + 1] + counts[i + 1:]
            r = run(trial)
            if r[0] > cur[0] and r[1] - cur[1] >= (len(st) + 1) // 2 and (best is None or r[0] > best[1][0]):
                best = (trial, r)
        if best is None:
            break
        counts, cur = best
    _, _, lines, anchors = cur
    return [[t, l] for t, l in zip(_times(lines, anchors, start, end), lines)]


def apply(t: dict, spans: list[dict], letras: Path = LETRAS) -> dict:
    """The transcript with each span's automatic lines replaced by its aligned lyric; `letras` lists the spans."""
    if not spans:
        return t
    seg = [list(s) for s in t["seg"]]
    info = []
    for sp in spans:
        meta, stanzas = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        lyric = align(seg, stanzas, sp["desde"], sp["hasta"])
        seg = [s for s in seg if not sp["desde"] <= s[0] < sp["hasta"]] + lyric
        info.append(lyric_info(sp, meta))
    return {**t, "seg": sorted(seg, key=lambda s: s[0]), "letras": info}


def lyric_info(sp: dict, meta: dict) -> dict:
    """What the player shows of a lyric sung in a span: its time, title and author, and the rights
    and source that credit the text."""
    return {"desde": sp["desde"], "hasta": sp["hasta"], **{k: meta.get(k, "") for k in ("titulo", "autor", "idioma")},
            **{k: meta[k] for k in ("derechos", "fuente") if meta.get(k)}}


def credit(info: list[dict], spans: list[dict], letras: Path = LETRAS) -> list[dict]:
    """`info` (a reconstruction's lyrics) with each one's rights and source from its file, matched by span."""
    by_span = {(sp["desde"], sp["hasta"]): sp["letra"] for sp in spans}
    out = []
    for l in info:
        slug = by_span.get((l["desde"], l["hasta"]))
        meta = parse_letra((letras / f"{slug}.md").read_text(encoding="utf-8"))[0] if slug else {}
        out.append({**l, **{k: meta.get(k, "") for k in ("derechos", "fuente") if meta.get(k)}})
    return out


def spans_for(video_id: str, letras: Path = LETRAS) -> list[dict]:
    p = letras / "videos.json"
    return json.loads(p.read_text(encoding="utf-8")).get(video_id, []) if p.exists() else []


def preview(seg: list, stanzas: list[list[str]], desde: float, hasta: float) -> tuple[list[list], list[str]]:
    """The aligned lines and warnings worth a look before publishing."""
    out = align(seg, stanzas, desde, hasta)
    warn = []
    for (a, la), (b, _) in zip(out, out[1:]):
        if b - a < 1.0:
            warn.append(f"{a:.1f}s «{la}»: next line under 1 s later (too many repeats, or the span is too short?)")
    if out and out[0][0] - desde > 30:
        warn.append(f"first line {out[0][0] - desde:.0f} s after 'desde': the span may start too early")
    if not any(_words(x) for t, x in seg if desde <= t < hasta):
        warn.append("no heard words in the span: wrong video or times")
    return out, warn


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Preview an alignment before adding it to data/letras/videos.json.")
    ap.add_argument("video")
    ap.add_argument("letra", help="slug in data/letras/ (without .md)")
    ap.add_argument("desde", type=float)
    ap.add_argument("hasta", type=float)
    a = ap.parse_args()
    tr = json.loads((REPO / "public" / "transcripciones-video" / f"{a.video}.json").read_text(encoding="utf-8"))
    if tr.get("letras"):
        print("note: this file already carries aligned lyrics; preview the raw text by re-exporting without the span")
    _, st = parse_letra((LETRAS / f"{a.letra}.md").read_text(encoding="utf-8"))
    lines, warnings = preview(tr["seg"], st, a.desde, a.hasta)
    for t, l in lines:
        print(f"{int(t) // 60}:{int(t) % 60:02d}  {l}")
    for w in warnings:
        print("WARN", w)
