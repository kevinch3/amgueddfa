"""One visibility level per record (docs/reglas.md, rule 5; design 2026-11-27, section 3).

  publico     page, lists, files and text
  solo_ficha  page with title, date, source and a notice; no files, no text
  privado     nothing: left out of catalog.json, files kept in .restricted/

The level is the strictest of the collection's default, the old `restricted` flag
(results lists, data/restricted_extra.txt) and data/visibilidad.json. A record
with `publico_desde` becomes public on the first catalog build on or after that
date: the same run moves its files to the public bucket, so the page and its
files open together.
"""
import json
from datetime import date
from pathlib import Path

from scripts.colecciones import COLECCIONES

LEVELS = ["publico", "solo_ficha", "privado"]
DEFAULTS = {c["id"]: c["visibilidad_por_defecto"] for c in COLECCIONES}


def stricter(a: str, b: str) -> str:
    return a if LEVELS.index(a) >= LEVELS.index(b) else b


def load_overrides(repo: Path) -> dict[str, dict]:
    """data/visibilidad.json: {"<item id>": {"visibilidad": "privado", "publico_desde": "2031-01-01", "motivo": "…"}}."""
    p = repo / "data" / "visibilidad.json"
    if not p.exists():
        return {}
    rows = json.loads(p.read_text(encoding="utf-8") or "{}")
    for iid, o in rows.items():
        if o.get("visibilidad", "publico") not in LEVELS:
            raise ValueError(f"data/visibilidad.json {iid}: unknown visibilidad {o.get('visibilidad')!r}")
        if o.get("publico_desde"):
            date.fromisoformat(o["publico_desde"])
    return rows


def apply_visibility(items, overrides: dict[str, dict], today: date) -> None:
    """Set visibilidad and publico_desde on every item, and keep `restricted` in step (in place)."""
    for it in items:
        o = overrides.get(it.id, {})
        v = DEFAULTS.get(it.festival, "privado")  # an unknown collection shows nothing
        v = stricter(v, "solo_ficha" if it.restricted else "publico")
        v = stricter(v, o.get("visibilidad", "publico"))
        desde = o.get("publico_desde") or None
        if desde and today >= date.fromisoformat(desde):
            v = "publico"
        it.visibilidad = v
        it.publico_desde = desde
        it.restricted = v != "publico"


def published(items) -> list:
    """The records catalog.json lists: everything but `privado`."""
    return [it for it in items if it.visibilidad != "privado"]
