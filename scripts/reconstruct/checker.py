"""What gets published is decided here, not by the model: a reply passes only if it
adds no word nobody heard (design: 2026-11-20-reconstruccion-videos-design.md)."""
from __future__ import annotations

from scripts.reconstruct.context import tokens
from scripts.reconstruct.windows import Window

NEAR = 5.0  # seconds: a word must have been heard this close to the line that uses it


def check_window(w: Window, reply: dict) -> list[str]:
    """Rule failures of a model reply for one window; [] means it passes."""
    errors: list[str] = []
    lyric_texts = {l.text for l in w.lines if l.src == "letra"}
    lyric_words = {tok for t in lyric_texts for tok in tokens(t)}
    last = float("-inf")
    for k, line in enumerate(reply.get("lines", [])):
        t, text = float(line["t"]), line["text"]
        heard = {tok for l in w.lines if l.src != "letra" and abs(l.t - t) <= NEAR for tok in tokens(l.text)}
        unknown = [tok for tok in tokens(text) if tok not in heard | lyric_words | w.context.words]
        if unknown:
            errors.append(f"rule 1: line {k} at {t:g}s uses words nobody heard: {', '.join(unknown)}")
        for fix in line.get("fixes", []):
            outside = [tok for tok in tokens(fix["to"]) if tok not in w.context.words]
            if outside:
                errors.append(f"rule 2: line {k} fixes to words outside the word list: {', '.join(outside)}")
        if not (w.t0 - NEAR <= t < w.t1 + NEAR):
            errors.append(f"rule 3: line {k} at {t:g}s is outside the window {w.t0:g}-{w.t1:g}")
        elif t < last:
            errors.append(f"rule 3: line {k} at {t:g}s goes back in time")
        last = max(last, t)
        if "letra" in line.get("src", []) and text not in lyric_texts:
            errors.append(f"rule 4: line {k} at {t:g}s changes a lyric line")
    return errors
