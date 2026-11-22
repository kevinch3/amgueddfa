from dataclasses import dataclass, field


@dataclass
class Item:
    id: str
    festival: str
    year: int | None
    undated: bool
    category: str
    title: str
    kind: str  # image | pdf | doc | web | table
    src_path: str
    alt_paths: list[str] = field(default_factory=list)
    source_url: str | None = None
    source_label: str = ""
    retrieved: str = ""
    note_public: str = ""
    rights: str = ""  # public credit and licence line of a third-party holder
    year_inferred: bool = False
    restricted: bool = False
    hidden: bool = False  # an approved "no corresponde" report or admin correction
    no_text: bool = False  # nothing to transcribe (cover, poster, rules slide…)
    pages: int = 0
    thumb: str | None = None
    page_paths: list[str] = field(default_factory=list)
    page_size: list[int] | None = None  # [width, height] of page 1, for the cover's width/height attributes
    text_excerpt: str | None = None
    table: list[dict] | None = None
