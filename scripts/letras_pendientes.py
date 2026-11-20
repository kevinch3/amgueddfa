"""Which lyrics the archive needs next: sung pieces of the programas that appear in a video
with a published transcription.

  python3 -m scripts.letras_pendientes            # writes docs/letras-pendientes.md

Crosses three things the repo already has:
  - the programa transcriptions (src/data/transcripciones/, category "programa"): each sung
    competition with its pieces, «Title», composer;
  - the videos with a transcription (public/transcripciones-video/) and the competitions
    they show: "Comp. Nº 75" / "COMP. 65, 43 Y 59" / "[CH2013068]" in the title, or the
    chapters of long sessions (public/marcadores-video/);
  - the lyrics already aligned (data/letras/).

One row per piece, with every video where it is sung, so one text serves them all.
"a elección" pieces are listed apart: someone has to say which piece was sung.
The texts themselves always come from the maintainer (skill: video-lyrics).
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "docs" / "letras-pendientes.md"

VOCAL = re.compile(r"\b(coros?|c[oô]r|corau|parti|part[iï]on|unawd|solos?|solista|d[uú]o|deuawd|tr[ií]o|triawd|cuarteto|pedwarawd|"
                   r"conjunto vocal|ensamble vocal|voz|voces|lleisiau|canto|canu|c[aâ]n|emyn|himno|cerdd dant|lied|lírico)\b", re.I)
NOT_SUNG = re.compile(r"\b(instrumental|instrumento|piano solo|guitarra|viol[ií]n|flauta|arpa|telyn|teclado|recitaci[oó]n|adrodd|"
                      r"danza|dawns|teatro|comedia musical|c[aâ]n actol|cocina|fotograf)", re.I)
CHOICE = re.compile(r"a elecci[oó]n|hunanddewisiad|libre elecci[oó]n|de libre|a escoger", re.I)
# Words that are usually free to publish: liturgical Latin, traditional texts, poets and composers
# dead long ago. A hint for ordering the list, not a rights decision (the maintainer confirms).
FREE_TEXT = re.compile(r"tradicional|traddodiadol|traditional|an[oó]nim|siglo x[vi]|ave mar[ií]a|ubi caritas|cantate domino|"
                       r"gloria|kyrie|agnus dei|sanctus|bone jesu|lux aeterna|ave verum|pater noster|magnificat|salve regina|"
                       r"let all mortal flesh|es ist ein ros|h[aä]ndel|schubert|praetorius|hass?ler|mozart|bach|brahms|"
                       r"mendelssohn|joseph parry|ieuan gwyllt|pantycelyn|ann griffiths", re.I)
PIECE = re.compile(r"«([^»]+)»([^«;]*)")


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def front_items(text: str, stem: str) -> list[str]:
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    ids = [stem]
    if m:
        for line in m.group(1).splitlines():
            if line.strip().startswith("items:"):
                ids += line.split(":", 1)[1].split()
    return ids


def sung_competitions(text: str) -> dict[int, str]:
    """Numbered lines of the music section that are sung (not instrumental), {number: line}."""
    out: dict[int, str] = {}
    music: bool | None = None  # None until the first "## " section
    instrumental = False
    for line in text.splitlines():
        if line.startswith("## "):
            music = bool(re.search(r"m[uú]sica|cerddoriaeth|canto|coros", line, re.I))
            instrumental = False
        elif line.startswith("### "):
            instrumental = bool(re.search(r"instrumental|offerynnol|recitaci|adrodd|danza|dawns", line, re.I))
        m = re.match(r"^(\d{1,3})\.\s+(.*)", line)
        if not m:
            continue
        n, body = int(m.group(1)), m.group(2).strip()
        # Inside a music section, unless instrumental; with no sections at all, by its words.
        sung = (music and not instrumental) if music is not None else bool(VOCAL.search(body))
        if sung and not NOT_SUNG.search(body):
            out.setdefault(n, body)
    return out


def pieces(line: str) -> list[tuple[str, str]]:
    """(title, credit) of each «piece» in a competition line; credit is the text up to the next piece or «;»."""
    out = []
    for title, rest in PIECE.findall(line):
        credit = re.split(r";|\(|\[|\s[a-d]\)", rest.strip(" ,:"), maxsplit=1)[0].strip(" ,.:")
        credit = re.sub(r"\s+o$", "", re.sub(r"^(?:de|gan|y|e)\s+", "", credit))
        out.append((title.strip(), credit))
    return out


TITLE_COMP = re.compile(r"\bcomp(?:etencia|etici[oó]n)?\.?\s*(?:n(?:[uú]mero|ro|[º°o])?\.?\s*)?((?:\d{1,3}(?:\s*(?:,|y|e)\s*)?)+)", re.I)
CODE = re.compile(r"\[(?:CH|TR)(\d{4})(\d{3})\]")


def title_competitions(title: str) -> list[int]:
    m = CODE.search(title)
    if m:
        return [int(m.group(2))]
    m = TITLE_COMP.search(title)
    return [int(x) for x in re.findall(r"\d{1,3}", m.group(1))] if m else []


def collect(repo: Path = REPO) -> dict:
    cat = {i["id"]: i for i in json.loads((repo / "src/data/catalog.json").read_text(encoding="utf-8"))["items"]}
    programa: dict[tuple[str, int], dict[int, str]] = defaultdict(dict)
    for p in sorted((repo / "src/data/transcripciones").glob("*.md")):
        text = p.read_text(encoding="utf-8")
        item = next((cat[x] for x in front_items(text, p.stem) if x in cat), None)
        if item and item["category"] == "programa" and item.get("year"):
            for n, line in sung_competitions(text).items():
                programa[(item["festival"], int(item["year"]))].setdefault(n, line)

    have = {p.stem for p in (repo / "public/transcripciones-video").glob("*.json")}
    videos = [v for v in json.loads((repo / "src/data/videos.json").read_text(encoding="utf-8"))["videos"] if v["id"] in have]
    letras_dir = repo / "data" / "letras"
    done_spans = json.loads((letras_dir / "videos.json").read_text(encoding="utf-8")) if (letras_dir / "videos.json").exists() else {}
    done_titles = set()
    for p in letras_dir.glob("*.md"):
        m = re.search(r"^titulo:\s*(.+)$", p.read_text(encoding="utf-8"), re.M)
        if m:
            done_titles.add(fold(m.group(1)))

    by_piece: dict[tuple[str, str], dict] = {}
    choice: list[dict] = []
    for v in videos:
        key = (v["festival"], int(v["year"]))
        comps: list[tuple[int, float | None]] = [(n, None) for n in title_competitions(v["title"])]
        mk = repo / "public/marcadores-video" / f"{v['id']}.json"
        if mk.exists():
            for sec, n, *_ in json.loads(mk.read_text(encoding="utf-8")).get("markers", []):
                if str(n).isdigit():
                    comps.append((int(n), float(sec)))
        for n, sec in comps:
            line = programa.get(key, {}).get(n)
            if not line:
                continue
            where = {"video": v["id"], "t": sec, "festival": key[0], "year": key[1], "comp": n,
                     "aligned": v["id"] in done_spans}
            for title, credit in pieces(line):
                k = (fold(title), fold(credit))
                row = by_piece.setdefault(k, {"title": title, "credit": credit, "done": fold(title) in done_titles,
                                              "free": bool(FREE_TEXT.search(f"{title} {credit}")), "where": []})
                row["where"].append(where)
            if CHOICE.search(line):
                choice.append({**where, "line": line})
    return {"pieces": by_piece, "choice": choice}


def fmt_t(sec: float | None) -> str:
    if sec is None:
        return ""
    s = int(sec)
    return f" {s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f" {s // 60}:{s % 60:02d}"


def render(data: dict) -> str:
    rows = sorted(data["pieces"].values(), key=lambda r: (r["done"], not r["free"], -len({w["video"] for w in r["where"]}), fold(r["title"])))
    pending = [r for r in rows if not r["done"]]
    out = [
        "# Letras pendientes",
        "",
        "Generado por `python3 -m scripts.letras_pendientes`: no editar a mano. Cómo cargar una letra: skill `video-lyrics`.",
        "",
        f"Obras cantadas con título en el programa y video transcripto: **{len(rows)}** "
        f"({len(rows) - len(pending)} con letra, {len(pending)} pendientes). "
        f"Obras «a elección» por identificar: **{len(data['choice'])}** apariciones.",
        "",
        "Primero las de texto probablemente libre (litúrgico, tradicional, autores antiguos: una pista, los derechos los confirma el mantenedor), "
        "después por cantidad de videos (una letra sirve para todos). Para cada una hace falta el texto **tal como se canta**, en su idioma.",
        "",
        "| Obra | Autoría (programa) | Texto | Videos | Dónde | Estado |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        vids = sorted({w["video"] for w in r["where"]})
        where = "; ".join(sorted({f"{w['festival']} {w['year']} comp. {w['comp']}" for w in r["where"]}))
        links = " ".join(f"[{w['video']}{fmt_t(w['t'])}](https://www.youtube.com/watch?v={w['video']}" + (f"&t={int(w['t'])}s" if w["t"] else "") + ")"
                         for w in sorted(r["where"], key=lambda w: (w["year"], w["video"]))[:4])
        out.append(f"| {r['title']} | {r['credit'] or '—'} | {'probablemente libre' if r['free'] else 'verificar derechos'} | {len(vids)} | {where}<br>{links} | {'✅ cargada' if r['done'] else 'pendiente'} |")
    out += ["", "## Obras «a elección» (identificar primero cuál se cantó)", "",
            "Escuchar el video o leer el anuncio; con el título, la letra se pide como cualquier otra.", "",
            "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
    for c in sorted(data["choice"], key=lambda c: (c["festival"], c["year"], c["comp"], c["video"])):
        line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
        out.append(f"| {c['festival']} {c['year']} | {c['comp']} | {line} | [{c['video']}{fmt_t(c['t'])}](https://www.youtube.com/watch?v={c['video']}"
                   + (f"&t={int(c['t'])}s" if c["t"] else "") + ") |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    OUT.write_text(render(collect()), encoding="utf-8")
    d = collect()
    print(f"{OUT.relative_to(REPO)}: {len(d['pieces'])} pieces, {sum(not r['done'] for r in d['pieces'].values())} pending, {len(d['choice'])} a elección")
