"""Cases a maintainer wrote down about one video, checked against its lines.

  python3 -m scripts.reconstruct.casos <video_id> <cases.json> [--reconstruccion]

The cases file is a list of objects, kept outside the repo when its words are private:
  {"kind": "present", "name", "t", "tol", "words": [...], "lang"?}
      some line within t +- tol holds every word (folded), in `lang` when given;
  {"kind": "once", "name", "from", "to", "words": [...]}
      the words are together in exactly one line starting in [from, to);
  {"kind": "absent_lang", "name", "from", "to", "src", "pattern"}
      no line from `src` starting in [from, to) matches the regex (on folded text).
By default the lines are load_sources's; with --reconstruccion, those of data/reconstruccion/<id>.json.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import NamedTuple

from scripts.export_video_transcripts import DEFAULT_BACKUP, line_languages
from scripts.reconstruct.sources import Line, load_sources

RECONSTRUCCION = Path(__file__).resolve().parents[2] / "data" / "reconstruccion"


class Row(NamedTuple):
    t: float
    text: str  # folded
    srcs: frozenset
    lang: str | None


def fold(s: str) -> str:
    """Lowercase, accents stripped, punctuation dropped."""
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^\w\s]", " ", s).split())


def lines_from_sources(lines: list[Line]) -> list[Row]:
    return [Row(l.t, fold(l.text), frozenset([l.src]), l.lang) for l in lines]


def lines_from_reconstruccion(doc: dict) -> list[Row]:
    langs = line_languages(doc) or [None] * len(doc["seg"])
    fu = doc.get("fuentes") or [[]] * len(doc["seg"])
    return [Row(t, fold(x), frozenset(f), lang) for (t, x), f, lang in zip(doc["seg"], fu, langs)]


def load_lines(video_id: str, reconstruccion: bool) -> list[Row]:
    if reconstruccion:
        return lines_from_reconstruccion(json.loads((RECONSTRUCCION / f"{video_id}.json").read_text(encoding="utf-8")))
    from scripts.reconstruct_videos import _backup_files
    files = _backup_files(DEFAULT_BACKUP)
    stem = (DEFAULT_BACKUP / "videos" / files[video_id]).with_suffix("")
    return lines_from_sources(load_sources(stem, video_id))


def _has(row: Row, words: list[str]) -> bool:
    return all(fold(w) in row.text for w in words)


def check_case(case: dict, rows: list[Row]) -> bool:
    kind = case["kind"]
    if kind == "present":
        return any(abs(r.t - case["t"]) <= case["tol"] and _has(r, case["words"])
                   and (case.get("lang") is None or r.lang == case["lang"]) for r in rows)
    win = [r for r in rows if case["from"] <= r.t < case["to"]]
    if kind == "once":
        return sum(_has(r, case["words"]) for r in win) == 1
    if kind == "absent_lang":
        pat = re.compile(case["pattern"])
        return not any(case["src"] in r.srcs and pat.search(r.text) for r in win)
    raise ValueError(f"unknown case kind: {kind}")


def check(cases: list[dict], rows: list[Row]) -> list[tuple[str, bool]]:
    return [(c["name"], check_case(c, rows)) for c in cases]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("video_id")
    ap.add_argument("cases", type=Path)
    ap.add_argument("--reconstruccion", action="store_true")
    a = ap.parse_args(argv)
    cases = json.loads(a.cases.read_text(encoding="utf-8"))
    res = check(cases, load_lines(a.video_id, a.reconstruccion))
    for name, ok in res:
        print(("PASS " if ok else "FAIL ") + name)
    print(f"{sum(ok for _, ok in res)}/{len(res)} pass")
    return 0 if all(ok for _, ok in res) else 1


if __name__ == "__main__":
    sys.exit(main())
