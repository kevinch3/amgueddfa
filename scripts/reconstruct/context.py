"""What the model should know about a window: which competition is on, the edition's
approved facts, and the words those give (the word list the checker accepts)."""
from __future__ import annotations

import hashlib
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
        if not item or item.get("tipo") != "programa" or item.get("coleccion") != festival or (item.get("fecha") or {}).get("year") != year:
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
    festival, year = video["coleccion"], int(video["fecha"]["year"])
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
        if (c.get("type") == "fact" and c.get("status", "approved") == "approved" and c.get("coleccion") == festival
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
    if not COMMON_FILE.exists():
        sys.exit(f"{COMMON_FILE} missing: python3 -m scripts.reconstruct.context --palabras-comunes")
    raw = SPANISH_DICT.read_bytes()
    pinned = re.search(r"^# spanish-dict-sha256: ([0-9a-f]{64})$", COMMON_FILE.read_text(encoding="utf-8"), re.M)
    if pinned and pinned.group(1) != hashlib.sha256(raw).hexdigest():
        sys.exit(f"{SPANISH_DICT} changed since {COMMON_FILE.name} was written: window keys would change. "
                 "Regenerate it on purpose (--palabras-comunes), then dry-run before asking anything.")
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
    sha = hashlib.sha256(SPANISH_DICT.read_bytes()).hexdigest() if SPANISH_DICT.exists() else ""
    path.write_text(f"# Words in {min_videos}+ published video transcripts: not mishearings of a name.\n"
                    + (f"# spanish-dict-sha256: {sha}\n" if sha else "")
                    + "# Frozen on purpose (window keys depend on it): python3 -m scripts.reconstruct.context --palabras-comunes\n"
                    + "\n".join(words) + "\n", encoding="utf-8")
    return len(words)


FUNCTION_WORDS = frozenset("de del la las los el y e por con en a ap van von".split())
_PUNCT = re.compile(r"[,;:()«»\"“”]")


def _name_parts(value: str) -> tuple[set, set]:
    """The value's name words (no function words, no always-known places) and the joins of adjacent name
    words inside one stretch between punctuation ("Mac Burney" -> macburney, never "jones"+"de")."""
    single, pairs = set(), set()
    for run in _PUNCT.split(value):
        toks = tokens(run)
        single |= {t for t in toks if len(t) >= NAME_MIN and t not in FUNCTION_WORDS and t not in BASE_WORDS}
        pairs |= {x + y for x, y in zip(toks, toks[1:]) if x not in FUNCTION_WORDS and y not in FUNCTION_WORDS}
    return single, pairs


def _initial(w: str) -> str:
    """The first sound, in the classes the recognisers confuse: silent h, vowels, ll/y/j/i, ge/gi, ce/ci, gu/w."""
    w = w[1:] if w.startswith("h") and len(w) > 1 else w
    if w.startswith("ll") or w[:2] in ("ge", "gi"):
        return "y"
    if w[:2] in ("ce", "ci"):
        return "s"
    if w[:2] in ("gu", "hu") and w[2:3] in tuple("aeiou"):
        return "w"
    if w[:1] in tuple("aeiouy"):
        return "a"
    return _INITIAL.get(w[:1], w[:1])


def _near(h: str, n: str, strict: bool) -> bool:
    from difflib import SequenceMatcher
    from scripts.reconstruct.checker import sound_key  # the checker imports this module
    if h == n or _initial(h) != _initial(n):
        return False
    r = SequenceMatcher(None, h, n).ratio()
    if strict:  # the heard word is a real word: nearly the same spelling and start (nancy ~ Nanci, not danza ~ Diana)
        return r >= COMMON_SPELLED and h[:3] == n[:3]
    return r >= SPELLED_ALIKE or sound_key(h) == sound_key(n)


def _heard_like(value: str, raw: list[str], common: frozenset) -> bool:
    """A heard word may be a mishearing of a name in the value: spelled nearly alike or with the same sound
    (initial classes alike), an exact Welsh mutation of it ("fyfyrwyr" ~ Myfyrwyr), a name split in two
    ("borda grin"), two names heard as one ("macburney"), or the name without its accent ("saez" ~ Sáez).
    A word heard exactly as a name brings nothing (facts fix mishearings), and a real word needs a very close
    spelling, its Welsh variants included ("romana" never brings Ramona)."""
    from scripts.reconstruct.checker import _radicals
    heard = [fold(w) for w in raw]
    single, pairs = _name_parts(value)
    names = single | pairs
    if single & {x + y for x, y in zip(heard, heard[1:])} or pairs & set(heard):
        return True
    for h in {h for h in heard if len(h) >= NAME_MIN and h not in names}:
        strict = h in common
        for r in _radicals(h):
            if (r != h and r in names) or any(_near(r, n, strict) for n in names):
                return True
    accented = {w for w in re.findall(r"[^\W_]+", value.lower()) if fold(w) != w and fold(w) not in common}
    return any(r != x and fold(r) == fold(x) for x in accented for r in raw)


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
