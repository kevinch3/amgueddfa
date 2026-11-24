"""About one minute of a video at a time, cut in pauses, with a few seconds of overlap,
and a hash of everything the model would see (an unchanged window is never asked twice)."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Callable, NamedTuple

from scripts.reconstruct.context import Context, load_glossary, tokens, with_glossary
from scripts.reconstruct.sources import Line

# Bump when prompt.md or schema.json change: every window is asked again.
PROMPT_VERSION = 5  # 5: Welsh sound-alike corrections from context; 4: Welsh mutations corrected; 2: word list spelled as in the context; 3: keep single-source real speech, Welsh confidence shown
SEARCH = 10.0  # a cut may move this far from its nominal place to land in a pause


class Window(NamedTuple):
    t0: float
    t1: float
    lines: tuple
    context: Context
    hash: str


def _cut(starts: list[float], nominal: float) -> float:
    best, best_gap = nominal, -1.0
    for a, b in zip(starts, starts[1:]):
        mid = (a + b) / 2
        if abs(mid - nominal) <= SEARCH and b - a > best_gap:
            best, best_gap = round(mid, 1), b - a
    return best


def make_windows(lines: list[Line], duration: float, context_for: Callable[[float, float], Context],
                 size: float = 60.0, overlap: float = 5.0, glossary: list | None = None) -> list[Window]:
    glossary = load_glossary() if glossary is None else glossary
    starts = sorted({l.t for l in lines})
    cuts, t0 = [0.0], 0.0
    while t0 + size < duration:
        t0 = _cut(starts, t0 + size)
        cuts.append(t0)
    cuts.append(float(duration))
    out = []
    for a, b in zip(cuts, cuts[1:]):
        inside = tuple(l for l in lines if a - overlap <= l.t < b + overlap)
        ctx = with_glossary(context_for(a, b), inside, glossary)
        # The fields the model sees, never a line's end (e): adding it to Line must not re-ask every window.
        # An alternative (sources.Line.alt) adds its partner's time, so windows without one keep their hash.
        seen = [[l.t, l.text, l.src, l.lang, l.conf] + ([l.alt] if l.alt is not None else []) for l in inside]
        key = json.dumps([a, b, seen, ctx.text, PROMPT_VERSION], ensure_ascii=False, sort_keys=True)
        out.append(Window(a, b, inside, ctx, hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]))
    return out


def needs_model(w: Window) -> bool:
    """False when no line has a word (music, applause): nothing to ask."""
    return any(tokens(_strip_tags(l.text)) for l in w.lines)


def _strip_tags(s: str) -> str:
    return re.sub(r"\[[^\]]*\]", " ", s)
