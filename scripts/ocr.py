#!/usr/bin/env python3
"""Machine text (OCR) for public scans that have no text yet.

A draft for search and for transcribers, never the published transcription:
every document still gets a human one (src/data/transcripciones/). Runs on the
laptop, like build_catalog.py, and reads the original files of the archive
without touching them. One JSON file per item goes to src/data/ocr/<id>.json:

    {"tool": "tesseract", "version": "5.3.4", "langs": "cym+spa+eng",
     "date": "2026-11-20", "pages": [{"n": 1, "text": "...", "conf": 71.4}]}

Selection: public (not restricted, not hidden), images and PDFs outside
"otros" (photos), not marked
"nothing to transcribe", no embedded text (text_excerpt), no human
transcription, and no OCR file yet (unless --force).

    python3 scripts/ocr.py --festival chubut --limit 20      # pilot
    python3 scripts/ocr.py --ids 0225a7a6f9ec --force
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LANGS = "cym+spa+eng"
KINDS = {"image", "pdf"}
# "otros" is mostly photographs (choirs, ceremonies): OCR only finds noise there.
SKIP_CATEGORIES = {"otros"}


def transcribed_ids(repo: Path) -> set[str]:
    """Every item covered by a human transcription (file id + its `items:` front matter)."""
    out: set[str] = set()
    for p in (repo / "src" / "data" / "transcripciones").glob("*.md"):
        out.add(p.stem)
        m = re.match(r"^---\r?\n(.*?)\r?\n---", p.read_text(encoding="utf-8"), re.S)
        if m:
            for line in m.group(1).splitlines():
                if line.strip().startswith("items:"):
                    out.update(x for x in re.split(r"[\s,]+", line.split(":", 1)[1]) if x)
    return out


def select(items: list[dict], transcribed: set[str], done: set[str], skip_categories: set[str] = SKIP_CATEGORIES) -> list[dict]:
    """Items that need machine text, in catalog order."""
    return [
        i for i in items
        if i.get("kind") in KINDS and i.get("category") not in skip_categories
        and not i.get("restricted") and not i.get("hidden") and not i.get("no_text")
        and not (i.get("text_excerpt") or "").strip()
        and i["id"] not in transcribed and i["id"] not in done
    ]


def parse_tsv(tsv: str) -> tuple[str, float | None]:
    """Text (one line per OCR line, blank line between blocks) and mean word confidence from `tesseract ... tsv`."""
    rows = [r.split("\t") for r in tsv.splitlines()[1:]]
    lines: list[str] = []
    confs: list[float] = []
    key = None
    block = None
    words: list[str] = []
    for r in rows:
        if len(r) < 12 or r[0] != "5":  # level 5 = word
            continue
        word, conf = r[11].strip(), float(r[10])
        if not word:
            continue
        k = (r[2], r[3], r[4])  # block, paragraph, line
        if k != key:
            if words:
                lines.append(" ".join(words))
            if block is not None and r[2] != block:
                lines.append("")
            key, block, words = k, r[2], []
        words.append(word)
        if conf >= 0:
            confs.append(conf)
    if words:
        lines.append(" ".join(words))
    conf = round(sum(confs) / len(confs), 1) if confs else None
    return "\n".join(lines).strip(), conf


def tesseract_version() -> str:
    out = subprocess.run(["tesseract", "--version"], capture_output=True, text=True).stdout
    m = re.search(r"tesseract\s+v?([\d.]+)", out)
    return m.group(1) if m else "unknown"


def ocr_image(path: Path, langs: str) -> tuple[str, float | None]:
    tsv = subprocess.run(["tesseract", str(path), "stdout", "-l", langs, "tsv"],
                         capture_output=True, text=True, check=True).stdout
    return parse_tsv(tsv)


def page_images(src: Path, kind: str, tmp: Path) -> list[Path]:
    if kind == "image":
        return [src]
    subprocess.run(["pdftoppm", "-r", "300", "-png", str(src), str(tmp / "p")], check=True)
    return sorted(tmp.glob("p-*.png"))


def ocr_item(item: dict, archive: Path, langs: str, version: str) -> dict:
    src = archive / item["src_path"]
    pages = []
    with tempfile.TemporaryDirectory() as t:
        for n, img in enumerate(page_images(src, item["kind"], Path(t)), start=1):
            text, conf = ocr_image(img, langs)
            pages.append({"n": n, "text": text, "conf": conf})
    return {"tool": "tesseract", "version": version, "langs": langs, "date": date.today().isoformat(), "pages": pages}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=str(REPO))
    ap.add_argument("--archive", default=str(REPO.parent))
    ap.add_argument("--festival")
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--langs", default=LANGS)
    ap.add_argument("--include-otros", action="store_true", help="also the 'otros' category (mostly photos)")
    ap.add_argument("--force", action="store_true", help="redo items that already have an OCR file")
    ap.add_argument("--dry-run", action="store_true", help="only list what would be processed")
    a = ap.parse_args()
    repo, archive = Path(a.repo), Path(a.archive).resolve()
    out_dir = repo / "src" / "data" / "ocr"
    items = json.loads((repo / "src" / "data" / "catalog.json").read_text(encoding="utf-8"))["items"]
    done = set() if a.force else {p.stem for p in out_dir.glob("*.json")}
    todo = select(items, transcribed_ids(repo), done, set() if a.include_otros else SKIP_CATEGORIES)
    if a.festival:
        todo = [i for i in todo if i["festival"] == a.festival]
    if a.ids:
        todo = [i for i in todo if i["id"] in set(a.ids)]
    if a.limit:
        todo = todo[: a.limit]
    print(f"{len(todo)} item(s) to OCR", file=sys.stderr)
    if a.dry_run:
        for i in todo:
            print(i["id"], i["festival"], i.get("year"), i["title"])
        return 0
    have = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True).stdout.split()
    missing = [x for x in a.langs.split("+") if x not in have]
    if missing:
        print(f"missing Tesseract languages: {', '.join(missing)} (apt install tesseract-ocr-<lang>)", file=sys.stderr)
        return 1
    version = tesseract_version()
    out_dir.mkdir(parents=True, exist_ok=True)
    for k, i in enumerate(todo, start=1):
        res = ocr_item(i, archive, a.langs, version)
        (out_dir / f"{i['id']}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        confs = [p["conf"] for p in res["pages"] if p["conf"] is not None]
        print(f"[{k}/{len(todo)}] {i['id']} {len(res['pages'])} page(s), conf {min(confs) if confs else '-'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
