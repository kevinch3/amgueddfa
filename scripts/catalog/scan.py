import csv
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse

from .model import Item
from .notes import clean_note

FESTIVALS = {
    "Eisteddfod_del_Chubut": "chubut",
    "Eisteddfod_de_la_Juventud": "juventud",
    "Eisteddfod_Mimosa": "mimosa",
    "Eisteddfod_de_Trevelin": "trevelin",
}
CATEGORIES = {
    "Programa": "programa",
    "Programa_del_dia": "programa-del-dia",
    "Preliminares": "preliminares",
    "Bases_y_avisos": "bases",
    "Resultados": "resultados",
}
KINDS = {
    "jpg": "image", "jpeg": "image", "png": "image", "webp": "image",
    "pdf": "pdf",
    "doc": "doc", "docx": "doc", "pptx": "doc", "xls": "doc", "xlsx": "doc",
    "html": "web", "htm": "web",
    "csv": "table",
}
PRE_EXISTING = "(pre-existing in folder; origin not recorded)"
# Videos/ + VIDEOS.tsv: YouTube thumbnails and links, catalogued separately (not items yet).
IGNORED = {"INDEX.md", "SOURCES.tsv", "amgueddfa", "Videos", "VIDEOS.tsv"}


def _title(name: str) -> str:
    stem = Path(name).stem
    if stem.startswith("fb_"):
        stem = stem[3:]
        stem = re.sub(r"_\d{6,}$", "", stem)
    return stem.replace("_", " ")


def _source(url: str) -> tuple[str | None, str]:
    if url == PRE_EXISTING or not url:
        return None, "Colección inicial (origen no registrado)"
    if url.startswith("kpc.local:"):
        return None, "Archivo personal (kpc)"
    if url.startswith("Aporte de "):  # scripts/sync_uploads.py: a community upload
        return None, url
    if not url.startswith(("http://", "https://")):  # a named source, e.g. an association's files
        return None, url
    host = (urlparse(url).hostname or "").lower()
    if host.endswith("facebook.com"):
        return url, "Facebook"
    if host == "web.archive.org":
        return url, "Wayback Machine"
    if host == "drive.google.com" or host.startswith("drive.usercontent"):
        return url, "Google Drive"
    return url, host or url


def _read_sources(archive: Path) -> dict[str, dict]:
    with open(archive / "SOURCES.tsv", newline="", encoding="utf-8") as f:
        return {r["path"]: r for r in csv.DictReader(f, delimiter="\t")}


def _walk(archive: Path):
    for p in sorted(archive.rglob("*")):
        rel = p.relative_to(archive)
        if not p.is_file() or any(part.startswith(".") for part in rel.parts):
            continue
        if rel.parts[0] in IGNORED:
            continue
        yield p, rel


def scan(archive: Path, restricted_extra: set[str]) -> list[Item]:
    archive = Path(archive)
    sources = _read_sources(archive)
    by_id: dict[str, Item] = {}
    for p, rel in _walk(archive):
        relstr = rel.as_posix()
        if relstr not in sources:
            raise ValueError(f"file missing from SOURCES.tsv: {relstr}")
        ext = p.suffix.lower().lstrip(".")
        if ext not in KINDS:
            raise ValueError(f"unsupported file type: {relstr}")
        iid = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
        if iid in by_id:
            by_id[iid].alt_paths.append(relstr)
            if len(rel.parts) > 3 and CATEGORIES.get(rel.parts[2]) == "resultados":
                by_id[iid].restricted = True
            continue
        parts = rel.parts
        festival = FESTIVALS.get(parts[0])
        if festival is None:
            raise ValueError(f"unknown festival folder: {relstr}")
        yfolder = parts[1]
        year, undated = None, False
        if yfolder == "_sin_fecha":
            undated = True
        elif yfolder != "_general":
            year = int(yfolder)
        category = CATEGORIES.get(parts[2], "otros") if len(parts) > 3 else "otros"
        row = sources[relstr]
        url, label = _source(row["source_url"])
        raw = row.get("notes") or ""
        by_id[iid] = Item(
            id=iid, festival=festival, year=year, undated=undated,
            category=category, title=_title(p.name), kind=KINDS[ext],
            src_path=relstr, source_url=url, source_label=label,
            retrieved=row.get("retrieved") or "",
            note_public=clean_note(raw, relstr),
            year_inferred=(p.name.startswith(("fb_", "Tapa_programa_"))
                           or "inferred" in raw),
            restricted=(category == "resultados" or iid in restricted_extra),
        )
    items = list(by_id.values())
    for it in items:
        it.alt_paths.sort()
    items.sort(key=lambda i: (i.festival, i.year if i.year is not None else -1,
                              i.category, i.title))
    return items
