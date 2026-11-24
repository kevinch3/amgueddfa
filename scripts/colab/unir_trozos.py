"""Join the mixed pass's files of a long video run in pieces (so a reclaimed Colab runtime loses one piece, not
the video). Piece n is the audio from n * STEP s, lasting STEP + overlap s, named <id>p<n>.<ext>; the pass wrote
<id>p<n>.words.json, .es-lines.json and .es-words.json for it.

  python3 scripts/colab/unir_trozos.py <id> <pieces dir> <out dir> [step=1800]

Each piece's times are shifted by its start. Piece n keeps what starts in [n * STEP, (n + 1) * STEP); the overlap lets
its last line end. The next piece keeps nothing that starts before that line's end, so speech at a cut is written
once. Writes <id>.words.json, <id>.es-lines.json and <id>.es-words.json, which `videos.py import-mezcla` takes.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

STEP = 1800.0
KINDS = {"words": "segments", "es-lines": "lines", "es-words": "segments"}
WORD_LISTS = ("words", "cy_words", "es_words")


def _shift(item: dict, off: float) -> dict:
    out = dict(item, s=round(item["s"] + off, 2), e=round(item["e"] + off, 2))
    for k in WORD_LISTS:
        if k in item:
            out[k] = [[round(w[0] + off, 2), round(w[1] + off, 2), *w[2:]] for w in item[k] or []]
    return out


def join(pieces: list[list[dict]], step: float = STEP) -> list[dict]:
    """Items ({"s", "e", ...}) of pieces 0..n, in each piece's own time, as one list in the video's time."""
    out: list[dict] = []
    for n, items in enumerate(pieces):
        start, end = n * step, (n + 1) * step if n + 1 < len(pieces) else float("inf")
        floor = max(start, max((x["e"] for x in out), default=start))
        out += [x for x in (_shift(i, start) for i in sorted(items, key=lambda i: i["s"])) if floor <= x["s"] < end]
    return out


def main(argv: list[str]) -> int:
    vid, src, dst = argv[0], Path(argv[1]), Path(argv[2])
    step = float(argv[3]) if len(argv) > 3 else STEP
    nums = sorted(int(m.group(1)) for p in src.glob(f"{vid}p*.words.json") if (m := re.fullmatch(rf"{re.escape(vid)}p(\d+)\.words\.json", p.name)))
    if not nums or nums != list(range(len(nums))):
        print(f"pieces missing: found {nums}", file=sys.stderr)
        return 1
    dst.mkdir(parents=True, exist_ok=True)
    for kind, key in KINDS.items():
        docs = [json.loads((src / f"{vid}p{n}.{kind}.json").read_text(encoding="utf-8")) for n in nums]
        meta = {k: v for k, v in docs[0].items() if k != key}
        doc = dict(meta, id=vid, until=None, trozos=len(docs), **{key: join([d[key] for d in docs], step)})
        (dst / f"{vid}.{kind}.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        print(f"{vid}.{kind}.json: {len(doc[key])} from {len(docs)} pieces")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
