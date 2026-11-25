"""Frames of one video: one every STEP s, kept only when the picture changed since the last kept one.

  python3 -m scripts.visual.frames <video file> <out dir>

Writes <out>/f<seconds>.jpg for the kept frames and <out>/frames.json: {"step", "kept": [t], "cuts": [t]}, where a cut
is a kept frame very different from the one before it (a new shot), which the vision model always gets.
Runs on the laptop, where the videos are; one ffmpeg and one picture at a time (the laptop is short of memory).
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Iterable
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

STEP = 5  # s between samples
DIFF = 8.0  # mean grey difference (0-255) on a small thumbnail that counts as a changed picture
CUT = 60.0  # ... and as a new shot
THUMB = (64, 36)


def _thumb(im: Image.Image) -> Image.Image:
    return im.convert("L").resize(THUMB)


def difference(a: Image.Image, b: Image.Image) -> float:
    """Mean grey difference of two pictures, compared as small thumbnails (camera noise averages out)."""
    return ImageStat.Stat(ImageChops.difference(_thumb(a), _thumb(b))).mean[0]


def pick(shots: Iterable[tuple[int, Image.Image]], diff: float = DIFF) -> list[int]:
    """The times of the frames to keep: the first, then each one at least `diff` away from the last kept one."""
    kept, last = [], None
    for t, im in shots:
        th = _thumb(im)
        if last is None or ImageStat.Stat(ImageChops.difference(th, last)).mean[0] >= diff:
            kept.append(t)
            last = th
    return kept


def main(argv: list[str]) -> int:
    video, out = Path(argv[0]), Path(argv[1])
    raw = out / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    subprocess.run(["nice", "-n", "10", "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(video), "-vf", f"fps=1/{STEP}",
                    "-q:v", "3", str(raw / "%06d.jpg")], check=True)
    kept, cuts, last = [], [], None
    for p in sorted(raw.glob("*.jpg")):
        t = (int(p.stem) - 1) * STEP
        with Image.open(p) as im:
            th = _thumb(im)
        d = None if last is None else ImageStat.Stat(ImageChops.difference(th, last)).mean[0]
        if d is None or d >= DIFF:
            p.rename(out / f"f{t:06d}.jpg")
            kept.append(t)
            if d is not None and d >= CUT:
                cuts.append(t)
            last = th
        else:
            p.unlink()
    raw.rmdir()
    (out / "frames.json").write_text(json.dumps({"step": STEP, "kept": kept, "cuts": cuts}), encoding="utf-8")
    print(f"{video.name}: kept {len(kept)} frames, {len(cuts)} cuts")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
