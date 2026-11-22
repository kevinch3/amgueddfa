"""Which lyrics the archive needs next: sung pieces of the programas that appear in a video
with a published transcription, and what keeps each gap open.

  python3 -m scripts.letras_pendientes            # writes docs/letras-pendientes.md

Crosses three things the repo already has:
  - the programa transcriptions (src/data/transcripciones/, category "programa"): each sung
    competition with its pieces, «Title», composer;
  - the videos (src/data/videos.json), which of them have a transcription
    (public/transcripciones-video/) and the competitions they show: "Comp. Nº 75" /
    "COMP. 65, 43 Y 59" / "[CH2013068]" in the title, or the chapters of long sessions
    (public/marcadores-video/);
  - the lyrics: the texts (data/letras/*.md) and where each is aligned (data/letras/videos.json).

One row per piece, with every video where it is sung, so one text serves them all. A video reaches
a piece through a competition of its title or chapters, through a span of the piece's text, or
because its title names a saved text (word for word, and only when no other text or programa
setting shares that title). A video counts as done only when it has a span of that piece's text;
a saved text with no span is a gap. "a elección" pieces, and competitions that offer alternatives
(«A», «B» o «C»), are listed apart: someone has to say which piece was sung. A clip with a single
performance leaves that list once its piece is known (a span, a gap entry or its title).

The table leaves some videos out, and the report counts them: sung competitions whose videos have
no published text, videos of editions with no programa transcribed, and performances that nobody
has placed in a competition (with or without text: giving a video text does not place it).
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

# The Welsh model pass over every published video (on KPC) is running; set to False when it ends,
# in the commit that retries the «gales_insuficiente» pieces.
GALES_EN_CURSO = True

# Why a piece (or one of its videos) has no aligned lyric: code -> (label, what would close it).
# The order is the order of the summary table. COMPUTED codes are set by the report; the others
# come from data/letras/huecos.json. The last three count videos that are not in the programa table.
MOTIVOS = {
    "falta_texto": ("falta el texto",
                    "El mantenedor consigue el texto tal como se canta, en su idioma (skill `video-lyrics`)."),
    "sin_alinear": ("sin motivo registrado",
                    "Hay texto pero no tramo ni motivo anotado: una pasada de alineación (skill `video-lyrics`); "
                    "si no se puede alinear, anotar el motivo en `data/letras/huecos.json`."),
    "texto_distinto": ("el texto no coincide con lo que se canta",
                       "El mantenedor revisa la fuente y manda el texto tal como se canta "
                       "(estrofas que faltan, estribillos escritos donde se repiten)."),
    "por_confirmar": ("motivo por confirmar",
                      "El mantenedor confirma lo que el detalle deja abierto; después la entrada pasa al motivo "
                      "que corresponda."),
    "estrofa_omitida": ("se canta sin una estrofa",
                        "Que el alineador acepte, por tramo, qué estrofas se cantan (#129)."),
    "gales_insuficiente": ("el reconocedor galés oyó muy poco",
                           "Reintentar {pasada}; si sigue igual, probar un filtro de confianza más bajo dentro "
                           "de los tramos con letra (#129)."),
    "alineador": ("el alineador amontona las líneas",
                  "Que el alineador no se ancle en palabras sueltas o mal oídas, por ejemplo repartiendo "
                  "desde el inicio del tramo cuando lo oído es poco (#129)."),
    "ubicable_desde_clip": ("se puede ubicar ya desde un clip alineado",
                            "Correr el tramo del clip ya alineado por el desfase que da el detalle y agregarlo "
                            "a este video (skill `video-lyrics`); después, sacar el video de la entrada."),
    "no_esta_en_video": ("no se canta en ese video",
                         "Nada que alinear ahí: hace falta otra grabación de esa actuación, o corregir a qué "
                         "competencia apunta el video."),
    "version_por_confirmar": ("versión por confirmar",
                              "El mantenedor confirma qué versión (y qué texto) se canta; después se pide el texto "
                              "o se reusa uno guardado."),
    "instrumental": ("instrumental, sin letra", "No es un hueco de letra: no se cuenta."),
    "a_eleccion": ("obra «a elección» sin identificar",
                   "Escuchar el anuncio o el video para saber qué obra se cantó (o cuál de las alternativas del "
                   "programa); con el título, la letra se pide como cualquier otra ({n} apariciones, lista al final)."),
    "sin_texto_video": ("el video no tiene texto publicado",
                        "Que el video tenga texto publicado (subtítulos, Whisper o reconstrucción: "
                        "`scripts/export_video_transcripts.py`); entonces entra en la tabla con sus obras. Lista en "
                        "[Obras en videos sin texto publicado](#obras-en-videos-sin-texto-publicado)."),
    "edicion_sin_programa": ("edición sin programa transcripto",
                             "Transcribir el programa de la edición (skill `programa-transcription`); hasta entonces, "
                             "de esos videos solo entran los que tienen una letra alineada o nombran en su título "
                             "una obra con texto guardado."),
    "actuacion_sin_identificar": ("actuación sin identificar",
                                  "({con} con texto publicado, {sin} sin texto.) Videos de ediciones con programa cuyo "
                                  "título y capítulos no nombran ninguna competencia: saber por el anuncio de cuál es y "
                                  "anotarlo (en una sesión, con un capítulo en `public/marcadores-video/`). Darle texto "
                                  "no alcanza: un video entra en la tabla solo cuando su título, sus capítulos o una "
                                  "letra alineada lo llevan a una competencia cantada."),
}
COMPUTED = {"falta_texto", "sin_alinear", "a_eleccion", "sin_texto_video", "edicion_sin_programa",
            "actuacion_sin_identificar"}
ENTRY_KEYS = {"letra", "obra", "autoria", "videos", "desde", "motivo", "detalle"}
NOT_PERFORMANCE = {"ceremonia", "noticia"}  # video kinds that are not a competition performance


def cierre(code: str, **fill) -> str:
    """What would close a gap of this code, with its counts filled in."""
    text = MOTIVOS[code][1]
    if code == "gales_insuficiente":
        fill["pasada"] = ("cuando termine la pasada del modelo galés (en curso)" if GALES_EN_CURSO
                          else "con el texto de la pasada del modelo galés")
    return text.format(**fill) if fill else text


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
QUOTE = re.compile(r"«([^»]+)»")
# The word right before a nickname inside a name: Gustavo «Cuchi» Leguizamón, obra de «Cuchi» Leguizamón.
NAME_BEFORE = re.compile(r"(?:^|\s)(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+|de|del)\s$")
ALT_SEP = re.compile(r"^\s*,?\s*(?:o|u|neu|or)\s*$")  # «A» o «B», «A», «B» neu «C»: one of them is sung
LIST_SEP = re.compile(r"^\s*,\s*$")
JOINERS = {"a", "y", "e", "and", "o", "u", "neu", "or"}


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


def _quotes(line: str) -> list[tuple[re.Match, str]]:
    """Each «…» of a programa line with its role: "obra" (a piece), "apodo" (a one-word nickname inside a
    name: Gustavo «Cuchi» Leguizamón, obra de «Cuchi» Leguizamón) or "mayor" (the larger work a piece
    comes from, right after it: del «Stabat Mater», (de «Xerxes»)); those two are part of a credit."""
    out: list[tuple[re.Match, str]] = []
    for m in QUOTE.finditer(line):
        before, after = line[:m.start()], line[m.end():]
        if " " not in m.group(1).strip() and re.match(r" [A-ZÁÉÍÓÚÑ]", after) and NAME_BEFORE.search(before):
            role = "apodo"
        elif any(r == "obra" for _, r in out) and re.search(r"\bdel?\s$", before) and re.match(r"\)?\s*(?:[,.;]|$)", after):
            role = "mayor"
        else:
            role = "obra"
        out.append((m, role))
    return out


def _parse(line: str) -> tuple[list[tuple[str, str]], list[list[str]]]:
    """(set pieces with their credits, groups of alternatives) of a competition line."""
    obras = [m for m, role in _quotes(line) if role == "obra"]
    groups: list[tuple[list[re.Match], bool]] = []
    for i, m in enumerate(obras):
        sep = line[obras[i - 1].end():m.start()] if i else None
        if sep is not None and (ALT_SEP.match(sep) or LIST_SEP.match(sep)):
            run, alt = groups[-1]
            groups[-1] = (run + [m], alt or bool(ALT_SEP.match(sep)))
        else:
            groups.append(([m], False))
    alternatives = [[m.group(1).strip() for m in run] for run, alt in groups if alt]
    in_alt = {m.start() for run, alt in groups if alt for m in run}
    out = []
    for i, m in enumerate(obras):
        if m.start() in in_alt:
            continue
        rest = line[m.end():obras[i + 1].start() if i + 1 < len(obras) else len(line)]
        rest = re.sub(r"\(\s*(del?\s+«[^»]+»)\s*\)", r"\1", rest)  # (de «Xerxes») -> de «Xerxes»
        credit = re.split(r";|\(|\[|\s[a-d]\)", rest.strip(" ,:"), maxsplit=1)[0].strip(" ,.:")
        credit = re.sub(r"\s+(?:o|u|neu|or)$", "", re.sub(r"^(?:de|gan|y|e)\s+(?!«)", "", credit))
        out.append((m.group(1).strip(), "" if credit.lower() in JOINERS else credit))
    return out, alternatives


def pieces(line: str) -> list[tuple[str, str]]:
    """(title, credit) of each set «piece» in a competition line; credit is the text up to the next piece or «;».
    Alternatives («A» o «B») are not set pieces: see is_choice."""
    return _parse(line)[0]


def is_choice(line: str) -> bool:
    """Whether someone has to say which piece was sung: «a elección», or alternatives to pick from."""
    return bool(CHOICE.search(line)) or bool(_parse(line)[1])


PROGRAMA_REF = re.compile(r"^\s*(\w+)\s+(\d{4})\s+comp\.?\s*(\d{1,3})\b", re.I)


def programa_ref(s: str) -> tuple[str, int, int] | None:
    """(festival, year, comp) of a text's `programa` field, "Chubut 2014 comp. 47 (obra a elección)"."""
    m = PROGRAMA_REF.match(s or "")
    return (fold(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


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
    numbers: dict[tuple[str, int], set[int]] = defaultdict(set)  # every competition, sung or not
    for p in sorted((repo / "src/data/transcripciones").glob("*.md")):
        text = p.read_text(encoding="utf-8")
        item = next((cat[x] for x in front_items(text, p.stem) if x in cat), None)
        if item and item["category"] == "programa" and item.get("year"):
            key = (item["festival"], int(item["year"]))
            numbers[key].update(int(m.group(1)) for m in re.finditer(r"^(\d{1,3})\.\s", text, re.M))
            for n, line in sung_competitions(text).items():
                programa[key].setdefault(n, line)

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
    span_t: dict[str, dict[str, float]] = defaultdict(dict)
    for v, ss in spans_raw.items():
        for sp in ss:
            span_t[v][sp["letra"]] = min(sp["desde"], span_t[v].get(sp["letra"], sp["desde"]))

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
    sin_texto: list[dict] = []  # sung competitions reached by a video with no published text
    titulos: list[dict] = []  # every video's title, for the texts it names
    fuera: list[dict] = []  # Chubut / Trevelin performances that reach no sung competition
    otros: list[str] = []  # Juventud / Mimosa videos that reach one: those are not transcribed (#29)
    for v in all_videos:
        key = (v["festival"], int(v["year"]))
        comps = competitions(v)
        texto = v["id"] in have
        alcance = v["festival"] in FESTIVALS
        titulos.append({"video": v["id"], "title": v["title"], "festival": key[0], "year": key[1],
                        "comp": next(iter(title_competitions(v["title"])), None), "texto": texto, "alcance": alcance})
        sung = [(n, sec, programa[key][n]) for n, sec in comps if n in programa.get(key, {})]
        if not alcance:
            if sung:
                otros.append(v["id"])
            continue
        if not sung:
            if v["kind"] not in NOT_PERFORMANCE and not NOT_A_SONG.search(v["title"]):
                estado = ("sin_programa" if key not in numbers
                          else "no_cantada" if any(n in numbers[key] for n, _ in comps) else "sin_identificar")
                fuera.append({"video": v["id"], "festival": key[0], "year": key[1], "texto": texto, "estado": estado})
            continue
        single = v["kind"] == "actuacion" and len({n for n, _ in comps}) == 1  # a clip of one performance
        for n, sec, line in sung:
            where = {"video": v["id"], "t": sec, "festival": key[0], "year": key[1], "comp": n}
            if not texto:
                sin_texto.append({**where, "line": line})
                continue
            for title, credit in pieces(line):
                k = (fold(title), fold(credit))
                row = by_piece.setdefault(k, {"title": title, "credit": credit,
                                              "free": bool(FREE_TEXT.search(f"{title} {credit}")), "where": []})
                row["where"].append(where)
            if is_choice(line):
                choice.append({**where, "line": line, "single": single and sec is None})
    return {"pieces": by_piece, "choice": choice, "letras": letras, "spans": spans, "span_t": dict(span_t),
            "videos": {v["id"] for v in all_videos}, "huecos": load_huecos(letras_dir / "huecos.json"),
            "titulos": titulos, "sin_texto": sin_texto, "fuera": fuera, "otros": otros}


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
    """Each piece with its text (if any) and a state per video: "ok" (aligned) or a MOTIVOS code;
    the «a elección» appearances still to identify; and the videos the table leaves out.

    Raises ValueError for a huecos.json entry the report cannot place."""
    letras, spans, span_t = data["letras"], data["spans"], data.get("span_t", {})
    meta = {t["video"]: t for t in data.get("titulos", [])}

    def placed(slug, v):
        return bool(slug) and slug in spans.get(v, ())

    def new_row(**kw) -> dict:
        return {"where": [], "videos": [], "state": {}, "sin_texto": [], "extra": False, "instrumental": None, **kw}

    rows = []
    for _, p in sorted(data["pieces"].items()):
        slug = text_for(p["title"], p["credit"], letras)
        vids = sorted({w["video"] for w in p["where"]})
        rows.append(new_row(**{**p, "where": [dict(w) for w in p["where"]], "slug": slug, "videos": vids,
                               "state": {v: "ok" if placed(slug, v) else None for v in vids}}))
    by_key = {(fold(r["title"]), fold(r["credit"])): r for r in rows}
    used = {r["slug"] for r in rows if r["slug"]}
    extra = {s: new_row(title=letras[s]["titulo"], credit=letras[s]["autor"], programa=letras[s]["programa"],
                        free=False, slug=s, extra=True)
             for s in sorted(set(letras) - used)}  # texts whose piece is not in the table («a elección», no chapter…)
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["slug"]:
            by_slug[r["slug"]].append(r)

    def target(slug: str, v: str, festival, year) -> dict:
        if slug in extra:
            return extra[slug]
        rs = by_slug[slug]
        return (next((r for r in rs if v in r["videos"] or any(w["video"] == v for w in r["sin_texto"])), None)
                or next((r for r in rs if any((w["festival"], w["year"]) == (festival, year) for w in r["where"])), None)
                or rs[0])

    def add(r: dict, where: dict) -> None:
        v = where["video"]
        if v not in r["videos"]:
            r["where"].append(where)
            r["videos"] = sorted({*r["videos"], v})
            r["state"][v] = "ok" if placed(r["slug"], v) else None

    # Pieces sung in videos with no published text: outside the table, counted apart.
    notext: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for a in data.get("sin_texto", []):
        for title, credit in pieces(a["line"]):
            notext[(fold(title), fold(credit))].append(a)
    for k, apps in notext.items():
        if k in by_key:
            by_key[k]["sin_texto"] = apps
    sin_texto = list(data.get("sin_texto", []))

    # A span of a text reaches its video.
    for v, ss in sorted(spans.items()):
        for s in ss:
            if s in letras:
                m = meta.get(v, {})
                add(target(s, v, m.get("festival"), m.get("year")),
                    {"video": v, "t": span_t.get(v, {}).get(s), "festival": m.get("festival", ""),
                     "year": m.get("year", ""), "comp": None})

    # A title that names a saved text reaches its video, unless the title is shared.
    settings = defaultdict(int)
    for t, _ in set(data["pieces"]) | set(notext):
        settings[t] += 1
    by_title: dict[str, list[str]] = defaultdict(list)
    for s, m in sorted(letras.items()):
        by_title[fold(m["titulo"])].append(s)
    named = [(re.compile(rf"(?<!\w){re.escape(t)}(?!\w)"), ss[0]) for t, ss in sorted(by_title.items())
             if len(ss) == 1 and settings[t] <= 1]
    otros = set(data.get("otros", []))
    for t in data.get("titulos", []):
        ft = fold(t["title"])
        for pat, s in named:
            if not pat.search(ft):
                continue
            if not t.get("alcance", True):
                otros.add(t["video"])
                continue
            r = target(s, t["video"], t["festival"], t["year"])
            where = {"video": t["video"], "t": None, "festival": t["festival"], "year": t["year"], "comp": t["comp"]}
            if t["texto"]:
                add(r, where)
            elif not any(w["video"] == t["video"] for w in r["sin_texto"]):
                r["sin_texto"] = r["sin_texto"] + [where]
                sin_texto.append({**where, "line": f"«{letras[s]['titulo']}» (nombrada en el título del video)",
                                  "nombrada": s})

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
            targets = by_slug.get(slug) or [extra[slug]]
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
        gaps = [v for v in cover if v not in done]
        desde = e.get("desde", {})
        if not isinstance(desde, dict) or not all(isinstance(t, (int, float)) and t >= 0 for t in desde.values()):
            raise ValueError(f"{at}: 'desde' es {{video: segundos}}, con segundos >= 0")
        for v in desde:
            if v not in gaps:
                raise ValueError(f"{at}: 'desde' de {v!r}, que no es un video sin alinear de la entrada")
        for r in targets:
            if is_extra:
                for v in cover:
                    m = meta.get(v, {})
                    add(r, {"video": v, "t": None, "festival": m.get("festival", ""), "year": m.get("year", ""), "comp": None})
            for v in cover:
                if v not in r["state"] or r["state"][v] == "ok":
                    continue
                if r["state"][v] is not None:
                    raise ValueError(f"{at}: {name} en {v} ya tiene motivo {r['state'][v]!r} (una entrada por video)")
                r["state"][v] = code
            for w in r["where"]:
                if w["video"] in desde:
                    w["t"] = float(desde[w["video"]])
            if code == "instrumental":
                r["instrumental"] = e["detalle"].strip()
        entries.append({"name": name, "code": code, "detalle": e["detalle"].strip(), "targets": targets, "videos": gaps})

    every = rows + list(extra.values())
    for r in every:
        for v in r["videos"]:
            if r["state"][v] is None:
                r["state"][v] = "sin_alinear" if r["slug"] else "falta_texto"
    instrumental = [r for r in every if r["instrumental"] is not None]
    no_lyric = {(fold(r["title"]), fold(r["credit"])) for r in instrumental}
    rows = [r for r in rows if r["instrumental"] is None]
    extra_rows = [r for r in extra.values() if r["instrumental"] is None]

    # «a elección» appearances: a clip of one performance leaves the list once its piece is known
    # (a span, an entry or its title: any text of that video but the competition's set pieces);
    # in a long session the appearance stays, with the texts whose `programa` names that competition.
    videos_of: dict[str, set[str]] = defaultdict(set)
    for r in rows + extra_rows:
        if r["slug"]:
            videos_of[r["slug"]].update(r["videos"])
    refs = {s: programa_ref(m["programa"]) for s, m in letras.items()}
    choice = []
    for c in data["choice"]:
        fixed = {text_for(t, cr, letras) for t, cr in pieces(c["line"])}
        here = {s for s, vs in videos_of.items() if c["video"] in vs and s not in fixed}
        if c.get("single") and here:
            continue
        ids = sorted(letras[s]["titulo"] for s in here if refs[s] == (fold(c["festival"]), c["year"], c["comp"]))
        choice.append({**c, "identificadas": ids})

    reached = {v for r in every for v in r["videos"]} | {w["video"] for r in every for w in r["sin_texto"]}
    fuera = [f for f in data.get("fuera", []) if f["video"] not in reached]

    counts: dict[str, tuple[set, set]] = {c: (set(), set()) for c in MOTIVOS}
    for r in rows + extra_rows:
        codes = set(r["state"].values()) if r["videos"] else {"sin_alinear"}
        for c in codes - {"ok"}:
            counts[c][0].add((r["title"], r["credit"], r["slug"]))
        for v, c in r["state"].items():
            if c != "ok":
                counts[c][1].add(v)
    counts["a_eleccion"][1].update(c["video"] for c in choice)
    for a in sin_texto:
        if a.get("nombrada"):  # its piece is counted with its row, below
            counts["sin_texto_video"][1].add(a["video"])
            continue
        ps = [k for k in ((fold(t), fold(cr)) for t, cr in pieces(a["line"])) if k not in no_lyric]
        counts["sin_texto_video"][0].update(ps)
        if ps or is_choice(a["line"]) or not pieces(a["line"]):  # not when all its pieces are instrumental
            counts["sin_texto_video"][1].add(a["video"])
    for r in rows + extra_rows:
        if r["sin_texto"]:
            counts["sin_texto_video"][0].add((fold(r["title"]), fold(r["credit"])))
    for f in fuera:
        if f["estado"] == "sin_programa":
            counts["edicion_sin_programa"][1].add(f["video"])
        elif f["estado"] == "sin_identificar":
            counts["actuacion_sin_identificar"][1].add(f["video"])
    solo_sin_texto = len({k for k in notext if k not in by_key and k not in no_lyric})
    return {"rows": rows, "extra": extra_rows, "instrumental": instrumental, "entries": entries, "choice": choice,
            "sin_texto": [a for a in sin_texto if a["video"] in counts["sin_texto_video"][1]],
            "solo_sin_texto": solo_sin_texto, "fuera": fuera, "otros": sorted(otros),
            "counts": {c: (len(p), len(v)) for c, (p, v) in counts.items()}}


def fmt_t(sec: float | None) -> str:
    if sec is None:
        return ""
    s = int(sec)
    return f" {s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f" {s // 60}:{s % 60:02d}"


def link(video: str, t: float | None) -> str:
    return f"[{video}{fmt_t(t) if t else ''}](https://www.youtube.com/watch?v={video}" + (f"&t={int(t)}s" if t else "") + ")"


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


def one_per_video(where: list[dict]) -> list[dict]:
    """The first way into each video, in order, with the earliest time any of them gives."""
    out: dict[str, dict] = {}
    for w in where:
        if w["video"] not in out:
            out[w["video"]] = dict(w)
        elif w["t"] is not None and (out[w["video"]]["t"] is None or w["t"] < out[w["video"]]["t"]):
            out[w["video"]]["t"] = w["t"]
    return list(out.values())


LINKS = 4


def links(r: dict, where: list[dict]) -> str:
    """Each video once; past four, the aligned ones give way («+N más») and every unaligned one stays.
    Marked ✅ / ✗ when some are aligned and some are not."""
    ws = one_per_video(where)
    states = {r["state"][w["video"]] for w in ws}
    mark = "ok" in states and len(states) > 1
    if len(ws) > LINKS:
        bad = [w["video"] for w in ws if r["state"][w["video"]] != "ok"]
        good = [w["video"] for w in ws if r["state"][w["video"]] == "ok"]
        keep = set(bad) | set(good[:max(0, LINKS - len(bad))])
        shown = [w for w in ws if w["video"] in keep]
    else:
        shown = ws
    out = " ".join((("✅ " if r["state"][w["video"]] == "ok" else "✗ ") if mark else "") + link(w["video"], w["t"])
                   for w in shown)
    return out + (f" +{len(ws) - len(shown)} más" if len(shown) < len(ws) else "")


def edition(festival: str, year) -> str:
    return f"{festival.capitalize()} {year}"


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def render(data: dict) -> str:
    a = assess(data)
    rows = sorted(a["rows"], key=lambda r: (r["slug"] is not None, not r["free"], -len(r["videos"]), fold(r["title"]), fold(r["credit"])))
    n_ok = sum(all(s == "ok" for s in r["state"].values()) for r in rows)
    n_part = sum(any(s == "ok" for s in r["state"].values()) for r in rows) - n_ok
    n_saved = sum(bool(r["slug"]) for r in rows) - n_ok - n_part
    counts = a["counts"]
    fuera = a["fuera"]
    sin_id = [f for f in fuera if f["estado"] == "sin_identificar"]
    out = [
        "# Letras pendientes",
        "",
        "Generado por `python3 -m scripts.letras_pendientes`: no editar a mano. Cómo cargar una letra: skill `video-lyrics`. "
        "Los motivos de cada hueco: `data/letras/huecos.json`.",
        "",
        f"Obras cantadas con título en el programa y video transcripto: **{len(rows)}** "
        f"({n_ok} alineadas en todos sus videos, {n_part} en parte, {n_saved} con texto guardado sin alinear, "
        f"{len(rows) - n_ok - n_part - n_saved} sin texto). "
        f"Esa cuenta deja afuera las obras que solo se cantan en videos sin texto publicado ({a['solo_sin_texto']}) "
        "y los videos de ediciones sin programa transcripto: los dos están en «Huecos documentados». "
        f"Obras «a elección» por identificar: **{len(a['choice'])}** apariciones. "
        f"Actuaciones sin identificar: **{len(sin_id)}** videos.",
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
    fill = {"a_eleccion": {"n": len(a["choice"])},
            "actuacion_sin_identificar": {"con": sum(f["texto"] for f in sin_id), "sin": sum(not f["texto"] for f in sin_id)}}
    for c, (label, _) in MOTIVOS.items():
        n_p, n_v = counts[c]
        if c == "instrumental" or not (n_p or n_v):
            continue
        out.append(f"| {label} | {n_p or '—'} | {n_v} | {cierre(c, **fill.get(c, {}))} |")
    n_extra = sum(any(s != "ok" for s in r["state"].values()) or not r["videos"] for r in a["extra"])
    out += ["",
            "Las columnas no se suman: una obra con videos en distintas situaciones cuenta en cada fila que le toca, "
            "un video con varias obras también, y «Obras» incluye "
            f"{plural(n_extra, 'texto guardado', 'textos guardados')} fuera de la tabla del programa. "
            "«El video no tiene texto publicado» cuenta también obras que están en la tabla con otros videos; "
            "las filas de «a elección», ediciones sin programa y actuaciones sin identificar cuentan solo videos.",
            ""]
    if GALES_EN_CURSO:
        out += ["La pasada del modelo galés sobre todos los videos publicados está en curso. Cuando termine, se reintentan "
                "las obras de «el reconocedor galés oyó muy poco»: videos donde ese reconocedor oyó muy poco del canto, "
                "o que no tenían fuente en galés.", ""]
    per_edition = defaultdict(int)
    for f in fuera:
        if f["estado"] == "sin_programa":
            per_edition[(f["festival"], f["year"])] += 1
    if per_edition:
        eds = sorted(per_edition.items(), key=lambda x: (-x[1], x[0]))
        con = sum(f["texto"] for f in fuera if f["estado"] == "sin_programa")
        out += [f"Ediciones sin programa transcripto, con sus videos ({con} con texto publicado): "
                + ", ".join(f"{edition(*k)} ({n})" for k, n in eds) + ".", ""]
    no_cantada = sum(f["estado"] == "no_cantada" for f in fuera)
    aparte = []
    if no_cantada:
        aparte.append(f"{plural(no_cantada, 'video', 'videos')} cuyo título o capítulos nombran una competencia que este "
                      "informe no lee como cantada (recitación, danza, instrumental)")
    if a["otros"]:
        aparte.append(f"{plural(len(a['otros']), 'video', 'videos')} de Juventud y Mimosa que llegan a una obra cantada: "
                      "esos videos no se transcriben (#29)")
    if aparte:
        out += ["Fuera de las cuentas, además de ceremonias y noticias: " + "; ".join(aparte) + ".", ""]
    for r in sorted(a["instrumental"], key=lambda r: fold(r["title"])):
        out.append(f"No es un hueco de letra (fuera de las cuentas): «{r['title']}» ({r['credit'] or '—'}), "
                   f"{plural(len(r['videos']), 'video', 'videos')}. {r['instrumental']}")
    if a["instrumental"]:
        out.append("")
    out += [
        "## Obras del programa",
        "",
        "Primero las de texto probablemente libre (litúrgico, tradicional, autores antiguos: una pista, los derechos los confirma el mantenedor), "
        "después por cantidad de videos (una letra sirve para todos). Para cada una hace falta el texto **tal como se canta**, en su idioma. "
        "«✅ alineada» cuenta solo los videos con el tramo de esa obra en `data/letras/videos.json`; donde unos videos lo tienen y otros no, "
        "«Dónde» marca cada uno con ✅ o ✗. «+N sin texto» son videos de la obra que todavía no tienen texto publicado.",
        "",
        "| Obra | Autoría (programa) | Texto | Videos | Dónde | Estado |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        with_comp = {(w["festival"], w["year"]) for w in r["where"] if w["comp"]}
        where = "; ".join(sorted({f"{w['festival']} {w['year']}" + (f" comp. {w['comp']}" if w["comp"] else "")
                                  for w in r["where"] if w["festival"] and (w["comp"] or (w["festival"], w["year"]) not in with_comp)}))
        ws = sorted(r["where"], key=lambda w: (str(w["year"]), w["video"]))
        n_sin = len({w["video"] for w in r["sin_texto"]})
        out.append(f"| {r['title']} | {r['credit'] or '—'} | {'probablemente libre' if r['free'] else 'verificar derechos'} | "
                   f"{len(r['videos'])}{f' (+{n_sin} sin texto)' if n_sin else ''} | {where}<br>{links(r, ws)} | {estado(r)} |")
    if a["extra"]:
        out += ["", "## Textos guardados fuera de la tabla", "",
                "Letras de obras «a elección» (o de una de las alternativas del programa) ya identificadas, o de obras cuyo video "
                "no llega a una competencia del programa por título ni capítulo. Cada una lleva los videos con su tramo, "
                "los que la nombran en el título y los anotados en `data/letras/huecos.json`.", "",
                "| Obra | Autoría | Programa | Dónde | Estado |", "|---|---|---|---|---|"]
        for r in sorted(a["extra"], key=lambda r: (fold(r["title"]), r["slug"])):
            ws = sorted(r["where"], key=lambda w: w["video"])
            out.append(f"| {r['title']} | {r['credit'] or '—'} | {r['programa'] or '—'} | {links(r, ws) or '—'} | {estado(r)} |")
    if a["sin_texto"]:
        out += ["", "## Obras en videos sin texto publicado", "",
                "Competencias cantadas del programa (y obras con texto guardado que el título nombra) cuyos videos todavía "
                "no tienen texto publicado: entran en la tabla de arriba cuando lo tengan.", "",
                "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
        for c in sorted(a["sin_texto"], key=lambda c: (c["festival"], c["year"], c["comp"] or 0, c["video"], c["t"] or 0)):
            line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
            out.append(f"| {c['festival']} {c['year']} | {c['comp'] or '—'} | {line} | {link(c['video'], c['t'])} |")
    out += ["", "## Detalle de los huecos documentados", "",
            "Lo anotado en `data/letras/huecos.json`, por motivo; cada video enlazado es uno sin alinear.", ""]
    for c, (label, _) in MOTIVOS.items():
        es = sorted((e for e in a["entries"] if e["code"] == c), key=lambda e: (fold(e["name"]), e["videos"]))
        if not es or c == "instrumental":
            continue
        out += [f"### {label[0].upper()}{label[1:]}", ""]
        for e in es:
            ws = one_per_video(sorted((w for r in e["targets"] for w in r["where"] if w["video"] in e["videos"]),
                                      key=lambda w: (w["video"], w["t"] or 0)))
            line = f"- {e['name']}: {' '.join(link(w['video'], w['t']) for w in ws)}. {e['detalle']}"
            sin = one_per_video(sorted((w for r in e["targets"] for w in r["sin_texto"]), key=lambda w: (w["video"], w["t"] or 0)))
            if sin:
                line += (f" Además, {plural(len(sin), 'video sin texto publicado', 'videos sin texto publicado')}: "
                         + " ".join(link(w["video"], w["t"]) for w in sin) + ".")
            out.append(line)
        out.append("")
    out += ["## Obras «a elección» (identificar primero cuál se cantó)", "",
            "Escuchar el video o leer el anuncio; con el título, la letra se pide como cualquier otra. Un clip con una sola "
            "actuación sale de la lista cuando se sabe qué obra es; en una sesión larga queda, con lo ya identificado.", "",
            "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
    for c in sorted(a["choice"], key=lambda c: (c["festival"], c["year"], c["comp"], c["video"])):
        line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
        known = f" (ya identificada aquí: {', '.join(f'«{t}»' for t in c['identificadas'])})" if c["identificadas"] else ""
        out.append(f"| {c['festival']} {c['year']} | {c['comp']} | {line} | {link(c['video'], c['t'])}{known} |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    d = collect()
    OUT.write_text(render(d), encoding="utf-8")
    a = assess(d)
    pending = sum(any(s != "ok" for s in r["state"].values()) for r in a["rows"])
    print(f"{OUT.relative_to(REPO)}: {len(a['rows'])} pieces, {pending} with a gap, {len(a['entries'])} documented, "
          f"{len(a['choice'])} a elección, {a['counts']['sin_texto_video'][1]} videos without text, "
          f"{a['counts']['edicion_sin_programa'][1]} in editions without programa, "
          f"{a['counts']['actuacion_sin_identificar'][1]} unidentified")
