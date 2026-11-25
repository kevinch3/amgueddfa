"""Scene runs: a vision model's per-frame labels joined into stretches ("ceremony 34:30-37:15").

The 7B flickers between labels from one frame to the next (2001 chairing ceremony: ceremony and performance
alternate), so each frame takes the majority label of the WINDOW frames around it, and only a run of MIN_RUN frames
or more counts. A single-frame flicker never makes a run.
"""
from __future__ import annotations

from collections import Counter

WINDOW = 5  # frames, centred
MIN_RUN = 3


def _smooth(labels: list[str]) -> list[str]:
    half = WINDOW // 2
    out = []
    for i, own in enumerate(labels):
        c = Counter(labels[max(0, i - half):i + half + 1]).most_common()
        best = c[0][1]
        tied = {lab for lab, n in c if n == best}
        out.append(own if own in tied else c[0][0])
    return out


def scene_runs(labels: list[tuple[int, str | None]]) -> list[tuple[str, int, int]]:
    """[(scene, first t, last t)] in time order, from [(t, scene or None)]. Unlabelled frames are skipped."""
    seen = [(t, s) for t, s in sorted(labels) if s]
    if not seen:
        return []
    smooth = _smooth([s for _, s in seen])
    out: list[list] = []
    for (t, _), s in zip(seen, smooth):
        if out and out[-1][0] == s:
            out[-1][2] = t
            out[-1][3] += 1
        else:
            out.append([s, t, t, 1])
    return [(s, a, b) for s, a, b, n in out if n >= MIN_RUN]


def cue_runs(cues: list[tuple[int, set[str]]], cue: str) -> list[tuple[int, int]]:
    """[(first t, last t)] where `cue` holds, smoothed the same way: one missed frame does not break a run."""
    return [(a, b) for s, a, b in scene_runs([(t, cue if cue in c else "-") for t, c in cues]) if s == cue]
