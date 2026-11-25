"""On-screen text of a video's kept frames (Tesseract, the languages scripts/ocr.py uses for the scans).

  python3 -m scripts.visual.ocr_frames <frames dir> [workers=1]

Writes <dir>/ocr.json: [{"t", "text", "conf"}], one row per kept frame. Tesseract in sparse-text mode turns textures
into stray letters ("A y | —"), so `has_text` asks for MIN_WORDS real words before a frame counts as showing text.
Meant for KPC's CPU (6 workers); the laptop can run it with 1.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from scripts.ocr import LANGS

MIN_CONF = 60.0  # a word Tesseract is less sure of than this is dropped
MIN_WORDS = 3
WORD = re.compile(r"[^\W\d_]{4,}[.,:;!?]?")  # four letters or more (any script, Welsh ŵ ŷ included), one mark after


def real_words(text: str) -> list[str]:
    return [w for w in text.split() if WORD.fullmatch(w)]


def has_text(text: str) -> bool:
    return len(real_words(text)) >= MIN_WORDS


def parse_tsv(tsv: str, min_conf: float = MIN_CONF) -> tuple[str, float | None]:
    """Tesseract's TSV output: the confident words joined, and their mean confidence (None when there are none)."""
    words = []
    for line in tsv.splitlines()[1:]:
        c = line.split("\t")
        if len(c) == 12 and c[11].strip() and float(c[10]) >= min_conf:
            words.append((c[11], float(c[10])))
    if not words:
        return "", None
    return " ".join(w for w, _ in words), round(sum(c for _, c in words) / len(words), 1)


def ocr(path: Path) -> tuple[str, float | None]:
    # One thread per Tesseract: its default OpenMP threads, times several workers, fought over KPC's 8 cores
    # (2026-11-25: 3-4 s per frame instead of under 1 s).
    out = subprocess.run(["tesseract", str(path), "-", "-l", LANGS, "--psm", "11", "tsv"], capture_output=True, text=True,
                         env={**os.environ, "OMP_THREAD_LIMIT": "1"})
    return parse_tsv(out.stdout)


def main(argv: list[str]) -> int:
    folder, workers = Path(argv[0]), int(argv[1]) if len(argv) > 1 else 1
    paths = sorted(folder.glob("f*.jpg"))
    with ThreadPoolExecutor(workers) as pool:
        found = list(pool.map(ocr, paths))
    rows = [{"t": int(p.stem[1:]), "text": text, "conf": conf} for p, (text, conf) in zip(paths, found)]
    (folder / "ocr.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{folder.name}: {len(rows)} frames, {sum(has_text(r['text']) for r in rows)} with text")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
