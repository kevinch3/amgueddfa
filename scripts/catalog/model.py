from dataclasses import dataclass, field


@dataclass
class Item:
    id: str
    coleccion: str  # an id from src/data/colecciones.json
    year: int | None
    undated: bool
    tipo: str
    title: str
    formato: str  # image | pdf | doc | web | table
    src_path: str
    alt_paths: list[str] = field(default_factory=list)
    source_url: str | None = None
    source_label: str = ""
    retrieved: str = ""
    note_public: str = ""
    rights: str = ""  # public credit and licence line of a third-party holder
    year_inferred: bool = False
    restricted: bool = False  # kept in step with visibilidad (scripts/catalog/visibilidad.py)
    visibilidad: str = "publico"  # publico | solo_ficha | privado
    publico_desde: str | None = None  # ISO date it opens on, if set
    hidden: bool = False  # an approved "no corresponde" report or admin correction
    no_text: bool = False  # nothing to transcribe (cover, poster, rules slide…)
    pages: int = 0
    thumb: str | None = None
    page_paths: list[str] = field(default_factory=list)
    page_size: list[int] | None = None  # [width, height] of page 1, for the cover's width/height attributes
    text_excerpt: str | None = None
    table: list[dict] | None = None


def as_record(it: "Item") -> dict:
    """The item as catalog.json writes it (docs/reglas.md, rule 2): year, undated and
    year_inferred become one `fecha` in place of the year."""
    from dataclasses import asdict

    out = {}
    for k, v in asdict(it).items():
        if k == "year":
            out["fecha"] = {"year": v, "inferred": it.year_inferred, "undated": it.undated}
        elif k in ("year_inferred", "undated", "notes"):
            continue
        else:
            out[k] = v
    return out
