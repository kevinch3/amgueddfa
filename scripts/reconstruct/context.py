"""What the model should know about a window: which competition is on, the edition's
approved facts, and the words those give (the word list the checker accepts)."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import NamedTuple

from scripts.letras_pendientes import front_items, title_competitions

FESTIVAL_NAMES = {"chubut": "Eisteddfod del Chubut", "trevelin": "Eisteddfod de Trevelin",
                  "juventud": "Eisteddfod de la Juventud", "mimosa": "Eisteddfod Mimosa Porth Madryn"}
FACT_FIELDS = ("venue", "ganador_silla", "ganador_corona", "presentadores")
BASE_WORDS = frozenset({"eisteddfod", "gorsedd", "wladfa", "chubut", "trelew", "gaiman", "trevelin", "dolavon", "madryn"})


GLOSARIO = Path(__file__).resolve().parents[2] / "data" / "glosario.md"


def load_glossary(path: Path = GLOSARIO) -> list[tuple[str, str]]:
    """Known mishearings, (heard folded, right), from data/glosario.md ("heard → right" lines)."""
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if "→" in line and not line.lstrip().startswith("#"):
            heard, right = (x.strip() for x in line.split("→", 1))
            if heard and right:
                out.append((fold(heard), right))
    return out


class Context(NamedTuple):
    text: str
    words: frozenset


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def tokens(s: str) -> list[str]:
    """Folded words: letters and digits, apostrophes inside a word kept ("eisteddfod's")."""
    return re.findall(r"[^\W_]+(?:'[^\W_]+)*", fold(s.replace("’", "'")))


def programa_lines(repo: Path, festival: str, year: int) -> dict[int, str]:
    """Every numbered competition line of that edition's programa transcriptions."""
    cat = {i["id"]: i for i in json.loads((repo / "src/data/catalog.json").read_text(encoding="utf-8"))["items"]}
    out: dict[int, str] = {}
    for p in sorted((repo / "src/data/transcripciones").glob("*.md")):
        text = p.read_text(encoding="utf-8")
        item = next((cat[x] for x in front_items(text, p.stem) if x in cat), None)
        if not item or item.get("category") != "programa" or item.get("festival") != festival or item.get("year") != year:
            continue
        for line in text.splitlines():
            m = re.match(r"^(\d{1,3})\.\s+(.*)", line)
            if m:
                out.setdefault(int(m.group(1)), m.group(2).strip())
    return out


def _on_screen(repo: Path, video: dict, t0: float, t1: float) -> list[int]:
    comps = title_competitions(video.get("title", ""))
    mk = repo / "public/marcadores-video" / f"{video['id']}.json"
    if mk.exists():
        chapters = sorted((float(m[0]), int(m[1])) for m in json.loads(mk.read_text(encoding="utf-8")).get("markers", []) if str(m[1]).isdigit())
        for k, (start, n) in enumerate(chapters):
            end = chapters[k + 1][0] if k + 1 < len(chapters) else float("inf")
            if start < t1 and end > t0:
                comps.append(n)
    return list(dict.fromkeys(comps))


def video_context(repo: Path, video: dict, t0: float, t1: float) -> Context:
    festival, year = video["festival"], int(video["year"])
    parts = [f"{FESTIVAL_NAMES.get(festival, festival)} {year}."]
    values = [parts[0]]  # the word list: names and values only, never field labels
    lines = programa_lines(repo, festival, year)
    for n in _on_screen(repo, video, t0, t1):
        if n in lines:
            parts.append(f"Competencia {n}: {lines[n]}")
            values.append(lines[n])
    facts = json.loads((repo / "data/approved/contributions.json").read_text(encoding="utf-8"))
    for c in facts:
        p = c.get("payload") or {}
        if (c.get("type") == "fact" and c.get("status", "approved") == "approved" and c.get("festival") == festival
                and c.get("year") == year and p.get("field") in FACT_FIELDS and p.get("value")):
            parts.append(f"{p['field']}: {p['value']}")
            values.append(p["value"])
    return Context("\n".join(parts), frozenset(tokens(" ".join(values))) | BASE_WORDS)


def with_glossary(ctx: Context, lines, glossary: list[tuple[str, str]]) -> Context:
    """The context plus the glossary hints whose misheard word occurs in these lines (else unchanged)."""
    heard = {tok for l in lines for tok in tokens(l.text)}
    hits = [(h, r) for h, r in glossary if all(t in heard for t in tokens(h))]
    if not hits:
        return ctx
    text = ctx.text + "\nPalabras mal oídas conocidas: " + "; ".join(f"{h} → {r}" for h, r in hits)
    return Context(text, ctx.words | {t for _, r in hits for t in tokens(r)})
