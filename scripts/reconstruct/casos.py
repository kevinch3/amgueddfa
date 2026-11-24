"""Cases a maintainer wrote down about one video, checked against its lines.

  python3 -m scripts.reconstruct.casos <video_id> <cases.json> [--reconstruccion]

The cases file is a list of objects, kept outside the repo when its words are private:
  {"kind": "present", "name", "t", "tol", "words": [...], "lang"?}
      some line within t +- tol holds every word (folded) or matches "pattern" (a regex on folded
      text, instead of "words"), is from "src" and is in "lang" when those are given;
  {"kind": "once", "name", "from", "to", "words": [...]}
      the words are together in exactly one line starting in [from, to);
  {"kind": "absent_lang", "name", "from", "to", "src", "pattern"}
      no line from `src` starting in [from, to) matches the regex (on folded text);
  {"kind": "no_duplicate", "name", "from", "to"}
      no two lines starting in [from, to) from different sources overlap by more than 0.5 s.
      A reconstruction has no line ends, so there two lines of 3+ words from different fuentes are
      duplicates when 60% of the shorter one's words (a multiset) are in the other.
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
from scripts.reconstruct.context import SAME_WORDS, share_of_words
from scripts.reconstruct.sources import Line, load_sources

RECONSTRUCCION = Path(__file__).resolve().parents[2] / "data" / "reconstruccion"


class Row(NamedTuple):
    t: float
    text: str  # folded
    srcs: frozenset
    lang: str | None
    e: float | None = None  # end; None for a reconstruction's lines (they have none)


def fold(s: str) -> str:
    """Lowercase, accents stripped, punctuation dropped."""
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^\w\s]", " ", s).split())


OVERLAP_MIN = 0.5  # s
MIN_WORDS = 3


def _ends(ts: list[float], es: list[float | None]) -> list[float]:
    """Each line's end: its own when known, else the next line's start; the last line lasts 1 s."""
    return [e if e is not None else ts[i + 1] if i + 1 < len(ts) else ts[i] + 1.0 for i, e in enumerate(es)]


def lines_from_sources(lines: list[Line]) -> list[Row]:
    lines = [l for l in lines if l.alt is None]  # an alternative is a candidate for the model, not a published line
    ends = _ends([l.t for l in lines], [l.e for l in lines])
    return [Row(l.t, fold(l.text), frozenset([l.src]), l.lang, e) for l, e in zip(lines, ends)]


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


def _has(row: Row, case: dict) -> bool:
    if "pattern" in case:
        return bool(re.search(case["pattern"], row.text))
    return all(fold(w) in row.text for w in case["words"])


def _duplicates(x: Row, y: Row) -> bool:
    if x.srcs == y.srcs:
        return False
    if x.e is not None and y.e is not None:
        return min(x.e, y.e) - max(x.t, y.t) > OVERLAP_MIN
    a, b = sorted((x.text.split(), y.text.split()), key=len)  # the shorter line's words, in the other
    return len(a) >= MIN_WORDS and share_of_words(a, b) >= SAME_WORDS


def check_case(case: dict, rows: list[Row]) -> bool:
    kind = case["kind"]
    if kind == "present":
        return any(abs(r.t - case["t"]) <= case["tol"] and _has(r, case)
                   and (case.get("lang") is None or r.lang == case["lang"])
                   and (case.get("src") is None or case["src"] in r.srcs) for r in rows)
    win = [r for r in rows if case["from"] <= r.t < case["to"]]
    if kind == "once":
        return sum(_has(r, case) for r in win) == 1
    if kind == "absent_lang":
        pat = re.compile(case["pattern"])
        return not any(case["src"] in r.srcs and pat.search(r.text) for r in win)
    if kind == "no_duplicate":
        if any(not r.srcs for r in win):
            # every line would look like one source and nothing would be a duplicate: a silent pass
            raise ValueError(f"{case['name']}: no_duplicate needs each line's sources (a reconstruction without fuentes)")
        return not any(_duplicates(x, y) for i, x in enumerate(win) for y in win[i + 1:])
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
