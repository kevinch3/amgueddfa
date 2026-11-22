"""Output lines of a window (from the model, or from rules when it fails) and the
joined text of a video."""
from __future__ import annotations

from typing import NamedTuple

from scripts.export_video_transcripts import line_language
from scripts.reconstruct.context import tokens
from scripts.reconstruct.windows import Window, _strip_tags

PREFERENCE = ("subida", "yt_es", "whisper_es", "cy")
LYRIC_TAIL = 4.0  # seconds a lyric span is taken to last after its last line
SAME_SPEECH = 10.0  # s: a Spanish-written Welsh line this close to a Bangor line is the same speech


class OutLine(NamedTuple):
    t: float
    text: str
    lang: str
    fuentes: tuple


def rules_lines(w: Window) -> list[OutLine]:
    """No model: lyrics inside their span, otherwise the most reliable Spanish source the window has and
    the Welsh model's lines beside it (sources already dropped those heard over Spanish speech, so a
    bilingual window keeps both languages). Where Bangor has Welsh, the Spanish source's lines that read
    as Welsh are left out: the same speech, written far worse."""
    own = [l for l in w.lines if w.t0 <= l.t < w.t1 and tokens(_strip_tags(l.text))]  # no bare [Música] tags
    lyrics = [l for l in own if l.src == "letra"]
    span = (min(l.t for l in lyrics), max(l.t for l in lyrics) + LYRIC_TAIL) if lyrics else None
    src = next((s for s in PREFERENCE if s != "cy" and any(l.src == s for l in own)), None)
    bangor = [l.t for l in own if l.src == "cy"]
    # Welsh speech that a Spanish recogniser wrote ("en" for "yn") is left out where Bangor has it too.
    welsh_by_spanish = lambda l: (l.src != "cy" and any(abs(l.t - t) <= SAME_SPEECH for t in bangor)
                                  and line_language(l.text, [l.src]) == "cy")
    out = [OutLine(l.t, l.text, l.lang, (l.src,)) for l in lyrics]
    out += [OutLine(l.t, l.text, l.lang, (l.src,)) for l in own
            if l.src in (src, "cy") and not welsh_by_spanish(l) and not (span and span[0] <= l.t <= span[1])]
    return sorted(out, key=lambda l: l.t)  # by time only: same-second lines keep their source order


def reply_lines(reply: dict) -> list[OutLine]:
    return [OutLine(float(l["t"]), l["text"], l["lang"], tuple(l["src"])) for l in reply.get("lines", [])]


def merge(windows: list[Window], per_window: list[list[OutLine]]) -> list[OutLine]:
    """Each window keeps only its own stretch, so lines in the overlap appear once."""
    out = {(l.t, l.text): l for w, lines in zip(windows, per_window) for l in lines if w.t0 <= l.t < w.t1}
    return sorted(out.values(), key=lambda l: l.t)
