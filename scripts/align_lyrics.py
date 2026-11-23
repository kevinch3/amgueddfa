"""Known lyrics in place of YouTube's guesses while a piece is sung.

A choir's words come out of automatic captions as near-nonsense ("tan foras, tan
bellas"), but the programa says which piece is sung. Given the text
(data/letras/<slug>.md) and the span of the video where it is sung
(data/letras/videos.json), the lyric lines replace the automatic ones in that
span, each at the time of the automatic line its words were matched to; lines
nobody matched are spread between their neighbours by syllables. Times are
approximate and the player says so.

A line is anchored to the heard words only on real evidence (see LONG and RARE). The lyric
runs from its first anchored line to its last: lines before and after those are placed at
the pace the anchored ones were sung, and only while they fit inside the span and clear of
speech heard there (see SPEECH_GAP). A performance cut short, or a text longer than what was
sung, leaves its last lines out (preview() warns) instead of spreading them over the applause
and the announcer.

Choirs repeat stanzas: a stanza is taken as sung again (up to 3 times) only
when the extra pass matches at least half its lines to words heard outside speech.

Used by export_video_transcripts and the reconstruction (a re-export keeps the
result). Lyrics are supplied by the maintainer, who confirms their rights.
"""
from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LETRAS = REPO / "data" / "letras"

MATCH = 0.6     # word similarity that counts as the same word heard
GAP = -0.2      # a heard word left unmatched
SKIP = -0.05    # a lyric word nobody heard (singing is often missed whole)
MISS = -0.5     # a mismatched pair
MAX_REPEAT = 3  # times a stanza may be sung

# Evidence that a line was heard where its words matched: 2 matched words, one of them of LONG+ letters
# at LONG_SIM; one word of RARE+ letters at RARE_SIM; or more than half of a line of shorter words.
# Anchors kept in the 81 spans measured in 2026-11 (letras-fin-medidas), on the measured singing / outside
# it: the old aligner (any word, speech included) 827 / 68; any word, speech left out, 817 / 15; any 2
# words, 697 / 10; 2 words with a long one, 614 / 5; that plus the rare word (this rule), 634 / 6. An anchor
# outside the singing is what carried lines onto the jury. The rare word keeps a line heard in one segment
# with the next (a 2-word line, one of them long): without it, 4 lines of the 'ok' spans were lost, with it 1.
LONG, LONG_SIM = 4, 0.8
RARE, RARE_SIM = 5, 0.85
# Lines outside the anchored ones go at the pace of the nearest anchors that span PACE_SYL syllables or
# more; with fewer, PACE (s per syllable, the median of 63 spans in 2026-11).
PACE, PACE_SYL = 0.75, 20
# Speech in a span: a heard line with 2+ words of LONG+ letters, fewer than half of them like a word of the
# text, next to another such line within SPEECH_GAP s. In those 85 spans it marked 502 of the 700 speech
# lines and 6 of the 1,222 sung ones (Whisper's fluent guesses over singing come alone).
SPEECH_GAP = 10.0
LINE_DUR = 4.0  # s a heard line is taken to last, at most (until the next one)


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z]+", _fold(re.sub(r"\[[^\]]*\]", " ", s)))


def _syllables(line: str) -> int:
    return max(1, len(re.findall(r"[aeiouy]+", _fold(line))))


@lru_cache(maxsize=None)
def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


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


def _dp(lyric: list[tuple[str, int]], heard: list[tuple[str, float, int]]) -> tuple[float, dict[int, list]]:
    """Global alignment of lyric words to heard words; score and, per lyric line, its matches
    [(lyric word, index in `heard`, similarity)]."""
    n, m = len(lyric), len(heard)
    sim = [[_sim(a, h[0]) for h in heard] for a, _ in lyric]
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
    i, j, matches = n, m, {}
    while i and j:
        if P[i][j] == "d":
            if sim[i - 1][j - 1] >= MATCH:
                matches.setdefault(lyric[i - 1][1], []).append((lyric[i - 1][0], j - 1, sim[i - 1][j - 1]))
            i, j = i - 1, j - 1
        elif P[i][j] == "u":
            i -= 1
        else:
            j -= 1
    return D[n][m], matches


def _evidence(matched: list, words: list[str]) -> bool:
    """Whether a line's matched words show it was heard there (see LONG and RARE)."""
    if any(len(w) >= RARE and s >= RARE_SIM for w, _, s in matched):
        return True
    if len(matched) >= min(2, len(words)) and any(len(w) >= LONG and s >= LONG_SIM for w, _, s in matched):
        return True
    return not any(len(w) >= LONG for w in words) and 2 * len(matched) > len(words)


def _speech(inside: list[tuple[float, str]], stanzas: list[list[str]]) -> set[int]:
    """Indices of the heard lines that are speech, not the text sung (see SPEECH_GAP)."""
    vocab = {w for st in stanzas for line in st for w in _words(line)}

    def foreign(x: str) -> bool:
        long_ = [w for w in _words(x) if len(w) >= LONG]
        return len(long_) >= 2 and 2 * sum(any(_sim(w, v) >= LONG_SIM for v in vocab) for w in long_) < len(long_)

    f = {i for i, (_, x) in enumerate(inside) if foreign(x)}
    return {i for i in f if any(j in f and abs(inside[j][0] - inside[i][0]) <= SPEECH_GAP for j in (i - 1, i + 1))}


def _kept(anchors: dict[int, float]) -> dict[int, float]:
    """Anchors whose times increase with the line order (a later line heard earlier is dropped)."""
    keep, last = {}, float("-inf")
    for k in sorted(anchors):
        if anchors[k] > last:
            keep[k], last = anchors[k], anchors[k]
    return keep


def _spread(lines: list[str], pts: list[tuple[int, float]], out: list) -> None:
    """Lines between consecutive (index, time) points spread by syllables; index -1 is before the first line."""
    for (ia, ta), (ib, tb) in zip(pts, pts[1:]):
        if ia >= 0:
            out[ia] = ta
        span = ([ia] if ia >= 0 else []) + list(range(ia + 1, ib))
        total = sum(_syllables(lines[k]) for k in span) or 1
        acc = _syllables(lines[ia]) if ia >= 0 else 0
        for k in range(ia + 1, ib):
            out[k] = round(ta + (tb - ta) * acc / total, 1)
            acc += _syllables(lines[k])


def _pass(stanzas: list[list[str]], counts: list[int], heard: list):
    """The alignment with stanza i sung counts[i] times: score, number of lines matched (kept), the lines, each
    line's (stanza, line) number, the anchors (evidence) and the other lines' earliest match."""
    lines, where = [], []
    for si, (st, c) in enumerate(zip(stanzas, counts)):
        for _ in range(c):
            lines += st
            where += [(si + 1, li + 1) for li in range(len(st))]
    score, matches = _dp([(w, k) for k, l in enumerate(lines) for w in _words(l)], heard)
    anchors, weak = {}, {}
    for k, mt in matches.items():
        if _evidence(mt, _words(lines[k])):
            anchors[k] = min(heard[j][1] for _, j, _ in mt)
        else:
            weak[k] = min(heard[j][1] for _, j, _ in mt)
    # A repeat is judged on every line matched outside speech: a stanza heard again shows as a run of lines,
    # each on weaker evidence than an anchor needs (rosa-amarela's second pass, 2026-11: 3 of 4 lines matched,
    # none on 2 words).
    return score, len(_kept({**weak, **anchors})), lines, where, anchors, weak


def _align(seg: list, stanzas: list[list[str]], desde: float, hasta: float) -> tuple[list[list], dict]:
    """align() and what it could not place: {"anchored": n, "start": [(stanza, line), ...], "end": [...]}."""
    info: dict = {"anchored": 0, "start": [], "end": []}
    inside = [(float(t), x) for t, x in seg if desde <= t < hasta and _words(x)]
    if not stanzas:
        return [], info
    speech = _speech(inside, stanzas)
    heard = [(w, t, i) for i, (t, x) in enumerate(inside) if i not in speech for w in _words(x)]  # speech is never matched

    # Each stanza once, then add a repeat only where the choir was heard singing it again:
    # the extra pass must match at least half its lines and raise the score.
    counts = [1] * len(stanzas)
    cur = _pass(stanzas, counts, heard)
    while True:
        best = None
        for i, st in enumerate(stanzas):
            if counts[i] >= MAX_REPEAT:
                continue
            trial = counts[:i] + [counts[i] + 1] + counts[i + 1:]
            r = _pass(stanzas, trial, heard)
            if r[0] > cur[0] and r[1] - cur[1] >= (len(st) + 1) // 2 and (best is None or r[0] > best[1][0]):
                best = (trial, r)
        if best is None:
            break
        counts, cur = best
    _, _, lines, where, anchors, weak = cur
    out: list = [None] * len(lines)
    kept = _kept(anchors)
    info["anchored"] = len(kept)
    if not kept:  # nothing heard well enough: the span is all there is
        _spread(lines, [(-1, float(desde)), (len(lines), float(hasta))], out)
        return [[t, l] for t, l in zip(out, lines)], info

    # From the first anchored line to the last: anchors, and a line matched on weaker evidence keeps
    # its time when it falls between its anchored neighbours; the rest are spread by syllables.
    ks = sorted(kept)
    first, last = ks[0], ks[-1]
    pts = dict(kept)
    for a, b in zip(ks, ks[1:]):
        lo = kept[a]
        for k in range(a + 1, b):
            if k in weak and lo < weak[k] < kept[b]:
                pts[k] = lo = weak[k]
    _spread(lines, sorted(pts.items()), out)
    for k, t in pts.items():
        out[k] = t

    syl = [_syllables(l) for l in lines]

    def pace(edge: int, others) -> float:
        for k in others:
            a, b = min(edge, k), max(edge, k)
            if sum(syl[a:b]) >= PACE_SYL:
                return abs(kept[edge] - kept[k]) / sum(syl[a:b])
        return PACE

    # After the last anchored line: while each line starts before hasta and before the next speech.
    stop = min([float(hasta)] + [t for i, (t, _) in enumerate(inside) if i in speech and t > kept[last]])
    p, t = pace(last, reversed(ks[:-1])), kept[last]
    for k in range(last + 1, len(lines)):
        t += p * syl[k - 1]
        if t >= stop:
            info["end"] = where[k:]
            break
        out[k] = round(t, 1)

    # Before the first: while each line still ends after desde and after the speech before it; a line
    # cut by that boundary starts on it.
    floor = float(desde)
    before = [t for i, (t, _) in enumerate(inside) if i in speech and t < kept[first]]
    if before:
        t0 = max(before)
        t1 = min([t for t, _ in inside if t > t0] + [kept[first]])
        floor = max(floor, t0 + min(LINE_DUR, t1 - t0))
    p, t = pace(first, ks[1:]), kept[first]
    for k in range(first - 1, -1, -1):
        t -= p * syl[k]
        if t + p * syl[k] <= floor:
            info["start"] = where[:k + 1]
            break
        out[k] = round(max(t, floor), 1)
        if t < floor:
            info["start"] = where[:k]
            break
    return [[t, l] for t, l in zip(out, lines) if t is not None], info


def align(seg: list, stanzas: list[list[str]], desde: float, hasta: float) -> list[list]:
    """Lyric lines as [[time, line], ...] for the part of `seg` in [desde, hasta)."""
    return _align(seg, stanzas, desde, hasta)[0]


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
    out, info = _align(seg, stanzas, desde, hasta)
    warn = []
    for (a, la), (b, _) in zip(out, out[1:]):
        if b - a < 1.0:
            warn.append(f"{a:.1f}s «{la}»: next line under 1 s later (too many repeats, or the span is too short?)")
    if out and out[0][0] - desde > 30:
        warn.append(f"first line {out[0][0] - desde:.0f} s after 'desde': the span may start too early")
    heard = any(_words(x) for t, x in seg if desde <= t < hasta)
    if not heard:
        warn.append("no heard words in the span: wrong video or times")
    elif not info["anchored"]:
        warn.append("no line heard clearly enough to anchor it: the lines are spread evenly over the span, "
                    "so 'desde' and 'hasta' must mark the singing exactly")
    if info["end"]:
        (s, l), n = info["end"][0], len(info["end"])
        warn.append(f"{n} lines not placed at the end, from stanza {s} line {l} on: the text is longer than what "
                    f"was sung here (a performance cut short, a shorter version), or 'hasta' is before the end of the singing")
    if info["start"]:
        (s, l), n = info["start"][-1], len(info["start"])
        warn.append(f"{n} lines not placed at the start, up to stanza {s} line {l}: sung before the recording or "
                    f"before 'desde', or speech is heard right before the first line heard")
    return out, warn


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Preview an alignment before adding it to data/letras/videos.json.")
    ap.add_argument("video")
    ap.add_argument("letra", help="slug in data/letras/ (without .md)")
    ap.add_argument("desde", type=float)
    ap.add_argument("hasta", type=float)
    a = ap.parse_args()
    # The reconstruction keeps the fragment timing; the published text joins fragments into sentences (#97),
    # which would pile verses onto one line's time. Preview against the reconstruction when there is one.
    rec = REPO / "data" / "reconstruccion" / f"{a.video}.json"
    tr = json.loads((rec if rec.exists() else REPO / "public" / "transcripciones-video" / f"{a.video}.json").read_text(encoding="utf-8"))
    if tr.get("letras"):
        print("note: this file already carries aligned lyrics; preview the raw text by re-exporting without the span")
    _, st = parse_letra((LETRAS / f"{a.letra}.md").read_text(encoding="utf-8"))
    lines, warnings = preview(tr["seg"], st, a.desde, a.hasta)
    for t, l in lines:
        print(f"{int(t) // 60}:{int(t) % 60:02d}  {l}")
    for w in warnings:
        print("WARN", w)
