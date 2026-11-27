import csv
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse

from scripts.colecciones import BY_FOLDER

from .model import Item
from .notes import clean_note

# Archive folder → collection id, from src/data/colecciones.json.
FESTIVALS = BY_FOLDER
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
# Collection platforms credited by name, like Facebook: the item keeps its own link.
PLATFORMS = {
    "casgliadywerin.cymru": "Casgliad y Werin Cymru",
    "peoplescollection.wales": "Casgliad y Werin Cymru",
    # National Library of Wales newspapers (Y Drafod 1913-1919 and the Welsh press).
    "newspapers.library.wales": "Papurau Newydd Cymru",
    "papuraunewydd.llyfrgell.cymru": "Papurau Newydd Cymru",
    "commons.wikimedia.org": "Wikimedia Commons",
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


# Readable titles for files named by a slug (issue #90): "fb_programa-del-dia_123.jpg" → "Programa del día".
# Leading words that only say where the file came from (the item's source already says it).
SOURCE_WORDS = {"web", "villagra", "culturagaiman", "chubutcultural", "ig"}
# Whole slugs whose word order or joining words a word-by-word reading gets wrong.
PHRASES = {
    "desde-casa-competencias": "competencias desde casa",
    "cierre-inscripciones-competencias": "cierre de inscripciones a competencias",
    "cierre-inscripciones": "cierre de inscripciones",
    "semana-programa": "programa de la semana",
    "piezas-recitacion": "piezas de recitación",
    "bases-gales": "bases en galés",
    "programa-tapa": "tapa del programa",
    "artes-visuales-bases": "bases de artes visuales",
    "EisteddAdre-programa-reglamento": "EisteddAdre: programa y reglamento",
    "EisteddAdre-programa": "EisteddAdre: programa",
    "EisteddAdre-reglamento": "EisteddAdre: reglamento",
    "danzas-inscripcion": "danzas: inscripción",
    "avisos-erratas": "avisos y erratas",
    "programa-reglamento": "programa y reglamento",
    "preliminares-inscripciones": "preliminares: inscripciones",
    "reglamento-competencias": "reglamento de competencias",
    "avisos-inscripcion": "avisos de inscripción",
    "inscripciones-erratas": "inscripciones: erratas",
    "preliminares-orden-del-dia": "preliminares: orden del día",
    "preliminares-semana": "preliminares: semana",
    "fechas-recepcion": "fechas de recepción",
    "erratas-importante-inscripcion": "erratas importantes de inscripción",
    "programa-del-dia-anuncio": "anuncio del programa del día",
    "programa-rhaglen-anuncio": "anuncio del programa (rhaglen)",
    "programa-anuncio": "anuncio del programa",
    "fechas-inscripcion": "fechas de inscripción",
    "entrega-vencimientos": "entrega y vencimientos",
    "fe-de-erratas-fechas": "fe de erratas: fechas",
    "aviso-sesiones": "aviso de sesiones",
    "horarios-entradas": "horarios y entradas",
    "ceremonia-sillon": "ceremonia del sillón",
    "ceremonia-corona": "ceremonia de la corona",
    "concurso-tapa-programa": "concurso de tapa del programa",
    "comunicado-fechas": "comunicado de fechas",
    "nota-diario": "nota del diario",
    "info-preliminares-sesiones": "información de preliminares y sesiones",
    "show-apertura": "show de apertura",
    "presentacion-programa": "presentación del programa",
    "anuncio-preliminares": "anuncio de preliminares",
    "culmino-37-edicion": "culminó la 37.ª edición",
    "competencia-musica-solos": "competencia de música: solos",
    "semana-del-eisteddfod-preliminares": "semana del Eisteddfod: preliminares",
    "actualizacion-preliminares": "actualización de preliminares",
    "competencias-danzas": "competencias de danzas",
    "competencias-literatura": "competencias de literatura",
    "competencia-coros": "competencia de coros",
    "programa-eisteddfod-del-chubut": "programa del Eisteddfod del Chubut",
    "resultados-vivo": "resultados en vivo",
    "agenda-septiembre-DirCulturaGaiman": "agenda de septiembre (Dirección de Cultura de Gaiman)",
}
WORDS = {
    "dia": "día", "inscripcion": "inscripción", "recitacion": "recitación", "recepcion": "recepción", "arqueria": "arquería",
    "diseno": "diseño", "grafico": "gráfico", "fotografia": "fotografía", "musica": "música", "programacion": "programación",
    "actualizacion": "actualización", "edicion": "edición", "gales": "galés", "sillon": "sillón", "presentacion": "presentación",
    "donde": "dónde", "comp": "competencias", "eisteddfod": "Eisteddfod", "chubut": "Chubut", "trelew": "Trelew",
    "gaiman": "Gaiman", "valle": "Valle", "ganu": "Ganu",
}
MONTHS = {"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}


def readable_title(raw: str, year: int | None) -> str:
    """A title from a slug-like file name, or `raw` unchanged when a person wrote it (capitals and spaces)."""
    tokens = raw.split()
    while len(tokens) > 1 and tokens[0] in SOURCE_WORDS:
        tokens = tokens[1:]
    rest = " ".join(tokens)
    if rest != rest.lower() and not (len(tokens) == 1 and "-" in rest):
        return raw if rest == raw else rest[:1].upper() + rest[1:]  # a person's title, minus a source word
    if len(tokens) >= 3 and tokens[-3:-1] == ["feed", "wayback"]:
        tokens = tokens[:-3]
    words = "-".join(tokens).split("-")
    if len(words) > 1 and re.fullmatch(r"(19|20)\d\d", words[-1]):
        words = words[:-1]  # the year: the page already says it
    if not words or words == [""]:
        return raw
    slug = "-".join(words)
    if slug in PHRASES:
        text = PHRASES[slug]
    else:
        out: list[str] = []
        for i, w in enumerate(words):
            if w.isdigit() and out and out[-1].isdigit():
                out.append("y")
            if w.lower() in MONTHS and out and out[-1].isdigit():
                out.append("de")
            out.append(WORDS.get(w, w))
        text = " ".join(out)
    return text[:1].upper() + text[1:]


def title_key(title: str) -> list:
    """Sort key that puts "Bases (2 de 12)" before "Bases (10 de 12)"."""
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", title)]


# A caption that names the competition a post image is about (issue #95): «Competencias de Fotografía.»,
# «Presentamos las competencias de #COROS - #CORAU.». Other captions (calls to take part, shared post
# intros) don't tell images apart and are ignored.
CAPTION_COMPETITION = re.compile(r"^(?:(?:les\s+)?presentamos\s+las\s+)?(competencias?)\b\s*([:\-–]\s*|de\s+)?(.*)$", re.I)
# Names kept capitalised when a caption in capitals is lowered («DEL EISTEDDFOD DEL CHUBUT»).
PROPER = {"eisteddfod": "Eisteddfod", "chubut": "Chubut", "trelew": "Trelew", "gaiman": "Gaiman", "trevelin": "Trevelin",
          "madryn": "Madryn", "dolavon": "Dolavon", "mimosa": "Mimosa", "patagonia": "Patagonia"}


def caption_title(caption: str | None) -> str | None:
    """«Competencias de X» from a caption's first sentence, or None when it does not name a competition."""
    first = re.split(r"(?<=[.!?])\s+|\n", (caption or "").strip())[0].strip()
    m = CAPTION_COMPETITION.match(first)
    if not m:
        return None
    def lower(w: str) -> str:
        pre, core, post = re.match(r"^(\W*)(.*?)(\W*)$", w).groups()  # keep «CHUBUT.»'s full stop around the name
        return pre + PROPER.get(core.lower(), core.lower()) + post
    words = [lower(w) if w.isupper() and len(w) > 1 else w for w in m.group(3).replace("#", "").split()]
    rest = " ".join(words).rstrip(" .!…")
    # «Competencias de X», «Competencia: X» → "de"; «Competencia especial …» keeps its own words.
    title = f"{m.group(1).capitalize()} {'de ' if m.group(2) else ''}{rest}"
    return title if rest and len(title) <= 70 and len(title.split()) <= 12 else None


def caption_titles(items: list[Item]) -> None:
    """Documents that share a title within an edition section take their caption's competition, when it names
    one, so «Bases (12 de 67)» reads «Competencias de Fotografía». Run before number_repeats."""
    groups: dict[tuple, list[Item]] = {}
    for it in items:
        groups.setdefault((it.coleccion, it.year, it.undated, it.tipo, it.title), []).append(it)
    for same in groups.values():
        if len(same) < 2:
            continue
        for it in same:
            it.title = caption_title(it.note_public) or it.title


def number_repeats(items: list[Item]) -> None:
    """Public documents of one edition section with the same title get "(n de N)", in file order
    (Facebook ids grow with time). Hidden and restricted ones are not shown, so they are not counted:
    run it after the overlay (scripts/build_catalog.py), which can hide an item."""
    groups: dict[tuple, list[Item]] = {}
    for it in items:
        if it.hidden or it.restricted:
            continue
        groups.setdefault((it.coleccion, it.year, it.undated, it.tipo, it.title), []).append(it)
    for same in groups.values():
        if len(same) < 2:
            continue
        for n, it in enumerate(sorted(same, key=lambda i: i.src_path), 1):
            it.title = f"{it.title} ({n} de {len(same)})"


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
    if host.removeprefix("www.") in PLATFORMS:
        return url, PLATFORMS[host.removeprefix("www.")]
    return url, host or url


def _read_sources(archive: Path) -> dict[str, dict]:
    with open(archive / "SOURCES.tsv", newline="", encoding="utf-8") as f:
        return {r["path"]: r for r in csv.DictReader(f, delimiter="\t")}


def _walk(archive: Path):
    for p in sorted(archive.rglob("*")):
        rel = p.relative_to(archive)
        if not p.is_file() or any(part.startswith(".") for part in rel.parts):
            continue
        if rel.parts[0] in IGNORED or rel.parts[0].startswith("amgueddfa"):  # the repo and its git worktrees
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
            id=iid, coleccion=festival, year=year, undated=undated,
            tipo=category, title=readable_title(_title(p.name), year), formato=KINDS[ext],
            src_path=relstr, source_url=url, source_label=label,
            retrieved=row.get("retrieved") or "",
            note_public=clean_note(raw, relstr, row.get("caption") or ""),
            rights=(row.get("rights") or "").strip(),
            year_inferred=(p.name.startswith(("fb_", "Tapa_programa_"))
                           or "inferred" in raw),
            restricted=(category == "resultados" or iid in restricted_extra),
        )
    items = list(by_id.values())
    for it in items:
        it.alt_paths.sort()
    items.sort(key=lambda i: (i.coleccion, i.year if i.year is not None else -1,
                              i.tipo, title_key(i.title)))
    return items
