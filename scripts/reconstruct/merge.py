"""Output lines of a window (from the model, or from rules when it fails) and the
joined text of a video."""
from __future__ import annotations

from typing import NamedTuple

from scripts.reconstruct.context import tokens
from scripts.reconstruct.sources import _overlapped
from scripts.reconstruct.windows import Window, _strip_tags

PREFERENCE = ("subida", "yt_es", "whisper_es", "cy")
LYRIC_TAIL = 4.0  # seconds a lyric span is taken to last after its last line


class OutLine(NamedTuple):
    t: float
    text: str
    lang: str
    fuentes: tuple


def rules_lines(w: Window, mezcla: bool = False) -> list[OutLine]:
    """No model: lyrics inside their span, otherwise the most reliable Spanish source the window has and
    the Welsh model's lines beside it (sources already dropped those heard over Spanish speech, so a
    bilingual window keeps both languages; where Bangor has Welsh speech, sources also dropped the Spanish
    recognisers' version of it).

    mezcla: the video has the mixed-language pass (sources.has_mezcla; the caller passes it, as the lines alone
    cannot tell a decided Spanish line from turbo's long form, both whisper_es). There the decided Spanish lines
    replaced Bangor's, and sources already dropped the other sources' lines they cover, so a line of another
    Spanish source is kept too where the chosen source's lines do not cover half of it (sources._overlapped).
    Without it the rules are as before."""
    own = [l for l in w.lines if w.t0 <= l.t < w.t1 and tokens(_strip_tags(l.text))]  # no bare [Música] tags
    lyrics = [l for l in own if l.src == "letra"]
    span = (min(l.t for l in lyrics), max(l.t for l in lyrics) + LYRIC_TAIL) if lyrics else None
    src = next((s for s in PREFERENCE if s != "cy" and any(l.src == s for l in own)), None)
    out = [OutLine(l.t, l.text, l.lang, (l.src,)) for l in lyrics]
    if not mezcla:
        out += [OutLine(l.t, l.text, l.lang, (l.src,)) for l in own
                if l.src in (src, "cy") and not (span and span[0] <= l.t <= span[1])]
        return sorted(out, key=lambda l: l.t)  # by time only: same-second lines keep their source order
    # Chosen lines that start before t0 but reach into the window still count as covering it.
    chosen = [l for l in w.lines if l.src == src and l.t < w.t1 and tokens(_strip_tags(l.text))]
    kept = [l for l in own if l.src in (src, "cy")]
    covering = [l for l in chosen]
    for s in PREFERENCE:  # the other Spanish sources, most reliable first; each tested against what is already kept
        if s in ("cy", src):
            continue
        for l in own:
            if l.src == s and not _overlapped(l, covering):
                kept.append(l)
                covering.append(l)
    out += [OutLine(l.t, l.text, l.lang, (l.src,)) for l in kept if not (span and span[0] <= l.t <= span[1])]
    return sorted(out, key=lambda l: l.t)  # by time only: same-second lines keep their source order


def reply_lines(reply: dict) -> list[OutLine]:
    return [OutLine(float(l["t"]), l["text"], l["lang"], tuple(l["src"])) for l in reply.get("lines", [])]


def merge(windows: list[Window], per_window: list[list[OutLine]]) -> list[OutLine]:
    """Each window keeps only its own stretch, so lines in the overlap appear once."""
    out = {(l.t, l.text): l for w, lines in zip(windows, per_window) for l in lines if w.t0 <= l.t < w.t1}
    return sorted(out.values(), key=lambda l: l.t)
