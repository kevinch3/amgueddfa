"""Which lyrics the archive needs next: sung pieces of the programas that appear in a video
with a published transcription.

  python3 -m scripts.letras_pendientes            # writes docs/letras-pendientes.md

Crosses three things the repo already has:
  - the programa transcriptions (src/data/transcripciones/, category "programa"): each sung
    competition with its pieces, «Title», composer;
  - the videos with a transcription (public/transcripciones-video/) and the competitions
    they show: "Comp. Nº 75" / "COMP. 65, 43 Y 59" / "[CH2013068]" in the title, or the
    chapters of long sessions (public/marcadores-video/);
  - the lyrics: the texts (data/letras/*.md) and where each is aligned (data/letras/videos.json).

One row per piece, with every video where it is sung, so one text serves them all. A video
counts as done only when it has a span of that piece's text; a saved text with no span is a gap.
"a elección" pieces are listed apart: someone has to say which piece was sung.
The texts themselves always come from the maintainer (skill: video-lyrics).

Why a gap stays open is curated in data/letras/huecos.json (see MOTIVOS): one entry per piece
or per video, keyed by the text's slug when the text exists, else by the programa title. The
entries describe the gap without quoting anything sung. A slug, title, video or code the report
does not know raises, so a typo never drops a gap silently; so does an entry for a video that is
already aligned.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from scripts.align_lyrics import parse_letra
from scripts.export_video_transcripts import FESTIVALS

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "docs" / "letras-pendientes.md"
HUECOS = REPO / "data" / "letras" / "huecos.json"

# Why a piece (or one of its videos) has no aligned lyric: code -> (label, what would close it).
# The order is the order of the summary table.
MOTIVOS = {
    "falta_texto": ("falta el texto",
                    "El mantenedor consigue el texto tal como se canta, en su idioma (skill `video-lyrics`)."),
    "sin_alinear": ("sin motivo registrado",
                    "Hay texto pero no tramo ni motivo anotado: una pasada de alineación (skill `video-lyrics`); "
                    "si no se puede alinear, anotar el motivo en `data/letras/huecos.json`."),
    "texto_distinto": ("el texto no coincide con lo que se canta",
                       "El mantenedor revisa la fuente y manda el texto tal como se canta "
                       "(estrofas que faltan, estribillos escritos donde se repiten)."),
    "estrofa_omitida": ("se canta sin una estrofa",
                        "Que el alineador acepte, por tramo, qué estrofas se cantan (#129)."),
    "gales_insuficiente": ("el reconocedor galés oyó muy poco",
                           "Reintentar cuando termine la pasada del modelo galés (en curso); si sigue igual, "
                           "probar un filtro de confianza más bajo dentro de los tramos con letra (#129)."),
    "alineador": ("el alineador amontona las líneas",
                  "Que el alineador no se ancle en palabras sueltas o mal oídas, por ejemplo repartiendo "
                  "desde el inicio del tramo cuando lo oído es poco (#129)."),
    "no_esta_en_video": ("no se canta en ese video",
                         "Nada que alinear ahí: hace falta otra grabación de esa actuación, o corregir a qué "
                         "competencia apunta el video."),
    "version_por_confirmar": ("versión por confirmar",
                              "El mantenedor confirma qué versión (y qué texto) se canta; después se pide el texto "
                              "o se reusa uno guardado."),
    "instrumental": ("instrumental, sin letra", "No es un hueco de letra: no se cuenta."),
    "a_eleccion": ("obra «a elección» sin identificar",
                   "Escuchar el anuncio o el video para saber qué obra se cantó; con el título, la letra se pide "
                   "como cualquier otra (lista al final)."),
}
COMPUTED = {"falta_texto", "sin_alinear", "a_eleccion"}  # set by the report, never written in huecos.json
ENTRY_KEYS = {"letra", "obra", "autoria", "videos", "motivo", "detalle"}
SIN_IDENTIFICAR = ("actuación sin identificar",
                   "Videos sin texto publicado cuyo título y capítulos no llevan a una competencia cantada del "
                   "programa: darles texto y escuchar qué se canta; entonces entran aquí como obra o «a elección».")

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


# A clip whose title says it is not a song (for the count of performances nobody has identified).
NOT_A_SONG = re.compile(NOT_SUNG.pattern + r"|\bsolo guitarra|\bpiano\b|\bmalambo|\bzapateo|\bbaile", re.I)


def load_huecos(path: Path = HUECOS) -> list:
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    bad = sorted(set(doc) - {"nota", "huecos"}) if isinstance(doc, dict) else ["(no es un objeto)"]
    if bad:
        raise ValueError(f"{path.name}: clave desconocida {bad}; se esperaba 'nota' y 'huecos'")
    if not isinstance(doc.get("huecos", []), list):
        raise ValueError(f"{path.name}: 'huecos' es una lista de entradas")
    return doc.get("huecos", [])


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
    all_videos = json.loads((repo / "src/data/videos.json").read_text(encoding="utf-8"))["videos"]
    letras_dir = repo / "data" / "letras"
    letras = {}
    for p in sorted(letras_dir.glob("*.md")):
        meta, _ = parse_letra(p.read_text(encoding="utf-8"))
        if meta.get("titulo"):
            letras[p.stem] = {"titulo": meta["titulo"], "autor": meta.get("autor", ""), "programa": meta.get("programa", "")}
    span_file = letras_dir / "videos.json"
    spans_raw = json.loads(span_file.read_text(encoding="utf-8")) if span_file.exists() else {}
    spans = {v: sorted({s["letra"] for s in ss}) for v, ss in spans_raw.items()}

    def competitions(v: dict) -> list[tuple[int, float | None]]:
        comps: list[tuple[int, float | None]] = [(n, None) for n in title_competitions(v["title"])]
        mk = repo / "public/marcadores-video" / f"{v['id']}.json"
        if mk.exists():
            for sec, n, *_ in json.loads(mk.read_text(encoding="utf-8")).get("markers", []):
                if str(n).isdigit():
                    comps.append((int(n), float(sec)))
        return comps

    by_piece: dict[tuple[str, str], dict] = {}
    choice: list[dict] = []
    reached = set()
    for v in all_videos:
        key = (v["festival"], int(v["year"]))
        for n, sec in competitions(v):
            line = programa.get(key, {}).get(n)
            if not line:
                continue
            reached.add(v["id"])
            if v["id"] not in have:
                continue
            where = {"video": v["id"], "t": sec, "festival": key[0], "year": key[1], "comp": n}
            for title, credit in pieces(line):
                k = (fold(title), fold(credit))
                row = by_piece.setdefault(k, {"title": title, "credit": credit,
                                              "free": bool(FREE_TEXT.search(f"{title} {credit}")), "where": []})
                row["where"].append(where)
            if CHOICE.search(line):
                choice.append({**where, "line": line})
    sin_identificar = sum(1 for v in all_videos if v["festival"] in FESTIVALS and v["id"] not in have
                          and v["id"] not in reached and not NOT_A_SONG.search(v["title"]))
    return {"pieces": by_piece, "choice": choice, "letras": letras, "spans": spans,
            "videos": {v["id"] for v in all_videos}, "huecos": load_huecos(letras_dir / "huecos.json"),
            "sin_identificar": sin_identificar}


def _authors(s: str) -> set[str]:
    return set(re.findall(r"[a-z]{4,}", fold(s)))


def text_for(title: str, credit: str, letras: dict) -> str | None:
    """The saved text of a piece: same title; when several settings share it, the one whose author matches."""
    cands = sorted(s for s, m in letras.items() if fold(m["titulo"]) == fold(title))
    if len(cands) <= 1:
        return cands[0] if cands else None
    score = {s: len(_authors(credit) & _authors(letras[s]["autor"])) for s in cands}
    best = [s for s in cands if score[s] == max(score.values())]
    return best[0] if len(best) == 1 and score[best[0]] else None


def assess(data: dict) -> dict:
    """Each piece with its text (if any) and a state per video: "ok" (aligned) or a MOTIVOS code.

    Raises ValueError for a huecos.json entry the report cannot place."""
    letras, spans = data["letras"], data["spans"]

    def placed(slug, v):
        return bool(slug) and slug in spans.get(v, ())

    rows = []
    for _, p in sorted(data["pieces"].items()):
        slug = text_for(p["title"], p["credit"], letras)
        vids = sorted({w["video"] for w in p["where"]})
        rows.append({**p, "slug": slug, "videos": vids, "state": {v: "ok" if placed(slug, v) else None for v in vids},
                     "extra": False, "instrumental": None})
    used = {r["slug"] for r in rows if r["slug"]}
    extra = {}
    for s in sorted(set(letras) - used):  # texts whose piece is not in the table («a elección», no chapter…)
        vids = sorted(v for v, ss in spans.items() if s in ss)
        extra[s] = {"title": letras[s]["titulo"], "credit": letras[s]["autor"], "programa": letras[s]["programa"],
                    "free": False, "where": [{"video": v, "t": None} for v in vids], "slug": s, "videos": vids,
                    "state": {v: "ok" for v in vids}, "extra": True, "instrumental": None}

    entries = []
    for i, e in enumerate(data["huecos"], 1):
        at = f"huecos.json, entrada {i}"
        if not isinstance(e, dict):
            raise ValueError(f"{at}: no es un objeto")
        bad = sorted(set(e) - ENTRY_KEYS)
        if bad:
            raise ValueError(f"{at}: campo desconocido {bad}")
        code = e.get("motivo")
        if code not in MOTIVOS or code in COMPUTED:
            raise ValueError(f"{at}: motivo desconocido o automático {code!r}; "
                             f"válidos: {', '.join(c for c in MOTIVOS if c not in COMPUTED)}")
        if not isinstance(e.get("detalle"), str) or not e["detalle"].strip():
            raise ValueError(f"{at}: falta el detalle (una oración, sin citar lo cantado)")
        if ("letra" in e) == ("obra" in e):
            raise ValueError(f"{at}: hace falta 'letra' (slug de data/letras) u 'obra' (título del programa), una sola")
        if "letra" in e:
            if "autoria" in e:
                raise ValueError(f"{at}: 'autoria' va solo con 'obra'")
            slug = e["letra"]
            if slug not in letras:
                raise ValueError(f"{at}: letra desconocida {slug!r}: no existe data/letras/{slug}.md")
            targets = [r for r in rows if r["slug"] == slug] or [extra[slug]]
            name = f"«{letras[slug]['titulo']}»" + (f" ({letras[slug]['autor']})" if letras[slug]["autor"] else "")
        else:
            obra, autoria = e["obra"], e.get("autoria")
            targets = [r for r in rows if fold(r["title"]) == fold(obra)
                       and (autoria is None or fold(r["credit"]) == fold(autoria))]
            if not targets:
                raise ValueError(f"{at}: obra desconocida {obra!r}" + (f" con autoría {autoria!r}" if autoria else "")
                                 + ": se escribe como en la tabla (título y autoría del programa)")
            with_text = sorted({r["slug"] for r in targets if r["slug"]})
            if with_text and autoria is None and any(not r["slug"] for r in targets):
                raise ValueError(f"{at}: varias obras se llaman {obra!r} y alguna tiene texto: agregar 'autoria'")
            if with_text:
                raise ValueError(f"{at}: {obra!r} tiene texto guardado: usar \"letra\": \"{with_text[0]}\"")
            name = f"«{obra}»" + (f" ({autoria})" if autoria else "")
        is_extra = targets[0]["extra"]
        known = sorted({v for r in targets for v in r["videos"]})
        vids = e.get("videos")
        if vids is not None:
            if not isinstance(vids, list) or not vids or not all(isinstance(v, str) for v in vids):
                raise ValueError(f"{at}: 'videos' es una lista de ids de YouTube")
            for v in vids:
                if v not in (data["videos"] if is_extra else known):
                    raise ValueError(f"{at}: el video {v!r} no es de {name}" + ("" if is_extra else f" (sus videos: {', '.join(known)})"))
        elif is_extra:
            raise ValueError(f"{at}: {name} no está en la tabla del programa: hace falta 'videos'")
        if code == "instrumental" and vids:
            raise ValueError(f"{at}: 'instrumental' vale para la obra entera, sin 'videos'")
        cover = sorted(set(vids or known))
        done = [v for v in cover if any(placed(r["slug"], v) for r in targets)]
        if vids and done:
            raise ValueError(f"{at}: {name} ya está alineada en {done[0]}: sacar ese video de la entrada")
        if len(done) == len(cover):
            raise ValueError(f"{at}: {name} ya está alineada en todos sus videos: borrar la entrada")
        for r in targets:
            if is_extra:
                r["videos"] = sorted(set(r["videos"]) | set(cover))
                r["where"] = [{"video": v, "t": None} for v in r["videos"]]
                for v in cover:
                    r["state"].setdefault(v, None)
            for v in cover:
                if v not in r["state"] or r["state"][v] == "ok":
                    continue
                if r["state"][v] is not None:
                    raise ValueError(f"{at}: {name} en {v} ya tiene motivo {r['state'][v]!r} (una entrada por video)")
                r["state"][v] = code
            if code == "instrumental":
                r["instrumental"] = e["detalle"].strip()
        entries.append({"name": name, "code": code, "detalle": e["detalle"].strip(), "targets": targets,
                        "videos": [v for v in cover if v not in done]})

    every = rows + list(extra.values())
    for r in every:
        for v in r["videos"]:
            if r["state"][v] is None:
                r["state"][v] = "sin_alinear" if r["slug"] else "falta_texto"
    instrumental = [r for r in every if r["instrumental"] is not None]
    rows = [r for r in rows if r["instrumental"] is None]
    extra_rows = [r for r in extra.values() if r["instrumental"] is None]

    counts: dict[str, tuple[set, set]] = {c: (set(), set()) for c in MOTIVOS}
    for r in rows + extra_rows:
        codes = set(r["state"].values()) if r["videos"] else {"sin_alinear"}
        for c in codes - {"ok"}:
            counts[c][0].add((r["title"], r["credit"], r["slug"]))
        for v, c in r["state"].items():
            if c != "ok":
                counts[c][1].add(v)
    counts["a_eleccion"][1].update(c["video"] for c in data["choice"])
    return {"rows": rows, "extra": extra_rows, "instrumental": instrumental, "entries": entries,
            "counts": {c: (len(p), len(v)) for c, (p, v) in counts.items()}}


def fmt_t(sec: float | None) -> str:
    if sec is None:
        return ""
    s = int(sec)
    return f" {s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f" {s // 60}:{s % 60:02d}"


def link(video: str, t: float | None) -> str:
    return f"[{video}{fmt_t(t)}](https://www.youtube.com/watch?v={video}" + (f"&t={int(t)}s" if t else "") + ")"


def estado(r: dict) -> str:
    states = [r["state"][v] for v in r["videos"]]
    if not states:
        return f"texto guardado, sin alinear: {MOTIVOS['sin_alinear'][0]}"
    ok = states.count("ok")
    labels = "; ".join(MOTIVOS[c][0] for c in MOTIVOS if c in states)
    if ok == len(states):
        return "✅ alineada"
    if ok:
        return f"✅ {ok} de {len(states)} videos; sin alinear en {len(states) - ok}: {labels}"
    return f"texto guardado, sin alinear: {labels}" if r["slug"] else labels


def links(r: dict, where: list[dict]) -> str:
    """Up to four videos; marked ✅ / ✗ when some are aligned and some are not."""
    states = set(r["state"].values())
    mark = "ok" in states and len(states) > 1
    return " ".join((("✅ " if r["state"][w["video"]] == "ok" else "✗ ") if mark else "") + link(w["video"], w["t"])
                    for w in where[:4])


def render(data: dict) -> str:
    a = assess(data)
    rows = sorted(a["rows"], key=lambda r: (r["slug"] is not None, not r["free"], -len(r["videos"]), fold(r["title"]), fold(r["credit"])))
    n_ok = sum(all(s == "ok" for s in r["state"].values()) for r in rows)
    n_part = sum(any(s == "ok" for s in r["state"].values()) for r in rows) - n_ok
    n_saved = sum(bool(r["slug"]) for r in rows) - n_ok - n_part
    counts = a["counts"]
    out = [
        "# Letras pendientes",
        "",
        "Generado por `python3 -m scripts.letras_pendientes`: no editar a mano. Cómo cargar una letra: skill `video-lyrics`. "
        "Los motivos de cada hueco: `data/letras/huecos.json`.",
        "",
        f"Obras cantadas con título en el programa y video transcripto: **{len(rows)}** "
        f"({n_ok} alineadas en todos sus videos, {n_part} en parte, {n_saved} con texto guardado sin alinear, "
        f"{len(rows) - n_ok - n_part - n_saved} sin texto). "
        f"Obras «a elección» por identificar: **{len(data['choice'])}** apariciones. "
        f"Actuaciones sin identificar: **{data.get('sin_identificar', 0)}** videos.",
        "",
        "## Huecos documentados",
        "",
        "No todas las letras van a llegar; cada hueco queda anotado con su motivo. Los motivos vienen de "
        "`data/letras/huecos.json` (curado: una entrada por obra o por video, sin citar nada de lo que se canta); "
        "«falta el texto» y «sin motivo registrado» son los estados por omisión. Cada caso, en "
        "[Detalle de los huecos documentados](#detalle-de-los-huecos-documentados).",
        "",
        "| Motivo | Obras | Videos | Qué lo cierra |",
        "|---|---|---|---|",
    ]
    for c, (label, closes) in MOTIVOS.items():
        n_p, n_v = counts[c]
        if c == "instrumental" or not (n_p or n_v):
            continue
        if c == "a_eleccion":
            closes = closes.replace("(lista al final)", f"({len(data['choice'])} apariciones, lista al final)")
            out.append(f"| {label} | — | {n_v} | {closes} |")
        else:
            out.append(f"| {label} | {n_p} | {n_v} | {closes} |")
    if data.get("sin_identificar"):
        out.append(f"| {SIN_IDENTIFICAR[0]} | — | {data['sin_identificar']} | {SIN_IDENTIFICAR[1]} |")
    out += ["",
            "La pasada del modelo galés sobre todos los videos publicados está en curso. Cuando termine, se reintentan "
            "las obras de «el reconocedor galés oyó muy poco»: videos donde ese reconocedor oyó muy poco del canto, "
            "o que no tenían fuente en galés.",
            ""]
    for r in sorted(a["instrumental"], key=lambda r: fold(r["title"])):
        out.append(f"No es un hueco de letra (fuera de las cuentas): «{r['title']}» ({r['credit'] or '—'}), "
                   f"{len(r['videos'])} videos. {r['instrumental']}")
    if a["instrumental"]:
        out.append("")
    out += [
        "## Obras del programa",
        "",
        "Primero las de texto probablemente libre (litúrgico, tradicional, autores antiguos: una pista, los derechos los confirma el mantenedor), "
        "después por cantidad de videos (una letra sirve para todos). Para cada una hace falta el texto **tal como se canta**, en su idioma. "
        "«✅ alineada» cuenta solo los videos con el tramo de esa obra en `data/letras/videos.json`; donde unos videos lo tienen y otros no, "
        "«Dónde» marca cada uno con ✅ o ✗.",
        "",
        "| Obra | Autoría (programa) | Texto | Videos | Dónde | Estado |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        where = "; ".join(sorted({f"{w['festival']} {w['year']} comp. {w['comp']}" for w in r["where"]}))
        ws = sorted(r["where"], key=lambda w: (w["year"], w["video"]))
        out.append(f"| {r['title']} | {r['credit'] or '—'} | {'probablemente libre' if r['free'] else 'verificar derechos'} | "
                   f"{len(r['videos'])} | {where}<br>{links(r, ws)} | {estado(r)} |")
    if a["extra"]:
        out += ["", "## Textos guardados fuera de la tabla", "",
                "Letras de obras «a elección» ya identificadas, o de obras cuyo video no llega a la competencia por título ni capítulo.", "",
                "| Obra | Autoría | Programa | Dónde | Estado |", "|---|---|---|---|---|"]
        for r in sorted(a["extra"], key=lambda r: (fold(r["title"]), r["slug"])):
            out.append(f"| {r['title']} | {r['credit'] or '—'} | {r['programa'] or '—'} | {links(r, r['where']) or '—'} | {estado(r)} |")
    out += ["", "## Detalle de los huecos documentados", "",
            "Lo anotado en `data/letras/huecos.json`, por motivo; cada video enlazado es uno sin alinear.", ""]
    for c, (label, _) in MOTIVOS.items():
        es = sorted((e for e in a["entries"] if e["code"] == c), key=lambda e: (fold(e["name"]), e["videos"]))
        if not es or c == "instrumental":
            continue
        out += [f"### {label[0].upper()}{label[1:]}", ""]
        for e in es:
            ts = {(w["video"], w["t"]) for r in e["targets"] for w in r["where"] if w["video"] in e["videos"]}
            vids = " ".join(link(v, t) for v, t in sorted(ts, key=lambda x: (x[0], x[1] or 0)))
            out.append(f"- {e['name']}: {vids}. {e['detalle']}")
        out.append("")
    out += ["## Obras «a elección» (identificar primero cuál se cantó)", "",
            "Escuchar el video o leer el anuncio; con el título, la letra se pide como cualquier otra.", "",
            "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
    for c in sorted(data["choice"], key=lambda c: (c["festival"], c["year"], c["comp"], c["video"])):
        line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
        out.append(f"| {c['festival']} {c['year']} | {c['comp']} | {line} | {link(c['video'], c['t'])} |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    d = collect()
    OUT.write_text(render(d), encoding="utf-8")
    a = assess(d)
    pending = sum(any(s != "ok" for s in r["state"].values()) for r in a["rows"])
    print(f"{OUT.relative_to(REPO)}: {len(a['rows'])} pieces, {pending} with a gap, {len(a['entries'])} documented, "
          f"{len(d['choice'])} a elección, {d['sin_identificar']} unidentified")
