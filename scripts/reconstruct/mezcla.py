"""The language of each Bangor line, from both models' confidence (design:
docs/superpowers/specs/2026-11-24-gales-castellano-mezclados-design.md, step 2).

Input rows are the es-lines file of the mixed pass (scripts/colab/pase_mezcla.py es_lines()):
{"s", "e", "cy", "cy_p", "cy_words", "es", "es_p", "es_words"}, words as [start, end, word, probability].
"""
from __future__ import annotations

from scripts.export_video_transcripts import LOOP, STOCK
from scripts.reconstruct.sources import Line

CLEAR = 0.10  # a model whose mean word confidence is this much above the other's gives the whole line
MIN_RUN = 3  # a run of fewer words takes its neighbours' language
JOIN_GAP = 1.0  # s: lines of one source closer than this that repeat a word at the cut are joined


def _text(ws: list) -> str:
    return " ".join(w[2] for w in ws if w[2])


def _usable(ws: list) -> bool:
    """Turbo's words can win: there are some, and they are not a stock phrase or a loop."""
    t = _text(ws)
    return bool(t) and not STOCK.search(t) and not LOOP.search(t)


def _cy(ws: list, conf: float | None) -> Line:
    return Line(ws[0][0], _text(ws), "cy", "cy", conf, ws[-1][1])


def _es(ws: list) -> Line:
    return Line(ws[0][0], _text(ws), "whisper_es", "es", None, ws[-1][1])


def _labels(cy: list, es: list) -> list[str]:
    """cy for each Bangor word at least as sure as the surest turbo word overlapping it in time, es otherwise."""
    out = []
    for s, e, _, p in cy:
        over = [w[3] for w in es if w[0] < e and w[1] > s]
        out.append("cy" if p >= max(over, default=0.0) else "es")
    return out


def _runs(labels: list[str]) -> list[list]:
    """[[label, first index, end index], ...], with runs shorter than MIN_RUN given the longer neighbour's label."""
    runs = []
    for i, lab in enumerate(labels):
        if runs and runs[-1][0] == lab:
            runs[-1][2] = i + 1
        else:
            runs.append([lab, i, i + 1])
    while len(runs) > 1:
        short = next((k for k, r in enumerate(runs) if r[2] - r[1] < MIN_RUN), None)
        if short is None:
            break
        near = [runs[k] for k in (short - 1, short + 1) if 0 <= k < len(runs)]
        runs[short][0] = max(near, key=lambda r: r[2] - r[1])[0]
        runs = _merge(runs)
    return runs


def _merge(runs: list[list]) -> list[list]:
    out = []
    for r in runs:
        if out and out[-1][0] == r[0]:
            out[-1][2] = r[2]
        else:
            out.append(list(r))
    return out


def _word_by_word(r: dict, conf: float | None) -> list[Line]:
    """An es run publishes turbo's words starting within its time; one left with none usable is Welsh."""
    cy, es = r["cy_words"], r["es_words"]
    runs = _runs(_labels(cy, es))
    turbo = lambda run: [w for w in es if cy[run[1]][0] <= w[0] < cy[run[2] - 1][1]]
    for run in runs:
        if run[0] == "es" and not _usable(turbo(run)):
            run[0] = "cy"
    return [_es(turbo(run)) if run[0] == "es" else _cy(cy[run[1]:run[2]], conf) for run in _merge(runs)]


def _decide_row(r: dict, conf: float | None) -> list[Line]:
    if not r["cy_words"]:
        return []
    gap = r["cy_p"] - r["es_p"]
    if gap >= CLEAR or not r["es_words"]:
        return [_cy(r["cy_words"], conf)]
    if gap <= -CLEAR:
        return [_es(r["es_words"])] if _usable(r["es_words"]) else [_cy(r["cy_words"], conf)]
    return _word_by_word(r, conf)


def _fold(w: str) -> str:
    return "".join(c for c in w.lower() if c.isalnum())


def _join(lines: list[Line]) -> list[Line]:
    """Adjacent lines of one source under JOIN_GAP apart where the second starts with the word the first ends
    with: one line, that word once (kept from the first)."""
    out: list[Line] = []
    for ln in lines:
        if out:
            prev = out[-1]
            a, b = prev.text.split(), ln.text.split()
            if (prev.src == ln.src and prev.e is not None and ln.t - prev.e < JOIN_GAP and a and b
                    and _fold(a[-1]) and _fold(a[-1]) == _fold(b[0])):
                confs = [c for c in (prev.conf, ln.conf) if c is not None]
                conf = min(confs) if confs else None
                out[-1] = prev._replace(text=" ".join(a + b[1:]), e=ln.e, conf=conf)
                continue
        out.append(ln)
    return out


def decide(rows: list[dict], conf: dict[float, float]) -> list[Line]:
    """Each Bangor line of the es-lines rows as Welsh (src "cy", Bangor's words, conf from `conf` by the row's
    start) or Spanish (src "whisper_es", turbo's words), split word by word when neither model is clearly surer.
    Sorted by start time, with repeats at a cut joined."""
    lines = [ln for r in rows for ln in _decide_row(r, conf.get(r["s"]))]
    return _join(sorted(lines, key=lambda ln: ln.t))
