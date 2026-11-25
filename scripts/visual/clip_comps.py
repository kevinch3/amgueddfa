"""Which programa competition each Chubut performance clip is, from its title code or its on-screen title card.

  python3 -m scripts.visual.clip_comps [BACKUP_ROOT]

A clip identified this way gets public/marcadores-video/<id>.json with one chapter at 0:00 ("Comp. 22: <programa
title>"), so the player names the competition and the edition page links the programa line to the clip (src/lib/
markers.ts playMap; sessions' own chapters keep priority there). Every clip looked at, with its source and any
disagreement, goes to the private review list ../.visual/clip-comps.tsv.

Sources, most reliable first:
- the code in the YouTube title, kept in the backup index (CH2013022 = Chubut 2013, competition 22);
- the title card OCR read in the clip's first frames ("COMP. 22 SOLO VOCAL"), from ../.visual/<id>/ocr.json.
A number counts only if that year's programa has it. A card alone must also share a word with the programa title,
so a stray number on screen does not link a clip. When code and card disagree, the code wins and the clip is flagged.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from scripts.export_video_transcripts import DEFAULT_BACKUP, REPO
from scripts.video_markers import OUT, fold, keywords, programa_for
from scripts.visual.ocr_frames import real_words

STORE = REPO.parent / ".visual"
CODE = re.compile(r"CH(\d{4})(\d{3})")
TITLE = re.compile(r"\bcomp(?:etencia)?\.?\s*((?:\d{1,3}(?:\s*(?:,|y|e)\s*)?)+)", re.I)
CARD = re.compile(r"\b(?:comp(?:etencia|etici[oó]n)?|cystadleuaeth)\.?\s*(?:n[º°o]?\.?\s*)?(\d{1,3})\b", re.I)


def from_code(code: str) -> tuple[int, str] | None:
    m = CODE.fullmatch(code or "")
    return (int(m.group(1)), str(int(m.group(2)))) if m else None


def from_title(title: str) -> list[str]:
    """Competition numbers a clip's YouTube title states: "2015 Comp. 99 …", "Apertura y Comp. 76, 28 y 70"."""
    m = TITLE.search(title or "")
    return [str(int(x)) for x in re.findall(r"\d{1,3}", m.group(1))] if m else []


def cards(rows: list[dict]) -> list[tuple[str, int, str]]:
    """(number, first time, text) of each competition card shown, in time order. A card needs two real words around
    the number (the number pattern is strong evidence, so "Competencia Nº 7 recitado" counts)."""
    out: dict[str, tuple[str, int, str]] = {}
    for r in sorted(rows, key=lambda r: r["t"]):
        m = CARD.search(r["text"])
        if m and len(real_words(r["text"])) >= 2:
            out.setdefault(str(int(m.group(1))), (str(int(m.group(1))), r["t"], r["text"]))
    return list(out.values())


def identify(code: str, title: str, year: int, rows: list[dict], titles: dict[str, str]) -> dict | None:
    """{"marks": [[t, n, programa title]], "source", "review": [...]} for a clip, or None.

    The code and the title's numbers are trusted; a card puts a trusted number's chapter at the moment it is shown.
    A card naming another number is left for review, never published (2015: a card read as 8, the Corona, in a clip
    titled Comp. 86). A trusted number without a card starts at 0:00 only when it is the clip's one competition.
    With neither code nor title number, a card alone must share a word with the programa title."""
    by_code = from_code(code)
    trusted = ([by_code[1]] if by_code and by_code[0] == year else []) + from_title(title)
    trusted = [n for i, n in enumerate(trusted) if n in titles and n not in trusted[:i]]
    shown = cards(rows)
    if trusted:
        at = {n: t for n, t, _ in shown if n in trusted}
        # One competition: the whole clip is it, from 0:00 (a card may come late, with the result). Several: each
        # chapter at its own card; one without a card has no known start and is left out.
        if len(trusted) == 1:
            marks = [[0, trusted[0], titles[trusted[0]]]]
        else:
            marks = [[at[n], n, titles[n]] for n in trusted if n in at]
        if not marks:
            return None
        kind = ("code" if by_code and by_code[1] in trusted else "title") + ("+card" if at else "")
        return {"marks": sorted(marks), "source": kind, "review": [f"card {n}" for n, _, _ in shown if n not in trusted]}
    for n, t, text in shown:
        if n in titles and keywords(titles[n]) & set(re.findall(r"\w{4,}", fold(text))):
            return {"marks": [[t, n, titles[n]]], "source": "card", "review": []}
    return None


def marker(marks: list[list]) -> dict:
    return {"auto": True, "markers": [[t, n, title, "comp"] for t, n, title in marks]}


def main(backup: Path) -> int:  # pragma: no cover - reads the private backup
    idx = [r for r in csv.DictReader((backup / "INDEX.tsv").open(encoding="utf-8"), delimiter="\t")
           if r["festival"] == "Eisteddfod_del_Chubut" and r["kind"] == "actuacion" and r.get("year")]
    site = {v["id"] for v in json.loads((REPO / "src/data/videos.json").read_text(encoding="utf-8"))["videos"]}
    cat = json.loads((REPO / "src/data/catalog.json").read_text(encoding="utf-8"))
    catalog = cat["items"] if isinstance(cat, dict) else cat
    programas: dict[int, dict[str, str]] = {}
    review, written = [], 0
    for r in idx:
        vid, year = r["id"], int(r["year"])
        if vid not in site:
            continue
        titles = programas.setdefault(year, programa_for(year, catalog)[0])
        p = STORE / vid / "ocr.json"
        rows = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
        found = identify(r.get("code", ""), r.get("title", ""), year, rows, titles) if titles else None
        review.append([vid, str(year), r.get("code", ""), " ".join(m[1] for m in found["marks"]) if found else "",
                       found["source"] if found else "", " ".join(found["review"]) if found else "", "" if titles else "no programa"])
        out = OUT / f"{vid}.json"
        if found and not (out.exists() and not _ours(out)):
            out.write_text(json.dumps(marker(found["marks"]), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            written += 1
    with (STORE / "clip-comps.tsv").open("w", encoding="utf-8") as f:
        f.write("id\tyear\tcode\tcomps\tsource\treview\tnote\n")
        f.writelines("\t".join(x) + "\n" for x in review)
    print(f"{len(review)} clips looked at, {written} linked to their competition; review list {STORE / 'clip-comps.tsv'}")
    return 0


def _ours(p: Path) -> bool:
    """A marker file this script wrote (one chapter at 0:00), so it may be rewritten; a session's is never touched."""
    try:
        m = json.loads(p.read_text(encoding="utf-8"))["markers"]
    except (OSError, ValueError, KeyError):
        return False
    return len(m) == 1 and m[0][0] == 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BACKUP))
