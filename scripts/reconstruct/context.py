"""What the model should know about a window: which competition is on, the edition's
approved facts, and the words those give (the word list the checker accepts)."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from functools import lru_cache
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


SAME_WORDS = 0.6  # share of a line's words found in another line: the same speech written again


def share_of_words(words: list[str], other: list[str]) -> float:
    """The share of `words`, counted with repeats, that `other` also has."""
    if not words:
        return 0.0
    a = Counter(words)
    return sum((a & Counter(other)).values()) / sum(a.values())


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


def video_context(repo: Path, video: dict, t0: float, t1: float, facts: list | None = None) -> Context:
    """facts: the approved contributions to use (default: data/approved/contributions.json)."""
    festival, year = video["festival"], int(video["year"])
    parts = [f"{FESTIVAL_NAMES.get(festival, festival)} {year}."]
    values = [parts[0]]  # the word list: names and values only, never field labels
    lines = programa_lines(repo, festival, year)
    for n in _on_screen(repo, video, t0, t1):
        if n in lines:
            parts.append(f"Competencia {n}: {lines[n]}")
            values.append(lines[n])
    if facts is None:
        facts = json.loads((repo / "data/approved/contributions.json").read_text(encoding="utf-8"))
    for c in facts:
        p = c.get("payload") or {}
        if (c.get("type") == "fact" and c.get("status", "approved") == "approved" and c.get("festival") == festival
                and c.get("year") == year and p.get("field") in FACT_FIELDS and p.get("value")):
            parts.append(f"{p['field']}: {p['value']}")
            values.append(p["value"])
    return Context("\n".join(parts), frozenset(tokens(" ".join(values))) | BASE_WORDS)


FACT_PREFIXES = tuple(f"{f}: " for f in FACT_FIELDS)
NAME_MIN = 4  # letters: shorter words (de, la, san) say nothing about a name being heard
SPELLED_ALIKE = 0.75
COMMON_SPELLED = 0.8  # a real word counts as a mishearing only when spelled this close to the name (nancy ~ Nanci)
COMMON_IN = 30  # videos: a word in this many published transcripts is a real word (for --palabras-comunes)
SPANISH_DICT = Path("/usr/share/dict/spanish")
COMMON_FILE = Path(__file__).resolve().parents[2] / "data" / "palabras-comunes.txt"
_INITIAL = {"k": "c", "q": "c", "z": "s", "j": "y", "i": "y", "v": "b"}


@lru_cache(maxsize=1)
def load_common_words() -> frozenset:
    """Words that are no mishearing of a name: the Spanish dictionary plus the frozen list of words common in
    the published transcripts (data/palabras-comunes.txt). Window keys depend on this set, so it never
    follows the live transcripts, and a machine without the dictionary stops instead of making other keys."""
    if not SPANISH_DICT.exists():
        sys.exit(f"{SPANISH_DICT} missing (install the wspanish word list): window keys depend on it")
    raw = SPANISH_DICT.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    words = {fold(w.strip()) for w in text.splitlines() if w.strip()}
    if COMMON_FILE.exists():
        words |= {l.strip() for l in COMMON_FILE.read_text(encoding="utf-8").splitlines()
                  if l.strip() and not l.startswith("#")}
    return frozenset(words)


def common_words() -> frozenset:
    return load_common_words()


def write_common_words(repo: Path, path: Path = COMMON_FILE, min_videos: int = COMMON_IN) -> int:
    """Freeze the words used in min_videos published transcripts or more. Rewriting it changes window keys:
    do it on purpose, then dry-run."""
    seen: Counter = Counter()
    for f in sorted((repo / "public/transcripciones-video").glob("*.json")):
        try:
            segs = json.loads(f.read_text(encoding="utf-8")).get("seg") or []
        except ValueError:
            continue
        seen.update({t for x in segs if isinstance(x, list) and len(x) > 1 for t in tokens(str(x[1]))})
    words = sorted(w for w, n in seen.items() if n >= min_videos and len(w) >= NAME_MIN)
    path.write_text(f"# Words in {min_videos}+ published video transcripts: not mishearings of a name.\n"
                    "# Frozen on purpose (window keys depend on it): python3 -m scripts.reconstruct.context --palabras-comunes\n"
                    + "\n".join(words) + "\n", encoding="utf-8")
    return len(words)


def _initial(w: str) -> str:
    w = w[1:] if w.startswith("h") and len(w) > 1 else w  # silent h
    w = "y" + w[2:] if w.startswith("ll") else w
    return _INITIAL.get(w[:1], w[:1])


def _near(h: str, n: str, common: frozenset) -> bool:
    from difflib import SequenceMatcher
    from scripts.reconstruct.checker import sound_key  # the checker imports this module
    if h == n or _initial(h) != _initial(n):
        return False
    r = SequenceMatcher(None, h, n).ratio()
    if h in common:  # a real word: nearly the same spelling and the same start (nancy ~ Nanci, not danza ~ Diana)
        return r >= COMMON_SPELLED and h[:3] == n[:3]
    return r >= SPELLED_ALIKE or sound_key(h) == sound_key(n)


def _heard_like(value: str, raw: list[str], common: frozenset) -> bool:
    """Something heard may be a mishearing of a name in the value: spelled nearly alike or with the same sound
    (initials s/z, c/k/q, j/y/i/ll, b/v, silent h alike), a name split in two ("borda grin"), a two-word name
    heard as one ("borddagryn"), or the name without its accent ("saez" ~ Sáez). Real words need a closer
    spelling ("nancy" ~ Nanci, never "tiene" ~ Diana). A name heard right needs no fact: facts fix mishearings."""
    heard = [fold(w) for w in raw]
    all_names = tokens(value)
    single = {t for t in all_names if len(t) >= NAME_MIN}
    pairs = {a + b for a, b in zip(all_names, all_names[1:])}
    if single & {a + b for a, b in zip(heard, heard[1:])}:  # one name heard as two words
        return True
    cands = {h for h in heard if len(h) >= NAME_MIN}
    if pairs & cands:  # two names heard as one word ("macburney")
        return True
    if any(_near(h, n, common) for n in single | pairs for h in cands):
        return True
    accented = {w for w in re.findall(r"[^\W_]+", value.lower()) if fold(w) != w and fold(w) not in common}
    return any(r != a and fold(r) == fold(a) for a in accented for r in raw)


def relevant(ctx: Context, lines, common: frozenset | None = None) -> Context:
    """The context with only the facts a heard word may be a mishearing of. A new fact then changes the
    windows that may say it, not every window of the edition (2026-11-26: four presenter facts re-asked
    2,585 windows). Festival, year and the competition on stage always stay. The checker still accepts
    every name of the edition (Window.full_words)."""
    common = common_words() if common is None else common
    raw = [w for l in lines for w in re.findall(r"[^\W_]+(?:'[^\W_]+)*", l.text.replace("’", "'").lower())]
    keep, values, dropped = [], [], False
    for line in ctx.text.split("\n") if ctx.text else []:
        is_fact = line.startswith(FACT_PREFIXES)
        if is_fact and not _heard_like(line.split(": ", 1)[1], raw, common):
            dropped = True
            continue
        keep.append(line)
        values.append(line.split(": ", 1)[1] if is_fact or line.startswith("Competencia ") else line)
    if not dropped:
        return ctx
    return Context("\n".join(keep), frozenset(tokens(" ".join(values))) | BASE_WORDS)


def with_glossary(ctx: Context, lines, glossary: list[tuple[str, str]]) -> Context:
    """The context plus the glossary hints whose misheard word occurs in these lines (else unchanged)."""
    heard = {tok for l in lines for tok in tokens(l.text)}
    hits = [(h, r) for h, r in glossary if all(t in heard for t in tokens(h))]
    if not hits:
        return ctx
    text = ctx.text + "\nPalabras mal oídas conocidas: " + "; ".join(f"{h} → {r}" for h, r in hits)
    return Context(text, ctx.words | {t for _, r in hits for t in tokens(r)})


if __name__ == "__main__":
    if sys.argv[1:] == ["--palabras-comunes"]:
        print(write_common_words(Path(__file__).resolve().parents[2]), "words frozen in", COMMON_FILE)
    else:
        sys.exit("python3 -m scripts.reconstruct.context --palabras-comunes")
