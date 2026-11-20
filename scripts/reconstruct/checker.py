"""What gets published is decided here, not by the model: a reply passes only if it
adds no word nobody heard (design: 2026-11-20-reconstruccion-videos-design.md).

Rules, per line:
1. Every word was heard within ±5 s by a source, or comes from a verified fix (rule 2).
   Word-list words never enter a line on their own; lyric words never build a non-lyric line.
2. A fix turns a word heard within ±5 s into a word of the word list.
3. The line sits inside the window, at the exact time of a source line, in time order.
4. A lyric line ("letra") equals a lyric line of the window, at its time, used once.
5. Its sources are named and real: each one has a line within ±5 s sharing a word with it.
"""
from __future__ import annotations

from scripts.reconstruct.context import tokens
from scripts.reconstruct.windows import Window

NEAR = 5.0   # seconds: a word must have been heard this close to the line that uses it
SAME = 0.05  # seconds: a line's time must be a source line's time


def check_window(w: Window, reply: dict) -> list[str]:
    """Rule failures of a model reply for one window; [] means it passes."""
    errors: list[str] = []
    lyrics = [(l.t, l.text) for l in w.lines if l.src == "letra"]
    heard_lines = [l for l in w.lines if l.src != "letra"]
    used: set[int] = set()
    last = float("-inf")
    for k, line in enumerate(reply.get("lines", [])):
        t, text = float(line["t"]), line.get("text", "")
        src, fixes = list(line.get("src", [])), list(line.get("fixes", []))
        words = tokens(text)
        where = f"line {k} at {t:g}s"
        if not words:
            errors.append(f"rule 1: {where} has no words")
            continue
        if "letra" in src:
            match = [i for i, (lt, lx) in enumerate(lyrics) if lx == text and abs(lt - t) < SAME]
            free = [i for i in match if i not in used]
            if not match:
                errors.append(f"rule 4: {where} changes or moves a lyric line")
            elif not free:
                errors.append(f"rule 4: {where} repeats a lyric line")
            else:
                used.add(free[0])
            if set(src) != {"letra"}:
                errors.append(f"rule 5: {where} mixes a lyric line with other sources")
        else:
            near = [l for l in heard_lines if abs(l.t - t) <= NEAR]
            heard = {tok for l in near for tok in tokens(l.text)}
            fixed: set[str] = set()
            from_words: set[str] = set()
            for fix in fixes:
                to, frm = tokens(fix.get("to", "")), tokens(fix.get("from", ""))
                if not to or any(tok not in w.context.words for tok in to):
                    errors.append(f"rule 2: {where} fixes to words outside the word list: {fix.get('to')}")
                elif not frm or any(tok not in heard for tok in frm):
                    errors.append(f"rule 2: {where} fixes a word nobody heard: {fix.get('from')}")
                else:
                    fixed.update(to)
                    from_words.update(frm)
            unknown = [tok for tok in words if tok not in heard and tok not in fixed]
            if unknown:
                errors.append(f"rule 1: {where} uses words nobody heard: {', '.join(unknown)}")
            if not src:
                errors.append(f"rule 5: {where} names no source")
            for s in src:
                if not any(l.src == s and set(tokens(l.text)) & (set(words) | from_words) for l in near):
                    errors.append(f"rule 5: {where} claims source {s} that has no matching line")
            if not any(abs(l.t - t) < SAME for l in heard_lines):
                errors.append(f"rule 3: {where} is not at a source line's time")
        if not (w.t0 - NEAR <= t < w.t1 + NEAR):
            errors.append(f"rule 3: {where} is outside the window {w.t0:g}-{w.t1:g}")
        elif t < last:
            errors.append(f"rule 3: {where} goes back in time")
        last = max(last, t)
    return errors
