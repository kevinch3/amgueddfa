"""The museum's collections, read from src/data/colecciones.json (docs/reglas.md, rule 1).

The site (src/lib/colecciones.ts) reads the same file, so a collection added there
reaches the catalog builder, the video exports and the pages at once.
"""
import json
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "src" / "data" / "colecciones.json"
_DATA = json.loads(FILE.read_text(encoding="utf-8"))

TIPOS: list[str] = _DATA["tipos"]
COLECCIONES: list[dict] = _DATA["colecciones"]
# Archive folder name → collection id ("Eisteddfod_del_Chubut" → "chubut").
BY_FOLDER: dict[str, str] = {c["carpeta"]: c["id"] for c in COLECCIONES}
# Festivals whose video transcripts are published and can be corrected (#29).
VIDEO_TEXT: set[str] = {c["id"] for c in COLECCIONES if c["texto_de_videos"]}
