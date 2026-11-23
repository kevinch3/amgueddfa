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

A competition is sung when it sits in a music section (also "### Adran gerddoriaeth" inside a
language section, or "## Solos · Unawdau") and its line names no instrument, dance or recitation
outside a title or an accompaniment; a cân actol and a choir with an instrumental ensemble are sung.

One row per piece, with every video where it is sung, so one text serves them all; credits that
differ only in spelling or initials, or an empty one, are the same row. A video reaches a piece
through a competition of its title or chapters, through a span of the piece's text, or because its
title names a saved text (word for word, and only when no other text or programa setting shares that
title). A video counts as done only when it has a span of that piece's text; a saved text with no
span is a gap. "a elección" pieces, competitions that offer alternatives («A», «B» o «C») and free
repertoires whose line names no piece ("Solo libre: música rock o blues") are listed apart: someone
has to say which piece was sung. A clip with a single performance leaves that list once its piece is
known (a span, a gap entry, its title or an identification); a session keeps it, with the texts aligned
in its chapter and the identifications timed inside it. A line that names its piece without «» is
counted apart too, until the transcription marks it.

Identifications (data/letras/identificaciones.json, keyed by video, with `t` in a session) say which
piece a performance is: title, author or tune, confidence, evidence (never quoting what is sung) and
rights. One with a saved text (`letra`) brings its video to that text, which is then a gap until it has
a span; one without is a row of its own ("Obras identificadas, sin texto"), counted as «falta el
texto», and its video leaves «actuación sin identificar». An identification also stops a video title
from tying the video to a saved text of another setting with the same title.

The table leaves some videos out, and the report counts them: sung competitions whose videos have
no published text, videos of editions with no programa transcribed, performances that nobody has
placed in a competition (with or without text: giving a video text does not place it), and clips
whose title says they are not sung. The texts come from the maintainer, or, when public domain, from a
cited public source, checked against what is sung (skill: video-lyrics).

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
IDENTIFICACIONES = REPO / "data" / "letras" / "identificaciones.json"

# The Welsh model pass over every published video (on KPC) is running; set to False when it ends,
# in the commit that retries the «gales_insuficiente» pieces.
GALES_EN_CURSO = True

# Why a piece (or one of its videos) has no aligned lyric: code -> (label, what would close it).
# The order is the order of the summary table. COMPUTED codes are set by the report; the others
# come from data/letras/huecos.json. The last three count videos that are not in the programa table.
MOTIVOS = {
    "falta_texto": ("falta el texto",
                    "El texto tal como se canta, en su idioma: si es de dominio público, de una fuente pública citada; "
                    "si no, del mantenedor (skill `video-lyrics`)."),
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
    "poco_oido": ("los reconocedores oyeron muy poco del canto",
                  "Escuchar el video para fijar el tramo (y, si hace falta, los tiempos de los versos): lo que oyeron "
                  "YouTube, Whisper y el modelo galés no alcanza para que el alineador ubique las líneas (#129)."),
    "alineador": ("el alineador amontona las líneas",
                  "Que el alineador no se ancle en palabras sueltas o mal oídas, por ejemplo repartiendo "
                  "desde el inicio del tramo cuando lo oído es poco (#129)."),
    "ubicable_desde_clip": ("se puede ubicar ya desde un clip alineado",
                            "Correr el tramo del clip ya alineado por el desfase que da el detalle y agregarlo "
                            "a este video (skill `video-lyrics`); después, sacar el video de la entrada, o dejarlo "
                            "para otra actuación del mismo video con `desde` fuera del tramo."),
    "no_esta_en_video": ("no se canta en ese video",
                         "Nada que alinear ahí: hace falta otra grabación de esa actuación, o corregir a qué "
                         "competencia apunta el video."),
    "version_por_confirmar": ("versión por confirmar",
                              "El mantenedor confirma qué versión (y qué texto) se canta; después se pide el texto "
                              "o se reusa uno guardado."),
    "instrumental": ("instrumental, sin letra", "No es un hueco de letra: no se cuenta."),
    "a_eleccion": ("obra «a elección» sin identificar",
                   "Escuchar el anuncio o el video para saber qué obra se cantó (o cuál de las alternativas del "
                   "programa; en un repertorio libre, la línea del programa no nombra ninguna); con el título, la letra "
                   "se pide como cualquier otra ({n} apariciones, {k} con alguna obra ya identificada ahí; lista al final)."),
    "titulo_sin_marcar": ("el programa no marca el título",
                          "La transcripción del programa nombra la obra sin «»: marcar el título (skill "
                          "`programa-transcription`) para que la obra entre en la tabla. Lista en "
                          "[Obras sin marcar en el programa](#obras-sin-marcar-en-el-programa)."),
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
COMPUTED = {"falta_texto", "sin_alinear", "a_eleccion", "titulo_sin_marcar", "sin_texto_video", "edicion_sin_programa",
            "actuacion_sin_identificar"}
ENTRY_KEYS = {"letra", "obra", "autoria", "videos", "desde", "motivo", "detalle"}
# Which piece a performance is, when its programa line does not say (data/letras/identificaciones.json).
IDENT_KEYS = {"t", "titulo", "autoria", "confianza", "evidencia", "derechos", "letra", "nota"}
CONFIANZA = ("alta", "media", "baja")
DERECHOS = {"dominio_publico": "dominio público", "con_derechos": "con derechos", "sin_confirmar": "derechos sin confirmar"}
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
# Words of something that is not sung: an instrument, a dance, a recitation… A cân actol (action song) and a
# comedia musical are sung.
NOT_SUNG = re.compile(r"\b(instrumental|instrumento|piano solo|guitarra|guitar\b|viol[ií]n|flauta|arpa|telyn|delyn|teclado|banjo|"
                      r"chwibanogl|crwth|recitaci[oó]n|adrodd|danza|dawns|teatro|cocina|fotograf)", re.I)
# Words that only a sung competition has; they win over NOT_SUNG ("Coro … y conjunto instrumental").
VOICE = re.compile(r"\b(coros?|c[oô]r|g[oô]r|corau|vocal(?:es)?|canto|c[aâ]n|gân|caneuon|emyn(?:au)?|himnos?|cerdd dant|lleisiau|"
                   r"lleisiol|cantautor|penillion)\b", re.I)
# An accompaniment is not the performance: "con acompañamiento instrumental", "gyda chyfeiliant telyn", "con guitarra
# o laúd", "Kevin Handley al piano".
_INSTR = r"(?:instrumental|instrumentos?|guitarra|guitar|piano|arpa|la[uú]d|telyn|delyn|percusi[oó]n)"
ACCOMP = re.compile(rf"\b(?:con|sin|al|gyda(?:['’]r)?|i|heb)\s+(?:o\s+sin\s+)?(?:(?:acompa[ñn]amiento|ensamble|chyfeiliant|gyfeiliant|"
                    rf"cyfeiliant)\s+)?(?:(?:de|o)\s+)?{_INSTR}(?:\s+(?:o|y|u|neu|a)\s+{_INSTR})?", re.I)
CHOICE = re.compile(r"a elecci[oó]n|hunan\w*wisiad|libre elecci[oó]n|de libre|a escoger", re.I)
# Section headings: the music of a programa can sit under a language section ("## Programa en idioma galés",
# "### Adran gerddoriaeth", with its mutation) or under one heading per kind of group ("## Solos · Unawdau").
HEAD_INSTRUMENTAL = re.compile(r"instrumental|offerynnol", re.I)
HEAD_MUSIC = re.compile(r"m[uú]sica|[cg]erddoriaeth|canto|\bcoros?\b|\bcorau\b|\bsolos\b|unawdau|\bconjuntos\b|part[iï]on|"
                        r"\bd[uú]os\b|deuawdau|cerdd dant", re.I)
HEAD_OTHER = re.compile(r"literatura|enyddiaeth|poes[ií]a|barddoniaeth|prosa|rhyddiaith|escritura|recitaci|adrodd|expresi[oó]n|"
                        r"iaith lafar|dramatizaci|traducci|cyfieith|danza|dawns|dibujo|dise[ñn]o|\bartes?\b|artesan|celf|"
                        r"gwaith llaw|fotograf|ffotograff|audiovisual|gweledol|tejido|cocina|premios|gwobr|notas|nodiadau|"
                        r"jurados|beirniaid", re.I)


def not_sung(text: str, pattern: re.Pattern = NOT_SUNG) -> bool:
    """Whether a programa line (or a video title) names something that is not sung. Words inside «…» belong to a
    title and an accompaniment is not the performance; a word only a sung competition has wins."""
    t = ACCOMP.sub(" ", QUOTE_ANY.sub(" ", text))
    return bool(pattern.search(t)) and not VOICE.search(t)


def heading_kind(line: str) -> str | None:
    """"instrumental", "music", "other" (literature, recitation, dance, crafts…) or None (a language or an age group)."""
    if HEAD_INSTRUMENTAL.search(line):
        return "instrumental"
    if HEAD_MUSIC.search(line):
        return "music"
    return "other" if HEAD_OTHER.search(line) else None
# Words that are usually free to publish: liturgical Latin, traditional texts, poets and composers
# dead long ago. A hint for ordering the list, not a rights decision (the maintainer confirms).
FREE_TEXT = re.compile(r"tradicional|traddodiadol|traditional|an[oó]nim|siglo x[vi]|ave mar[ií]a|ubi caritas|cantate domino|"
                       r"gloria|kyrie|agnus dei|sanctus|bone jesu|lux aeterna|ave verum|pater noster|magnificat|salve regina|"
                       r"let all mortal flesh|es ist ein ros|h[aä]ndel|schubert|praetorius|hass?ler|mozart|bach|brahms|"
                       r"mendelssohn|joseph parry|ieuan gwyllt|pantycelyn|ann griffiths", re.I)
QUOTE = re.compile(r"«([^»]+)»")
QUOTE_ANY = re.compile(r"«[^»]*»")
# The word right before a nickname inside a name: Gustavo «Cuchi» Leguizamón, obra de «Cuchi» Leguizamón.
NAME_BEFORE = re.compile(r"(?:^|\s)(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+|de|del)\s$")
# «A» o «B», «A», «B» neu «C», «A», Franz Schubert, o «B»: one of them is sung.
ALT_SEP = re.compile(r"^(?:\s*,?|[^;«»]*,)\s*(?:o|u|neu|or)\s*$")
LIST_SEP = re.compile(r"^\s*,\s*$")
JOINERS = {"a", "y", "e", "and", "o", "u", "neu", "or"}
# The larger work or collection a piece comes from: serie «Flores argentinas», (o'r sioe gerdd «Heledd»), del ciclo «…».
MAYOR_WORD = r"(?:serie|sioe gerdd|ciclo|suite|[aá]lbum|cantata|[oó]pera|oratorio|colecci[oó]n|casgliad)"
# A quoted title that names a book of songs, right after a piece: «Ar Gyfer Heddiw'r Bore» (…), «Caneuon Llafar Gwlad».
COLLECTION = re.compile(r"^(?:caneuon|casgliad|cancionero|canciones|alawon|emynau)\b", re.I)
# A theme, not a piece: thema «Taith», tema «160 aniversario…»; a cân actol (action song) names its theme.
THEME_BEFORE = re.compile(r"\b(?:thema|tema)\s*:?\s*$", re.I)
ACTION_SONG = re.compile(r"\bc[aâ]n act(?:ol|io)\b", re.I)
# First words of a description of the repertoire, not of a title: "Solo Libre: Obra cantada a estrenar".
GENERIC_START = {"obra", "obras", "arreglo", "repertorio", "libre", "tema"}


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
    """Numbered lines of the music sections that are sung (not instrumental), {number: line}.

    A "## " heading sets the section; a "### " heading of music, instrumental or another art narrows it, and any
    other "### " (a language, an age group) goes back to the section's. Where no heading says, by the line's words."""
    out: dict[int, str] = {}
    section: tuple[bool | None, bool] = (None, False)  # (music, instrumental); music None: no heading says
    music, instrumental = section
    for line in text.splitlines():
        if line.startswith(("## ", "### ")):
            kind = heading_kind(line)
            if line.startswith("## "):
                section = {"instrumental": (True, True), "music": (True, False), "other": (False, False)}.get(kind, (None, False))
                music, instrumental = section
            elif kind == "instrumental":
                instrumental = True
            elif kind == "music":
                music, instrumental = True, False
            elif kind == "other":
                music, instrumental = False, False
            else:
                music, instrumental = section
        m = re.match(r"^(\d{1,3})\.\s+(.*)", line)
        if not m:
            continue
        n, body = int(m.group(1)), m.group(2).strip()
        sung = False if instrumental else music if music is not None else bool(VOCAL.search(body))
        if sung and not not_sung(body):
            out.setdefault(n, body)
    return out


def _quotes(line: str) -> list[tuple[re.Match, str]]:
    """Each «…» of a programa line with its role: "obra" (a piece); "tema" (the theme of a cân actol, or after
    thema/tema); "apodo" (a one-word nickname inside a name: Gustavo «Cuchi» Leguizamón, obra de «Cuchi»
    Leguizamón); or "mayor" (the larger work or collection a piece comes from: del «Stabat Mater», (de «Xerxes»),
    serie «Flores argentinas», (o'r sioe gerdd «Heledd»), «Caneuon Llafar Gwlad»). Apodo and mayor are part of a credit."""
    out: list[tuple[re.Match, str]] = []
    action_song = bool(ACTION_SONG.search(QUOTE_ANY.sub(" ", line)))
    for m in QUOTE.finditer(line):
        before, after, title = line[:m.start()], line[m.end():], m.group(1).strip()
        prior = any(r == "obra" for _, r in out)
        ends = re.match(r"\)?\s*(?:[,.;]|$)", after)
        if action_song or THEME_BEFORE.search(before):
            role = "tema"
        elif " " not in title and re.match(r" [A-ZÁÉÍÓÚÑ]", after) and NAME_BEFORE.search(before):
            role = "apodo"
        elif ends and (re.search(rf"\b{MAYOR_WORD}\s*$", before, re.I)
                       or prior and (re.search(r"(?:\bdel?|\bo['’]r)\s$", before) or COLLECTION.match(title))):
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
        # (de «Xerxes») -> de «Xerxes»; (o'r sioe gerdd «Heledd») -> o'r sioe gerdd «Heledd»
        rest = re.sub(rf"\(\s*((?:(?:del?|o['’]r)\s+)?(?:(?:la|el)\s+)?(?:{MAYOR_WORD}\s+)?«[^»]+»)\s*\)", r"\1", rest, flags=re.I)
        rest = re.sub(r"^\s*\([^()«»]*\)", "", rest)  # a note right after the title: «La finadita» (chacarera), arr. …
        credit = re.split(r";|\(|\[|\s[a-d]\)", rest.strip(" ,:"), maxsplit=1)[0].strip(" ,.:")
        credit = re.sub(r"\s+(?:o|u|neu|or)$", "", re.sub(r"^(?:de|gan|y|e)\s+(?!«)", "", credit))
        out.append((m.group(1).strip(), "" if credit.lower() in JOINERS else credit))
    return out, alternatives


def pieces(line: str) -> list[tuple[str, str]]:
    """(title, credit) of each set «piece» in a competition line; credit is the text up to the next piece or «;».
    Alternatives («A» o «B») are not set pieces: see is_choice."""
    return _parse(line)[0]


def unmarked_title(line: str) -> bool:
    """Whether the line names its piece without «»: "Pedwarawd: Ar hyd y nos." The report cannot read that piece,
    and it is not a free choice either: what follows the label starts with a capital, as a title does."""
    if QUOTE.search(line) or CHOICE.search(line) or ACTION_SONG.search(line):
        return False
    m = re.search(r":|\s[-–]\s", line)
    if not m or THEME_BEFORE.search(line[:m.start()]):
        return False
    rest = line[m.end():].lstrip(" -–:")
    return rest[:1].isupper() and fold(rest.split(" ", 1)[0]).strip(".,;") not in GENERIC_START


def is_choice(line: str) -> bool:
    """Whether someone has to say which piece was sung: «a elección», alternatives to pick from, or a free
    repertoire whose line names no piece ("Solo libre: música rock o blues", "emyn neu gân Gristnogol")."""
    set_pieces, alternatives = _parse(line)
    return bool(CHOICE.search(line) or alternatives or (not set_pieces and not unmarked_title(line)))


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


def not_a_song(title: str) -> bool:
    """Whether a video's title says it is not sung: "Solo de guitarra", "Malambo"; not "Cân Actol" nor
    "Unawd Cerdd Dant/Arpa"."""
    return not_sung(title, NOT_A_SONG)


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


def load_identificaciones(path: Path = IDENTIFICACIONES) -> dict:
    """{video: [identification, ...]}: the piece each performance is, keyed by video (and `t` in a session)."""
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    bad = sorted(set(doc) - {"nota", "identificaciones"}) if isinstance(doc, dict) else ["(no es un objeto)"]
    if bad:
        raise ValueError(f"{path.name}: clave desconocida {bad}; se esperaba 'nota' e 'identificaciones'")
    ids = doc.get("identificaciones", {})
    if not isinstance(ids, dict):
        raise ValueError(f"{path.name}: 'identificaciones' es {{video: [identificaciones]}}")
    for v, es in ids.items():
        if not isinstance(es, list) or not all(isinstance(e, dict) for e in es):
            raise ValueError(f"{path.name}: {v!r} lleva una lista de identificaciones")
    return ids


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
    span_rangos: dict[str, dict[str, list[list[float]]]] = defaultdict(lambda: defaultdict(list))
    for v, ss in spans_raw.items():
        for sp in ss:
            span_t[v][sp["letra"]] = min(sp["desde"], span_t[v].get(sp["letra"], sp["desde"]))
            span_rangos[v][sp["letra"]].append([sp["desde"], sp.get("hasta", sp["desde"])])

    def competitions(v: dict) -> tuple[list[tuple[int, float | None]], list[float]]:
        """The competitions a video reaches, with the chapter's start, and the start of every chapter."""
        comps: list[tuple[int, float | None]] = [(n, None) for n in title_competitions(v["title"])]
        marks: list[float] = []
        mk = repo / "public/marcadores-video" / f"{v['id']}.json"
        if mk.exists():
            for sec, n, *_ in json.loads(mk.read_text(encoding="utf-8")).get("markers", []):
                marks.append(float(sec))
                if str(n).isdigit():
                    comps.append((int(n), float(sec)))
        return comps, sorted(marks)

    by_piece: dict[tuple[str, str], dict] = {}
    choice: list[dict] = []
    sin_marcar: list[dict] = []  # sung competitions whose programa line names its piece without «»
    sin_texto: list[dict] = []  # sung competitions reached by a video with no published text
    titulos: list[dict] = []  # every video's title, for the texts it names
    fuera: list[dict] = []  # Chubut / Trevelin performances that reach no sung competition
    otros: list[str] = []  # Juventud / Mimosa videos that reach one: those are not transcribed (#29)
    for v in all_videos:
        key = (v["festival"], int(v["year"]))
        comps, marks = competitions(v)
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
            if v["kind"] not in NOT_PERFORMANCE:
                estado = ("no_es_canto" if not_a_song(v["title"]) else "sin_programa" if key not in numbers
                          else "no_cantada" if any(n in numbers[key] for n, _ in comps) else "sin_identificar")
                fuera.append({"video": v["id"], "festival": key[0], "year": key[1], "texto": texto, "estado": estado})
            continue
        nums = {n for n, _ in comps}
        single = v["kind"] == "actuacion" and len(nums) == 1  # a clip of one performance
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
                # where this competition is in the video: its chapter, or the whole video when it has no other
                rango = ((sec, next((t for t in marks if t > sec), None)) if sec is not None
                         else (0.0, None) if nums == {n} else None)
                choice.append({**where, "line": line, "single": single and sec is None, "rango": rango})
            elif unmarked_title(line):
                sin_marcar.append({**where, "line": line})
    return {"pieces": by_piece, "choice": choice, "letras": letras, "spans": spans, "span_t": dict(span_t),
            "span_rangos": {v: dict(r) for v, r in span_rangos.items()},
            "videos": {v["id"] for v in all_videos}, "huecos": load_huecos(letras_dir / "huecos.json"),
            "identificaciones": load_identificaciones(letras_dir / "identificaciones.json"),
            "titulos": titulos, "sin_texto": sin_texto, "sin_marcar": sin_marcar, "fuera": fuera, "otros": otros}


def _authors(s: str) -> set[str]:
    return set(re.findall(r"[a-z]{4,}", fold(s)))


GENERIC_NAMES = {"coral", "version", "musica", "letra", "texto", "arreglo", "tradicional", "traddodiadol", "carol",
                 "himno", "anonimo", "trefniant", "serie", "hermanos", "geiriau", "alaw"}


def same_setting(a: str, b: str) -> bool:
    """Two programa credits of one title name the same setting, apart only in spelling or initials:
    Olwen Jones / E. Olwen Jones; Hermanos Díaz, arr. Vivian Tabush / Hernán Díaz, arr. Vivian Tabbush."""
    return fold(a) == fold(b) or len((_authors(a) & _authors(b)) - GENERIC_NAMES) >= 2


def settings_of(keys) -> dict[tuple[str, str], tuple[str, str]]:
    """The setting of each (folded title, folded credit), named by its first key. Credits of one title that name
    the same people are one setting; an empty credit joins the title's only setting (with two, it stays apart)."""
    by_title: dict[str, list] = defaultdict(list)
    for k in sorted(set(keys)):
        by_title[k[0]].append(k)
    canon = {}
    for ks in by_title.values():
        groups: list[list] = []
        for k in (k for k in ks if k[1]):
            near = [g for g in groups if any(same_setting(k[1], o[1]) for o in g)]
            groups = [g for g in groups if g not in near] + [sorted([k] + [o for g in near for o in g])]
        for g in groups:
            for k in g:
                canon[k] = g[0]
        for k in (k for k in ks if not k[1]):
            canon[k] = groups[0][0] if len(groups) == 1 else k
    return canon


def text_for(title: str, credit: str, letras: dict) -> str | None:
    """The saved text of a piece: same title; when several settings share it, the one whose author matches."""
    cands = sorted(s for s, m in letras.items() if fold(m["titulo"]) == fold(title))
    if len(cands) <= 1:
        return cands[0] if cands else None
    score = {s: len(_authors(credit) & _authors(letras[s]["autor"])) for s in cands}
    best = [s for s in cands if score[s] == max(score.values())]
    return best[0] if len(best) == 1 and score[best[0]] else None


def check_ident(e: dict, at: str, video: str, videos: set, letras: dict) -> None:
    """Raises ValueError for an identification the report cannot read."""
    if video not in videos:
        raise ValueError(f"{at}: video desconocido {video!r}")
    bad = sorted(set(e) - IDENT_KEYS)
    if bad:
        raise ValueError(f"{at}: campo desconocido {bad}")
    for k in ("titulo", "evidencia"):
        if not isinstance(e.get(k), str) or not e[k].strip():
            raise ValueError(f"{at}: falta {k!r} (la evidencia, sin citar nada de lo que se canta)")
    if e.get("confianza") not in CONFIANZA:
        raise ValueError(f"{at}: 'confianza' es una de {', '.join(CONFIANZA)}")
    if e.get("derechos") not in DERECHOS:
        raise ValueError(f"{at}: 'derechos' es uno de {', '.join(DERECHOS)}")
    if "t" in e and not (isinstance(e["t"], (int, float)) and e["t"] >= 0):
        raise ValueError(f"{at}: 't' son los segundos del video donde empieza la actuación (>= 0)")
    if "letra" in e and e["letra"] not in letras:
        raise ValueError(f"{at}: letra desconocida {e['letra']!r}: no existe data/letras/{e['letra']}.md")


def assess(data: dict) -> dict:
    """Each piece with its text (if any) and a state per video: "ok" (aligned) or a MOTIVOS code;
    the «a elección» appearances still to identify; and the videos the table leaves out.

    Raises ValueError for a huecos.json entry the report cannot place."""
    letras, spans, span_t = data["letras"], data["spans"], data.get("span_t", {})
    span_rangos = data.get("span_rangos", {})
    meta = {t["video"]: t for t in data.get("titulos", [])}

    def placed(slug, v):
        return bool(slug) and slug in spans.get(v, ())

    def new_row(**kw) -> dict:
        return {"where": [], "videos": [], "state": {}, "sin_texto": [], "extra": False, "instrumental": None,
                "otras": [], **kw}

    # One row per setting: credits that differ only in spelling or initials, or an empty one, are the same piece.
    notext_keys = [(fold(t), fold(c)) for a in data.get("sin_texto", []) for t, c in pieces(a["line"])]
    canon = settings_of(list(data["pieces"]) + notext_keys)
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for k, p in sorted(data["pieces"].items()):
        grouped[canon[k]].append(p)
    rows = []
    for c, ps in sorted(grouped.items()):
        credits: list[str] = []
        for p in ps:
            if p["credit"] and fold(p["credit"]) not in {fold(x) for x in credits}:
                credits.append(p["credit"])
        # shown once each; a credit inside a fuller one gives way (Olwen Jones, E. Olwen Jones)
        credits = sorted((x for x in credits if not any(fold(x) in fold(y) and fold(x) != fold(y) for y in credits)), key=fold)
        slug = next((s for s in (text_for(ps[0]["title"], cr, letras) for cr in credits or [""]) if s), None)
        where = [dict(w) for p in ps for w in p["where"]]
        vids = sorted({w["video"] for w in where})
        rows.append(new_row(title=ps[0]["title"], credit=" · ".join(credits), credits=[p["credit"] for p in ps],
                            free=any(p["free"] for p in ps), where=where, slug=slug, videos=vids, id=c,
                            state={v: "ok" if placed(slug, v) else None for v in vids}))
    by_id = {r["id"]: r for r in rows}
    used = {r["slug"] for r in rows if r["slug"]}
    extra = {s: new_row(title=letras[s]["titulo"], credit=letras[s]["autor"], credits=[letras[s]["autor"]],
                        programa=letras[s]["programa"], free=False, slug=s, extra=True, id=("letra", s))
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
            notext[canon[(fold(title), fold(credit))]].append(a)
    for k, apps in notext.items():
        if k in by_id:
            by_id[k]["sin_texto"] = apps
    sin_texto = list(data.get("sin_texto", []))

    # A span of a text reaches its video.
    for v, ss in sorted(spans.items()):
        for s in ss:
            if s in letras:
                m = meta.get(v, {})
                add(target(s, v, m.get("festival"), m.get("year")),
                    {"video": v, "t": span_t.get(v, {}).get(s), "festival": m.get("festival", ""),
                     "year": m.get("year", ""), "comp": None})

    # An identification names the piece a performance is: with a saved text, it reaches its video like a span
    # (and the video is a gap until it has one); without one, the piece is a row of its own, apart from the table.
    idents = data.get("identificaciones", {})
    for v, es in sorted(idents.items()):
        for i, e in enumerate(es, 1):
            check_ident(e, f"identificaciones.json, {v} n.º {i}", v, data["videos"], letras)
            m = meta.get(v, {})
            where = {"video": v, "t": e.get("t"), "festival": m.get("festival", ""), "year": m.get("year", ""), "comp": None}
            if "letra" not in e:
                continue
            r = target(e["letra"], v, m.get("festival"), m.get("year"))
            if m.get("texto", True) or placed(e["letra"], v):
                add(r, where)
            elif not any(w["video"] == v for w in r["sin_texto"]):
                r["sin_texto"] = r["sin_texto"] + [where]
                sin_texto.append({**where, "line": f"«{letras[e['letra']]['titulo']}» (identificada)", "nombrada": e["letra"]})

    # A title that names a saved text reaches its video, unless the title is shared, or the video's identification
    # says it is another piece (another setting of the same title).
    settings = defaultdict(int)
    for t, _ in set(canon.values()):
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
            if t["video"] in idents and s not in {e.get("letra") for e in idents[t["video"]]}:
                continue
            r = target(s, t["video"], t["festival"], t["year"])
            where = {"video": t["video"], "t": None, "festival": t["festival"], "year": t["year"], "comp": t["comp"]}
            if t["texto"] or placed(s, t["video"]):  # a span: the rebuild publishes the text with the lyric
                add(r, where)
            elif not any(w["video"] == t["video"] for w in r["sin_texto"]):
                r["sin_texto"] = r["sin_texto"] + [where]
                sin_texto.append({**where, "line": f"«{letras[s]['titulo']}» (nombrada en el título del video)",
                                  "nombrada": s})

    # Where in a video a text is known to be sung: the middle of each span (a span can start a few seconds
    # before its chapter's marker) and the time a gap entry gives.
    puntos: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for v, by_slug_t in span_rangos.items():
        for s, rs in by_slug_t.items():
            puntos[v][s].extend((a + b) / 2 for a, b in rs)

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
                       and (autoria is None or fold(autoria) in {fold(c) for c in r["credits"]})]
            if not targets:
                raise ValueError(f"{at}: obra desconocida {obra!r}" + (f" con autoría {autoria!r}" if autoria else "")
                                 + ": se escribe como en la tabla (título y una autoría del programa)")
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
        desde = e.get("desde", {})
        if not isinstance(desde, dict) or not all(isinstance(t, (int, float)) and t >= 0 for t in desde.values()):
            raise ValueError(f"{at}: 'desde' es {{video: segundos}}, con segundos >= 0")
        cover = sorted(set(vids or known))
        done = [v for v in cover if any(placed(r["slug"], v) for r in targets)]
        # Another performance in a video already aligned: its 'desde' falls outside the text's spans there.
        otra = [v for v in done if v in desde and not any(a <= desde[v] <= b for r in targets if r["slug"]
                                                         for a, b in span_rangos.get(v, {}).get(r["slug"], []))]
        stale = [v for v in done if v not in otra]
        if vids and stale:
            raise ValueError(f"{at}: {name} ya está alineada en {stale[0]}: sacar ese video de la entrada (si es otra "
                             "actuación del mismo video, su 'desde' va fuera del tramo alineado)")
        if len(done) == len(cover) and not otra:
            raise ValueError(f"{at}: {name} ya está alineada en todos sus videos: borrar la entrada")
        gaps = [v for v in cover if v not in done]
        for v in desde:
            if v not in gaps and v not in otra:
                raise ValueError(f"{at}: 'desde' de {v!r}, que no es un video sin alinear de la entrada")
            if "letra" in e:
                puntos[v][e["letra"]].append(float(desde[v]))
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
            for v in otra:
                if placed(r["slug"], v):
                    r["otras"].append({"video": v, "t": float(desde[v]), "code": code})
            for w in r["where"]:
                if w["video"] in desde and w["video"] not in otra:
                    w["t"] = float(desde[w["video"]])
            if code == "instrumental":
                r["instrumental"] = e["detalle"].strip()
        entries.append({"name": name, "code": code, "detalle": e["detalle"].strip(), "targets": targets,
                        "videos": sorted(gaps + otra), "tiempos": {v: float(desde[v]) for v in otra}})

    identified: dict[str, dict] = {}
    for v, es in sorted(idents.items()):
        m = meta.get(v, {})
        for e in es:
            if "letra" in e:
                continue
            k = fold(e["titulo"])
            r = identified.setdefault(k, new_row(title=e["titulo"], credit=e.get("autoria", ""), credits=[], slug=None,
                                                 free=False, extra=True, id=("identificada", k), idents=[]))
            r["idents"].append({"video": v, **e})
            if e.get("autoria") and e["autoria"] not in r["credits"]:
                r["credits"].append(e["autoria"])
            where = {"video": v, "t": e.get("t"), "festival": m.get("festival", ""), "year": m.get("year", ""), "comp": None}
            if m.get("texto", True):
                if v not in r["videos"]:
                    r["where"].append(where)
                    r["videos"] = sorted({*r["videos"], v})
                    r["state"][v] = "falta_texto"
            elif not any(w["video"] == v for w in r["sin_texto"]):
                r["sin_texto"].append(where)
    ident_rows = sorted(identified.values(), key=lambda r: fold(r["title"]))
    for r in ident_rows:
        r["credit"] = " · ".join(r["credits"])

    every = rows + list(extra.values())
    for r in every:
        for v in r["videos"]:
            if r["state"][v] is None:
                r["state"][v] = "sin_alinear" if r["slug"] else "falta_texto"
    instrumental = [r for r in every if r["instrumental"] is not None]
    no_lyric = {r["id"] for r in instrumental}
    rows = [r for r in rows if r["instrumental"] is None]
    extra_rows = [r for r in extra.values() if r["instrumental"] is None]

    # «a elección» appearances: a clip of one performance leaves the list once its piece is known
    # (a span, an entry or its title: any text of that video but the competition's set pieces);
    # in a long session the appearance stays, with what is already known there: texts whose `programa`
    # names that competition, and texts sung inside its chapter (or anywhere, in a video of that
    # competition alone), by a span or a gap entry's time.
    videos_of: dict[str, set[str]] = defaultdict(set)
    for r in rows + extra_rows:
        if r["slug"]:
            videos_of[r["slug"]].update(r["videos"])
    refs = {s: programa_ref(m["programa"]) for s, m in letras.items()}

    def inside(slug: str, c: dict) -> bool:
        if not c.get("rango"):
            return False
        start, end = c["rango"]
        return any(start <= t and (end is None or t < end) for t in puntos.get(c["video"], {}).get(slug, []))

    set_for: dict[tuple[str, str], set[int]] = defaultdict(set)  # (video, text): competitions that set it there
    for r in rows:
        for w in r["where"]:
            if r["slug"] and w["comp"]:
                set_for[(w["video"], r["slug"])].add(w["comp"])

    def ident_inside(e: dict, c: dict) -> bool:
        if not c.get("rango"):
            return False
        start, end = c["rango"]
        t = e.get("t", 0.0 if c["rango"] == (0.0, None) else None)
        return t is not None and start <= t and (end is None or t < end)

    choice = []
    for c in data["choice"]:
        fixed = {text_for(t, cr, letras) for t, cr in pieces(c["line"])}
        here = {s for s, vs in videos_of.items() if c["video"] in vs and s not in fixed}
        if c.get("single") and (here or any("letra" not in e for e in idents.get(c["video"], []))):
            continue
        # the set piece of another competition is not this one's free piece, even when a chapter is misplaced
        ids = sorted(letras[s]["titulo"] for s in here if not set_for[(c["video"], s)] - {c["comp"]}
                     and (refs[s] == (fold(c["festival"]), c["year"], c["comp"]) or inside(s, c)))
        ids += [e["titulo"] for e in idents.get(c["video"], []) if "letra" not in e and ident_inside(e, c)
                and fold(e["titulo"]) not in {fold(x) for x in ids}]
        choice.append({**c, "identificadas": sorted(ids, key=fold)})

    reached = ({v for r in every + ident_rows for v in r["videos"]}
               | {w["video"] for r in every + ident_rows for w in r["sin_texto"]})
    fuera = [f for f in data.get("fuera", []) if f["video"] not in reached]

    counts: dict[str, tuple[set, set]] = {c: (set(), set()) for c in MOTIVOS}
    for r in rows + extra_rows + ident_rows:
        # a saved text with no video yet is a text to place; an identified piece only in videos without text is
        # counted with those videos
        codes = set(r["state"].values()) if r["videos"] else {"sin_alinear"} if r["slug"] else set()
        for c in codes - {"ok"}:
            counts[c][0].add(r["id"])
        for v, c in r["state"].items():
            if c != "ok":
                counts[c][1].add(v)
        for o in r["otras"]:  # another performance in a video already aligned
            counts[o["code"]][0].add(r["id"])
            counts[o["code"]][1].add(o["video"])
    counts["a_eleccion"][1].update(c["video"] for c in choice)
    sin_marcar = list(data.get("sin_marcar", []))
    counts["titulo_sin_marcar"][1].update(a["video"] for a in sin_marcar)
    for a in sin_texto:
        if a.get("nombrada"):  # its piece is counted with its row, below
            counts["sin_texto_video"][1].add(a["video"])
            continue
        ps = [k for k in (canon[(fold(t), fold(cr))] for t, cr in pieces(a["line"])) if k not in no_lyric]
        counts["sin_texto_video"][0].update(ps)
        if ps or is_choice(a["line"]) or not pieces(a["line"]):  # not when all its pieces are instrumental
            counts["sin_texto_video"][1].add(a["video"])
    for r in rows + extra_rows + ident_rows:
        if r["sin_texto"]:
            counts["sin_texto_video"][0].add(r["id"])
    for r in ident_rows:
        counts["sin_texto_video"][1].update(w["video"] for w in r["sin_texto"])
    for f in fuera:
        if f["estado"] == "sin_programa":
            counts["edicion_sin_programa"][1].add(f["video"])
        elif f["estado"] == "sin_identificar":
            counts["actuacion_sin_identificar"][1].add(f["video"])
    solo_sin_texto = len({k for k in notext if k not in by_id and k not in no_lyric})
    return {"rows": rows, "extra": extra_rows, "identificadas": ident_rows, "instrumental": instrumental,
            "entries": entries, "choice": choice,
            "sin_texto": [a for a in sin_texto if a["video"] in counts["sin_texto_video"][1]], "sin_marcar": sin_marcar,
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
    otras = r.get("otras", [])
    more = ""
    if otras:  # another performance in a video already aligned
        more = (f"; {plural(len(otras), 'actuación más sin alinear', 'actuaciones más sin alinear')}: "
                + "; ".join(MOTIVOS[c][0] for c in MOTIVOS if c in {o["code"] for o in otras}))
    states = [r["state"][v] for v in r["videos"]]
    if not states:
        return f"texto guardado, sin alinear: {MOTIVOS['sin_alinear'][0]}"
    ok = states.count("ok")
    labels = "; ".join(MOTIVOS[c][0] for c in MOTIVOS if c in states)
    if ok == len(states):
        return "✅ alineada" + more
    if ok:
        return f"✅ {ok} de {len(states)} videos; sin alinear en {len(states) - ok}: {labels}" + more
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
        "Los motivos de cada hueco: `data/letras/huecos.json`; qué obra es cada actuación que el programa no nombra: "
        "`data/letras/identificaciones.json`.",
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
    fill = {"a_eleccion": {"n": len(a["choice"]), "k": sum(bool(c["identificadas"]) for c in a["choice"])},
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
    no_es_canto = sum(f["estado"] == "no_es_canto" for f in fuera)
    aparte = []
    if no_es_canto:
        aparte.append(f"{plural(no_es_canto, 'video', 'videos')} cuyo título dice que no se canta (instrumento, danza, "
                      "recitación)")
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
    if a["identificadas"]:
        out += ["", "## Obras identificadas, sin texto", "",
                "Actuaciones «a elección» (o sin competencia) cuya obra ya se sabe, por el anuncio, el título o lo que se oye "
                "(`data/letras/identificaciones.json`), pero que no tienen texto guardado: siguen siendo un hueco de «falta el "
                "texto». Con derechos, el texto lo da el mantenedor; de dominio público, puede venir de una fuente pública "
                "citada (skill `video-lyrics`).", "",
                "| Obra | Autoría | Derechos | Confianza | Dónde | Evidencia |", "|---|---|---|---|---|---|"]
        for r in a["identificadas"]:
            es = r["idents"]
            derechos = " / ".join(dict.fromkeys(DERECHOS[e["derechos"]] for e in es))
            confianza = " / ".join(dict.fromkeys(e["confianza"] for e in sorted(es, key=lambda e: CONFIANZA.index(e["confianza"]))))
            ws = sorted(r["where"] + r["sin_texto"], key=lambda w: w["video"])
            sin = {w["video"] for w in r["sin_texto"]}
            donde = " ".join(link(w["video"], w["t"]) + (" (sin texto publicado)" if w["video"] in sin else "")
                             for w in one_per_video(ws))
            evid = " ".join(dict.fromkeys(" ".join(x for x in (e["evidencia"].strip(), e.get("nota", "").strip()) if x)
                                          for e in es))
            out.append(f"| {r['title']} | {r['credit'] or '—'} | {derechos} | {confianza} | {donde} | {evid} |")
    if a["sin_texto"]:
        out += ["", "## Obras en videos sin texto publicado", "",
                "Competencias cantadas del programa (y obras con texto guardado que el título nombra) cuyos videos todavía "
                "no tienen texto publicado: entran en la tabla de arriba cuando lo tengan.", "",
                "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
        for c in sorted(a["sin_texto"], key=lambda c: (c["festival"], c["year"], c["comp"] or 0, c["video"], c["t"] or 0)):
            line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
            out.append(f"| {c['festival']} {c['year']} | {c['comp'] or '—'} | {line} | {link(c['video'], c['t'])} |")
    if a["sin_marcar"]:
        out += ["", "## Obras sin marcar en el programa", "",
                "Competencias cantadas cuya línea del programa nombra la obra sin «»: el informe no puede leer qué obra "
                "es hasta que la transcripción marque el título; entonces entra en la tabla de arriba.", "",
                "| Edición | Comp. | Programa | Video |", "|---|---|---|---|"]
        for c in sorted(a["sin_marcar"], key=lambda c: (c["festival"], c["year"], c["comp"], c["video"], c["t"] or 0)):
            line = c["line"] if len(c["line"]) <= 110 else c["line"][:107] + "…"
            out.append(f"| {c['festival']} {c['year']} | {c['comp']} | {line} | {link(c['video'], c['t'])} |")
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
            line = (f"- {e['name']}: {' '.join(link(w['video'], e['tiempos'].get(w['video'], w['t'])) for w in ws)}. "
                    f"{e['detalle']}")
            sin = one_per_video(sorted((w for r in e["targets"] for w in r["sin_texto"]), key=lambda w: (w["video"], w["t"] or 0)))
            if sin:
                line += (f" Además, {plural(len(sin), 'video sin texto publicado', 'videos sin texto publicado')}: "
                         + " ".join(link(w["video"], w["t"]) for w in sin) + ".")
            out.append(line)
        out.append("")
    out += ["## Obras «a elección» (identificar primero cuál se cantó)", "",
            "Escuchar el video o leer el anuncio; con el título, la letra se pide como cualquier otra. También están las "
            "competencias de repertorio libre, cuya línea del programa da un género o un tema y no una obra. Un clip con "
            "una sola actuación sale de la lista cuando se sabe qué obra es (un texto, una entrada de huecos, su título o "
            "una identificación en `data/letras/identificaciones.json`); en una sesión larga queda, con lo ya "
            "identificado (un texto alineado dentro del capítulo de esa competencia o cuyo `programa` la nombra, o una "
            "identificación con su tiempo dentro del capítulo).", "",
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
    pending = sum(any(s != "ok" for s in r["state"].values()) or bool(r["otras"]) for r in a["rows"])
    print(f"{OUT.relative_to(REPO)}: {len(a['rows'])} pieces, {pending} with a gap, {len(a['entries'])} documented, "
          f"{len(a['choice'])} a elección, {a['counts']['sin_texto_video'][1]} videos without text, "
          f"{a['counts']['edicion_sin_programa'][1]} in editions without programa, "
          f"{a['counts']['actuacion_sin_identificar'][1]} unidentified")
