import pytest

import scripts.letras_pendientes as lp
from scripts.letras_pendientes import (assess, collect, fold, is_choice, pieces, render, sung_competitions,
                                       title_competitions)

PROGRAMA = """## Recitación · Adrodd
26. Para voz femenina: «Poema», Autora Moderna.
## Música · Cerddoriaeth
### Instrumental
40. Piano: «Estudio», Chopin.
### Coros · Corau
70. Côr cymysg: «Anfonaf Angel» [SATB].
71. Prif gystadleuaeth: a) «Cennin Aur» (di-gyfeiliant); b) «Gwinllan», gan R. Jones.
47. Solo libre: «Affanni del pensier», arietta, George F. Händel.
68. Coro familiar: obra a elección.
"""


def test_only_sung_competitions():
    assert sorted(sung_competitions(PROGRAMA)) == [47, 68, 70, 71]


# Trevelin: a language section ("Programa en idioma galés") with the music inside a "###" heading,
# Welsh mutations included (Adran gerddoriaeth, Yr adran lenyddiaeth).
TREVELIN = """## Programa en idioma galés · Rhaglen yn yr iaith Gymraeg
### Yr adran lenyddiaeth
1. Cân i blant: «Y Ffin».
### Adran adrodd
10. Adrodd i blant: «Y Gath».
### Adran gerddoriaeth · Oedolion
40. Unawd i ferched: «Gwcw fach».
### Dawns werin Gymreig · Danzas galesas
50. Parti dawns: «Y Gelynnen».
## Programa en castellano
### Música: adultos
60. Coro mixto: «Dos palomitas», Manuel Gómez Carrillo.
### Instrumental
61. Solo: obra a elección.
### Traducción
70. Traducir una canción.
"""
# Chubut 2021: no "Música" heading, one section per kind of group.
CHUBUT_2021 = """## Recitación · Adrodd
### Yn Gymraeg
1. Adrodd: «Y Môr».
## Solos · Unawdau
### Yn Gymraeg
10. Unawd: «Calon Lân».
## Conjuntos · Partïon
### En castellano y otros idiomas, excepto galés
20. Conjunto vocal: «Esta tierra», Javi Busto.
## Instrumental · Offerynnol
### Yn Gymraeg
30. Unawd: «Llwyn Onn».
"""


def test_music_sections_inside_other_headings():
    assert sorted(sung_competitions(TREVELIN)) == [40, 60]
    assert sorted(sung_competitions(CHUBUT_2021)) == [10, 20]


@pytest.mark.parametrize("line", [
    "Conjunto vocal hasta 12 integrantes con acompañamiento instrumental opcional: «Tu traditora», Orlando de Lassus.",
    "Conjunto o coro familiar: obra a capella o con acompañamiento instrumental, a elección.",
    "Coro de formación libre y conjunto instrumental de formación libre: obra a elección.",
    "Unawd cerdd dant: hunanddewisiad gyda chyfeiliant telyn.",
    "Cân actol: «Y Môr».",
    "Parti neu gôr cân actol: hunanddewisiad.",
    "Competencia especial. Comedia musical: tema «160 aniversario del arribo».",
    "Contralto: «Y Pennill Adroddai fy Nhad», E. D. Lloyd.",  # a word of the title
    "Solo hasta 25 años, con guitarra o laúd: «La partida».",
    "Cystadlu canu penillion gyda'r delyn.",
])
def test_sung_lines_that_name_an_instrument(line):
    assert sung_competitions(f"## Música · Cerddoriaeth\n1. {line}\n") == {1: line}


@pytest.mark.parametrize("line", [
    "Instrumental. Solo instrumental: obra a elección.",
    "Conjunto instrumental hasta 25 años: obra a elección.",
    "Dúo instrumental (violín, cello o flauta y piano): «Salut d'amour», op. 12, Edward Elgar.",
    "Unawd telyn: «Llwyn Onn».",
    "Unawd ar y banjo.",
    "Deuawd: y delyn a chwibanogl.",
])
def test_instrumental_lines_are_not_sung(line):
    assert sung_competitions(f"## Música · Cerddoriaeth\n1. {line}\n") == {}


@pytest.mark.parametrize("title, song", [
    ('[CH2008071] Cân Actol - "Côr Cymraeg Trelew"', True),
    ("[CH2008049] Unawd Cerdd Dant/Arpa - Nancy Wright", True),
    ('Eisteddfod mayor de Trevelin 2012 -"Can Actol"', True),
    ('Eisteddfod del Chubut 2023, día viernes. "Himno", Andrés Evans. Kevin Handley al piano', True),
    ("Solo de guitarra - Juan Pérez", False),
    ("Malambo - Eisteddfod 2016", False),
])
def test_titles_that_are_not_songs(title, song):
    assert lp.not_a_song(title) is (not song)


def test_pieces_and_credits():
    c = sung_competitions(PROGRAMA)
    assert pieces(c[70]) == [("Anfonaf Angel", "")]
    assert pieces(c[71]) == [("Cennin Aur", ""), ("Gwinllan", "R. Jones")]
    assert pieces(c[47]) == [("Affanni del pensier", "arietta, George F. Händel")]
    assert pieces(c[68]) == []


def test_title_competitions():
    assert title_competitions("Eisteddfod del Chubut 2025, día sábado. Competencia Nº 75, segunda") == [75]
    assert title_competitions("CAP. 2 EISTEDDFOD DEL CHUBUT 2.025 COMP. 65, 43, 76, 84 Y 59") == [65, 43, 76, 84, 59]
    assert title_competitions("[CH2013068] Comp. Principal: Coro mixto") == [68]
    assert title_competitions("Eisteddfod del chubut 2025") == []


# --- gaps (data/letras/huecos.json) ---------------------------------------------------------

def piece(title, credit, *videos, comp=76):
    return (fold(title), fold(credit)), {
        "title": title, "credit": credit, "free": False,
        "where": [{"video": v, "t": None, "festival": "chubut", "year": 2023, "comp": comp} for v in videos]}


def data(pieces_, letras=(), spans=None, huecos=(), choice=(), videos=(), titulos=(), sin_texto=(), fuera=(),
         otros=(), span_t=None, span_rangos=None, sin_marcar=(), identificaciones=None):
    ps = dict(pieces_)
    known = ({w["video"] for p in ps.values() for w in p["where"]} | set(videos) | {t["video"] for t in titulos}
             | {a["video"] for a in sin_texto} | {c["video"] for c in choice} | {a["video"] for a in sin_marcar}
             | {f["video"] for f in fuera} | set(spans or {}))
    return {"pieces": ps, "choice": [{"single": False, "rango": None, **c} for c in choice],
            "letras": {x[0]: {"titulo": x[1], "autor": x[2], "programa": x[3] if len(x) > 3 else ""} for x in letras},
            "spans": spans or {}, "span_t": span_t or {}, "span_rangos": span_rangos or {}, "huecos": list(huecos),
            "videos": known, "titulos": list(titulos), "sin_texto": list(sin_texto), "fuera": list(fuera),
            "otros": list(otros), "sin_marcar": list(sin_marcar), "identificaciones": identificaciones or {}}


def titulo(video, title, comp=None, year=2023, texto=True, festival="chubut"):
    return {"video": video, "title": title, "festival": festival, "year": year, "comp": comp, "texto": texto}


def appearance(video, line, comp=76, year=2023, t=None, single=False, rango=None):
    return {"video": video, "t": t, "festival": "chubut", "year": year, "comp": comp, "line": line, "single": single,
            "rango": rango}


def row(md, title):
    return next(line for line in md.splitlines() if line.startswith(f"| {title} |"))


def section(md, heading):
    return md.split(f"## {heading}\n", 1)[1].split("\n## ", 1)[0]


UBI = ("ubi-caritas", "Ubi caritas", "Gjeilo")
ANGOR = ("angor", "Angor", "Tudur Huws Jones")


def test_partly_placed_piece_counts_only_videos_with_its_span():
    d = data([piece("Ubi caritas", "Gjeilo", "vidA", "vidB", "vidC")], letras=[UBI],
             spans={"vidA": ["ubi-caritas"], "vidB": ["ubi-caritas"], "vidC": ["otra-obra"]})
    r = row(render(d), "Ubi caritas")
    assert "✅ 2 de 3 videos" in r
    assert "sin alinear en 1: sin motivo registrado" in r
    # the Dónde column marks each video, since they differ
    assert "✅ [vidA]" in r and "✅ [vidB]" in r and "✗ [vidC]" in r


def test_fully_placed_piece():
    d = data([piece("Ubi caritas", "Gjeilo", "vidA", "vidB")], letras=[UBI],
             spans={"vidA": ["ubi-caritas"], "vidB": ["ubi-caritas"]})
    r = row(render(d), "Ubi caritas")
    assert r.endswith("| ✅ alineada |")
    assert "✗" not in r and "✅ [vidA]" not in r  # same state everywhere: no marks


def test_saved_text_not_placed_shows_its_reason():
    d = data([piece("Angor", "Tudur Huws Jones", "vidF", "vidL")], letras=[ANGOR],
             huecos=[{"letra": "angor", "motivo": "gales_insuficiente",
                      "detalle": "Casi todas las líneas del reconocedor galés quedan bajo el filtro de confianza."}])
    md = render(d)
    assert "texto guardado, sin alinear: el reconocedor galés oyó muy poco" in row(md, "Angor")
    detail = section(md, "Detalle de los huecos documentados")
    assert "«Angor»" in detail and "quedan bajo el filtro de confianza" in detail


def test_reason_for_one_video_of_a_placed_piece():
    d = data([piece("Ubi caritas", "Gjeilo", "vidA", "vidC")], letras=[UBI], spans={"vidA": ["ubi-caritas"]},
             huecos=[{"letra": "ubi-caritas", "videos": ["vidC"], "motivo": "no_esta_en_video",
                      "detalle": "El clip tiene otra obra del mismo coro."}])
    assert "✅ 1 de 2 videos; sin alinear en 1: no se canta en ese video" in row(render(d), "Ubi caritas")


def test_same_title_other_setting_has_no_text():
    d = data([piece("Ave María", "Karl Jenkins", "v1"), piece("Ave María", "Dante Andreo", "v2")],
             letras=[("ave-maria-jenkins", "Ave María", "Karl Jenkins"), ("ave-maria-valva", "Ave Maria", "Marcelo Valva")],
             spans={"v1": ["ave-maria-jenkins"], "v2": ["ave-maria-valva"]},
             huecos=[{"obra": "Ave María", "autoria": "Dante Andreo", "motivo": "version_por_confirmar",
                      "detalle": "Confirmar qué texto usa esta versión."}])
    lines = [line for line in render(d).splitlines() if line.startswith("| Ave María |")]
    jenkins = next(line for line in lines if "Karl Jenkins" in line)
    andreo = next(line for line in lines if "Dante Andreo" in line)
    assert jenkins.endswith("| ✅ alineada |")
    assert andreo.endswith("| versión por confirmar |")


def test_saved_text_outside_the_programa_table():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")], videos=["vH"],
             letras=[("de-quien-pago-mi-redencion", "De quien pagó mi redención", "Himno, anónimo")],
             huecos=[{"letra": "de-quien-pago-mi-redencion", "videos": ["vH"], "motivo": "estrofa_omitida",
                      "detalle": "Se canta sin la segunda estrofa."}])
    assert "texto guardado, sin alinear: se canta sin una estrofa" in row(render(d), "De quien pagó mi redención")


@pytest.mark.parametrize("entry, word", [
    ({"letra": "angro", "motivo": "gales_insuficiente", "detalle": "x"}, "angro"),
    ({"obra": "Angr", "motivo": "version_por_confirmar", "detalle": "x"}, "Angr"),
    ({"letra": "angor", "motivo": "falta_texto", "detalle": "x"}, "falta_texto"),  # the default needs no entry
    ({"obra": "Cwm Rhondda", "autoria": "J. Hughes", "motivo": "version_por_confirmar", "detalle": "x"}, "J. Hughes"),
    ({"letra": "angor", "motivo": "galés", "detalle": "x"}, "galés"),
    ({"letra": "angor", "motivo": "sin_alinear", "detalle": "x"}, "sin_alinear"),
    ({"letra": "angor", "videos": ["vidX"], "motivo": "gales_insuficiente", "detalle": "x"}, "vidX"),
    ({"letra": "angor", "motivo": "gales_insuficiente", "detalle": "x", "comentario": "y"}, "comentario"),
    ({"letra": "angor", "motivo": "gales_insuficiente", "detalle": ""}, "detalle"),
    ({"obra": "Angor", "motivo": "texto_distinto", "detalle": "x"}, "angor"),  # has a text: key it by its slug
    ({"letra": "angor", "videos": ["vidF"], "motivo": "gales_insuficiente", "detalle": "x"}, "vidF"),  # already placed
    ({"letra": "angor", "desde": {"vidX": 5}, "motivo": "gales_insuficiente", "detalle": "x"}, "vidX"),  # time of no video
    ({"letra": "angor", "desde": {"vidL": -5}, "motivo": "gales_insuficiente", "detalle": "x"}, "desde"),
])
def test_unknown_or_stale_entry_raises(entry, word):
    d = data([piece("Angor", "Tudur Huws Jones", "vidF", "vidL"), piece("Cwm Rhondda", "John Hughes", "v1")],
             letras=[ANGOR], spans={"vidF": ["angor"]}, huecos=[entry])
    with pytest.raises(ValueError, match=word):
        assess(d)


def test_two_entries_for_the_same_video_raise():
    e = {"letra": "angor", "motivo": "gales_insuficiente", "detalle": "x"}
    d = data([piece("Angor", "Tudur Huws Jones", "vidF")], letras=[ANGOR],
             huecos=[e, {**e, "motivo": "texto_distinto"}])
    with pytest.raises(ValueError, match="vidF"):
        assess(d)


def test_instrumental_is_listed_apart_and_not_counted():
    d = data([piece("La muerte del ángel", "Astor Piazolla", "v1", "v2"), piece("Cwm Rhondda", "John Hughes", "v3")],
             huecos=[{"obra": "La muerte del ángel", "motivo": "instrumental",
                      "detalle": "Según el mantenedor, el arreglo no tiene texto."}])
    md = render(d)
    assert not any(line.startswith("| La muerte del ángel |") for line in md.splitlines())
    assert "video transcripto: **1** " in md
    huecos = section(md, "Huecos documentados")
    assert "| falta el texto | 1 | 1 |" in huecos
    assert "«La muerte del ángel»" in huecos and "el arreglo no tiene texto" in huecos


def test_summary_table():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1", "v2"),
              piece("Angor", "Tudur Huws Jones", "v3", "v4"),
              piece("Ubi caritas", "Gjeilo", "v5", "v6")],
             letras=[ANGOR, UBI], spans={"v5": ["ubi-caritas"]},
             huecos=[{"letra": "angor", "videos": ["v3"], "motivo": "gales_insuficiente", "detalle": "x"},
                     {"letra": "angor", "videos": ["v4"], "motivo": "no_esta_en_video", "detalle": "y"}],
             choice=[{"video": "v1", "t": None, "festival": "chubut", "year": 2023, "comp": 68, "line": "Coro: obra a elección."},
                     {"video": "v1", "t": None, "festival": "chubut", "year": 2023, "comp": 69, "line": "Dúo: a elección."}],
             fuera=[{"video": f"u{i}", "festival": "chubut", "year": 2023, "texto": False, "estado": "sin_identificar"}
                    for i in range(7)])
    md = render(d)
    assert md.index("## Huecos documentados") < md.index("| Obra | Autoría")
    huecos = section(md, "Huecos documentados")
    table = [line for line in huecos.splitlines() if line.startswith("| ") and not line.startswith("| Motivo")]
    assert [line.split(" | ")[:3] for line in table] == [
        ["| falta el texto", "1", "2"],
        ["| sin motivo registrado", "1", "1"],
        ["| el reconocedor galés oyó muy poco", "1", "1"],
        ["| no se canta en ese video", "1", "1"],
        ["| obra «a elección» sin identificar", "—", "1"],
        ["| actuación sin identificar", "—", "7"],
    ]
    assert all(line.rstrip(" |").split(" | ")[3] for line in table)  # each says what would close it
    assert "modelo galés" in huecos  # the running Welsh pass
    assert "no se suman" in huecos  # the columns are explained
    assert render(d) == md  # deterministic


def test_repo_gaps_file_is_valid():
    """data/letras/huecos.json names only pieces, texts and videos the report knows."""
    assess(collect())


def test_shared_title_needs_its_autoria():
    d = data([piece("Ave María", "Karl Jenkins", "v1"), piece("Ave María", "Dante Andreo", "v2")],
             letras=[("ave-maria-jenkins", "Ave María", "Karl Jenkins"), ("ave-maria-valva", "Ave Maria", "Marcelo Valva")],
             huecos=[{"obra": "Ave María", "motivo": "version_por_confirmar", "detalle": "x"}])
    with pytest.raises(ValueError, match="autoria"):
        assess(d)


# --- videos reached by their title ------------------------------------------------------------

ZAMBA = ("zamba-del-carnaval", "Zamba del carnaval", "Cuchi Leguizamón")
HEN = ("hen-ferchetan", "Hen Ferchetan", "Tradicional galesa")


def test_video_reached_only_by_its_title():
    d = data([piece("Zamba del carnaval", "Cuchi Leguizamón", "vA", comp=71)], letras=[ZAMBA],
             spans={"vA": ["zamba-del-carnaval"]},
             titulos=[titulo("vT", "Zamba del carnaval. eisteddfod del Chubut 2022", year=2022),
                      titulo("vW", "Zambas del carnavalito 2022", year=2022)])  # word-bounded: no match
    r = row(render(d), "Zamba del carnaval")
    assert "| 2 | chubut 2022; chubut 2023 comp. 71<br>" in r  # its edition, from the title (no competition named)
    assert "✅ 1 de 2 videos; sin alinear en 1: sin motivo registrado" in r
    assert "✅ [vA]" in r and "✗ [vT]" in r and "vW" not in r


def test_out_of_table_text_whose_second_video_is_unaligned():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")], letras=[HEN], spans={"vA": ["hen-ferchetan"]},
             span_t={"vA": {"hen-ferchetan": 12}},
             titulos=[titulo("vA", "2017 Comp. 43 Tercer premio", comp=43, year=2017),
                      titulo("vB", '[CH2012042] Unawd agored: "Hen Ferchetan" - Caren Jones', comp=42, year=2012)],
             choice=[appearance("vB", "Unawd agored: hunanddewisiad.", comp=42, year=2012, single=True)])
    md = render(d)
    r = row(md, "Hen Ferchetan")
    assert "✅ 1 de 2 videos; sin alinear en 1: sin motivo registrado" in r
    assert "✅ [vA 0:12](https://www.youtube.com/watch?v=vA&t=12s)" in r and "✗ [vB]" in r
    # its title already says what was sung: not an «a elección» piece to identify
    assert "vB" not in section(md, "Obras «a elección» (identificar primero cuál se cantó)")


def test_a_title_shared_by_two_settings_reaches_no_row():
    settings = [piece("Ave María", "Karl Jenkins", "v1"), piece("Ave María", "Dante Andreo", "v2")]
    named = [titulo("vT", "Ave María - Coro de Cámara")]
    for texts in ([("ave-maria-jenkins", "Ave María", "Karl Jenkins")],  # two settings in the programa
                  [("ave-maria-jenkins", "Ave María", "Karl Jenkins"), ("ave-maria-valva", "Ave Maria", "Marcelo Valva")]):
        md = render(data(settings, letras=texts, spans={"v1": ["ave-maria-jenkins"]}, titulos=named))
        assert "vT" not in md
        jenkins = next(line for line in md.splitlines() if line.startswith("| Ave María |") and "Karl Jenkins" in line)
        assert jenkins.endswith("| ✅ alineada |")


# --- what the programa table leaves out -------------------------------------------------------

def test_video_without_published_text_is_counted_under_its_own_reason():
    d = data([piece("Ave María", "Dante Andreo", "v2", comp=82)],
             letras=[("ave-maria-jenkins", "Ave María", "Karl Jenkins"), ("ave-maria-valva", "Ave Maria", "Marcelo Valva")],
             huecos=[{"obra": "Ave María", "autoria": "Dante Andreo", "motivo": "version_por_confirmar",
                      "detalle": "Confirmar qué texto usa."}],
             sin_texto=[appearance("vN1", "Conjunto femenino: «Ave María», Dante Andreo.", comp=82, year=2015),
                        appearance("vN2", "Conjunto femenino: «The seal lullaby», Eric Whitacre.", comp=67, year=2019),
                        appearance("vN3", "Coro: obra a elección.", comp=92, year=2015)])
    md = render(d)
    assert "| el video no tiene texto publicado | 2 | 3 |" in section(md, "Huecos documentados")
    assert "sin texto publicado" in md.split("## Huecos documentados")[0]  # the header says the count leaves them out
    assert "| 1 (+1 sin texto) |" in row(md, "Ave María")
    sin = section(md, "Obras en videos sin texto publicado")
    assert "The seal lullaby" in sin and "[vN2]" in sin and "[vN3]" in sin and "[vN1]" in sin
    detail = section(md, "Detalle de los huecos documentados")
    andreo = next(line for line in detail.splitlines() if "Dante Andreo" in line)
    assert "1 video sin texto publicado" in andreo and "[vN1]" in andreo


def test_unidentified_performances_do_not_depend_on_text():
    def f(v, estado, texto=True, year=2019):
        return {"video": v, "festival": "chubut", "year": year, "texto": texto, "estado": estado}
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")], letras=[HEN],
             titulos=[titulo("vt", "Hen Ferchetan - Wilber", year=2016)],
             fuera=[f("a", "sin_identificar"), f("b", "sin_identificar", texto=False),
                    f("c", "sin_programa", year=2016), f("d", "sin_programa", texto=False, year=2016),
                    f("e", "sin_programa", year=2011), f("n", "no_cantada"),
                    f("vt", "sin_programa", year=2016)])  # named by its title: in the table, not out of it
    md = render(d)
    huecos = section(md, "Huecos documentados")
    sin_id = next(line for line in huecos.splitlines() if line.startswith("| actuación sin identificar |"))
    assert sin_id.startswith("| actuación sin identificar | — | 2 |")
    assert "1 con texto publicado" in sin_id and "no alcanza" in sin_id
    assert "| edición sin programa transcripto | — | 3 |" in huecos
    assert "Chubut 2016 (2)" in huecos and "Chubut 2011 (1)" in huecos
    assert "1 video cuyo título o capítulos nombran una competencia que este informe no lee como cantada" in huecos


# --- «a elección» -----------------------------------------------------------------------------

def test_an_already_identified_clip_leaves_a_eleccion():
    d = data([piece("Ubi caritas", "Gjeilo", "vF", comp=76)],
             letras=[UBI, ("la-tristecita", "La tristecita", "Ariel Ramírez", "Chubut 2012 comp. 45 (obra a elección)"),
                     ("naranjo-en-flor", "Naranjo en Flor", "", "Chubut 2018 comp. 49 (obra a elección)"),
                     ("de-quien-pago", "De quien pagó mi redención", "Himno, anónimo")],
             spans={"vS": ["la-tristecita"], "vX": ["naranjo-en-flor"], "vF": ["ubi-caritas"]},
             huecos=[{"letra": "de-quien-pago", "videos": ["vH"], "motivo": "estrofa_omitida", "detalle": "x"}],
             choice=[appearance("vS", "Solo libre: tema a elección.", comp=45, year=2012, single=True),
                     appearance("vH", "Cuarteto: himno a elección.", comp=55, year=2018, single=True),
                     appearance("vX", "Solo libre: tango a elección.", comp=49, year=2018, t=20932),
                     appearance("vF", "Coro: «Ubi caritas», Gjeilo; spiritual a elección.", single=True),
                     appearance("vU", "Solo: a elección.", comp=47, year=2014, single=True)])
    md = render(d)
    sec = section(md, "Obras «a elección» (identificar primero cuál se cantó)")
    assert "[vS" not in sec and "[vH" not in sec  # one performance, already known
    vx = next(line for line in sec.splitlines() if "[vX" in line)
    assert "Naranjo en Flor" in vx  # a long session keeps the appearance, with what is already known
    assert "[vF" in sec and "[vU" in sec  # a span of the set piece does not identify the free one
    assert "| obra «a elección» sin identificar | — | 3 |" in section(md, "Huecos documentados")
    assert "**3** apariciones" in md


# --- programa parser --------------------------------------------------------------------------

@pytest.mark.parametrize("line, expected", [
    ("Solo, música folklórica argentina: obra de Gustavo «Cuchi» Leguizamón, a elección.", []),
    ("Solo mayores de 18 años: obra de «Cuchi» Leguizamón a elección.", []),
    ("Coro mixto: «La pomeña», Gustavo «Cuchi» Leguizamón – Manuel Castilla, arr. Hugo de la Vega; obra a elección.",
     [("La pomeña", "Gustavo «Cuchi» Leguizamón – Manuel Castilla, arr. Hugo de la Vega")]),
    ("Conjunto masculino: «Cueca del arenal», Jaime Dávalos – Eduardo Falú, arr. Enrique «Chino» Segura.",
     [("Cueca del arenal", "Jaime Dávalos – Eduardo Falú, arr. Enrique «Chino» Segura")]),
    ("Solo mezzosoprano: «Quae moerebat et dolebat», del «Stabat Mater», Giambattista Pergolesi.",
     [("Quae moerebat et dolebat", "del «Stabat Mater», Giambattista Pergolesi")]),
    ("Solo mezzosoprano: «Ombra mai fu» (de «Xerxes»), George F. Haendel.",
     [("Ombra mai fu", "de «Xerxes», George F. Haendel")]),
    ("Conjunto o coro femenino: «¿Miramos?», de «Tres pequeñas patagónicas», Virgilio Zampini / Daniel Garavano.",
     [("¿Miramos?", "de «Tres pequeñas patagónicas», Virgilio Zampini / Daniel Garavano")]),
    ("Unawd werin: «Y March Glas», «Ym Mhontypridd» neu «Si Hei Lwli Mabi».", []),
    ("Unawd hyd 20 oed: «Cân yn Ofer» neu «Nwy yn y Nen», Dewi Pws.", []),
    # not artefacts: tunes joined by «a» (and), and two set settings a) / b)
    ("Canu gyda'r tannau: alawon «Pen Rhaw», «Serch hudol» a «Codiad yr ehedydd».",
     [("Pen Rhaw", ""), ("Serch hudol", ""), ("Codiad yr ehedydd", "")]),
    ("Prif gystadleuaeth: a) «Gweddi'r Arglwydd», C. Roberts; b) «Gweddi'r Arglwydd», E. Jones.",
     [("Gweddi'r Arglwydd", "C. Roberts"), ("Gweddi'r Arglwydd", "E. Jones")]),
    # the larger work or collection a piece comes from is part of its credit
    ("Conjunto masculino: «Cortadera, plumerito», serie «Flores argentinas», Carlos Guastavino.",
     [("Cortadera, plumerito", "serie «Flores argentinas», Carlos Guastavino")]),
    ("Parti neu gôr cân ysgafn: «Eryr Pengwern» (o'r sioe gerdd «Heledd»), L. Gittins – D. Williams – P. Roberts.",
     [("Eryr Pengwern", "o'r sioe gerdd «Heledd», L. Gittins – D. Williams – P. Roberts")]),
    ("Unawd cân ysgafn: «Weithia» (sioe gerdd «3-2-1»), Gareth Glyn.",
     [("Weithia", "sioe gerdd «3-2-1», Gareth Glyn")]),
    ("Solo tenor: «La tejedora de matras», del ciclo «Quiero darte mi canto», María Julia Alemán de Brandt.",
     [("La tejedora de matras", "del ciclo «Quiero darte mi canto», María Julia Alemán de Brandt")]),
    ("Triawd: «Ar Gyfer Heddiw'r Bore» (trefniant plygain), «Caneuon Llafar Gwlad», Roy Saer.",
     [("Ar Gyfer Heddiw'r Bore", "«Caneuon Llafar Gwlad», Roy Saer")]),
    ("Hasta 25 años, música popular: canción del álbum «Navega», de Jorge Fandermole, a elección.", []),
    # a note in parentheses right after the title is not where the credit ends
    ("Conjunto vocal hasta 24 integrantes: «La finadita» (chacarera), arr. Grupo Vocal Argentino.",
     [("La finadita", "arr. Grupo Vocal Argentino")]),
    # alternatives with a credit between them
    ("Solo libre, música de cámara: «An die Musik», Franz Schubert, o «Canción de cuna india», Gilardo Gilardi.", []),
    # a cân actol (action song) names its theme, not a piece; so does «tema»
    ("Cân actol: «Y Môr».", []),
    ("Cân actol, thema: «Cariad».", []),
    ("Competencia especial. Comedia musical: tema «160 aniversario del arribo».", []),
])
def test_programa_parser_artefacts(line, expected):
    assert pieces(line) == expected


@pytest.mark.parametrize("line", [
    "Solo libre: música rock o blues, homenaje a Luis Spinetta y Pappo Napolitano.",
    "Coro de formación libre: arreglo de música popular argentina o latinoamericana.",
    "Parti neu gôr capel: emyn neu gân Gristnogol.",
    "Competencia especial del Sesquicentenario: relato sonoro de temática regional con dos canciones y un poema.",
    "Unawd i gantorion newydd.",
    "Unawd hyd at 20 oed: Hunandewisiad.",
    "Cân actol: thema «Taith».",
    "Cân actol: «Y Môr».",
    "Solo libre, música de cámara: «An die Musik», Franz Schubert, o «Canción de cuna india», Gilardo Gilardi.",
])
def test_free_repertoire_is_identified_first_like_a_eleccion(line):
    """A sung line that names no piece: someone has to say which one was sung."""
    assert is_choice(line)
    assert not lp.unmarked_title(line)


@pytest.mark.parametrize("line", ["Pedwarawd: Ar hyd y nos.", "Unawd i blant Bl 5 a Bl 6:Tair hwyaden lew."])
def test_a_title_the_programa_does_not_mark(line):
    """The transcription names the piece without «»: not a free choice, and not a piece the report can read."""
    assert pieces(line) == [] and not is_choice(line) and lp.unmarked_title(line)


def test_unmarked_titles_are_counted_and_listed():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             sin_marcar=[{"video": "vP", "t": None, "festival": "trevelin", "year": 2025, "comp": 58,
                          "line": "Pedwarawd: Ar hyd y nos."}])
    md = render(d)
    assert "| el programa no marca el título | — | 1 |" in section(md, "Huecos documentados")
    lista = section(md, "Obras sin marcar en el programa")
    assert "| trevelin 2025 | 58 | Pedwarawd: Ar hyd y nos. | [vP]" in lista


def test_alternative_pieces_are_identified_first_like_a_eleccion():
    assert is_choice("Unawd werin: «Y March Glas», «Ym Mhontypridd» neu «Si Hei Lwli Mabi».")
    assert is_choice("Coro: «Gloria» o «Sanctus», anónimo.")
    assert is_choice("Coro familiar: obra a elección.")
    assert not is_choice("Canu gyda'r tannau: alawon «Pen Rhaw», «Serch hudol» a «Codiad yr ehedydd».")
    assert not is_choice("Côr cymysg: «Anfonaf Angel» [SATB].")


# --- links, times, constants ------------------------------------------------------------------

def test_links_never_hide_an_unaligned_video():
    vids = ["v1", "v2", "v3", "v4", "v5", "v6"]
    k, p = piece("Ubi caritas", "Gjeilo", *vids)
    p["where"].insert(1, {"video": "v1", "t": 120.0, "festival": "chubut", "year": 2023, "comp": 77})  # a second way in
    d = data([(k, p)], letras=[UBI], spans={v: ["ubi-caritas"] for v in vids[:5]})
    r = row(render(d), "Ubi caritas")
    assert "✗ [v6]" in r
    assert r.count("[v1") == 1
    assert "+2 más" in r
    assert "✅ 5 de 6 videos" in r


def test_welsh_pass_sentence_follows_one_constant(monkeypatch):
    d = data([piece("Angor", "Tudur Huws Jones", "vidF")], letras=[ANGOR],
             huecos=[{"letra": "angor", "motivo": "gales_insuficiente", "detalle": "x"}])
    monkeypatch.setattr(lp, "GALES_EN_CURSO", True)
    assert render(d).count("en curso") == 2  # the reason's closing text and the paragraph under the table
    monkeypatch.setattr(lp, "GALES_EN_CURSO", False)
    md = render(d)
    assert "en curso" not in md and "modelo galés" in section(md, "Huecos documentados")


def test_entry_time_gives_the_link_its_t():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")], videos=["vH", "vS"],
             letras=[("de-quien-pago", "De quien pagó mi redención", "Himno, anónimo")],
             huecos=[{"letra": "de-quien-pago", "videos": ["vH", "vS"], "desde": {"vS": 19490},
                      "motivo": "estrofa_omitida", "detalle": "La sesión, hacia 5:24:50, tiene la misma actuación."}])
    detail = section(render(d), "Detalle de los huecos documentados")
    assert "[vS 5:24:50](https://www.youtube.com/watch?v=vS&t=19490s)" in detail
    assert "[vH](https://www.youtube.com/watch?v=vH)" in detail


@pytest.mark.parametrize("code, label", [
    ("por_confirmar", "motivo por confirmar"),
    ("ubicable_desde_clip", "se puede ubicar ya desde un clip alineado"),
    ("poco_oido", "los reconocedores oyeron muy poco del canto"),
])
def test_new_reason_codes(code, label):
    d = data([piece("Angor", "Tudur Huws Jones", "vidF")], letras=[ANGOR],
             huecos=[{"letra": "angor", "motivo": code, "detalle": "x"}])
    md = render(d)
    assert f"| {label} | 1 | 1 |" in section(md, "Huecos documentados")
    assert label in row(md, "Angor")


# --- one row per piece ------------------------------------------------------------------------

def test_one_row_per_piece_when_credits_differ_in_spelling():
    d = data([piece("Rhyddid", "Olwen Jones", "v1", "v2"), piece("Rhyddid", "E. Olwen Jones", "v3"),
              piece("Cwsg Osian", "Cleif Harpwood / Alun Sbardun Huws", "v4"), piece("Cwsg Osian", "", "v5", comp=60),
              piece("La vieja", "Hermanos Díaz, arr. Vivian Tabush", "v6"),
              piece("La vieja", "Hernán Díaz, arr. Vivian Tabbush", "v7"),
              # not the same piece: two set settings of one competition, and one shared surname
              piece("Gweddi'r Arglwydd", "C. Roberts", "v8"), piece("Gweddi'r Arglwydd", "E. Jones", "v8"),
              piece("Nansi", "E. Jones", "v9"), piece("Nansi", "R. Jones", "v10"),
              # an empty credit with two settings to choose from stays apart
              piece("Ave María", "Karl Jenkins", "v11"), piece("Ave María", "Dante Andreo", "v12"),
              piece("Ave María", "", "v13")])
    md = render(d)

    def rows(title):
        return [line for line in md.splitlines() if line.startswith(f"| {title} |")]
    assert len(rows("Rhyddid")) == 1 and "| 3 |" in rows("Rhyddid")[0]
    assert "| E. Olwen Jones |" in rows("Rhyddid")[0]  # a credit inside a fuller one gives way
    assert len(rows("Cwsg Osian")) == 1 and "| Cleif Harpwood / Alun Sbardun Huws |" in rows("Cwsg Osian")[0]
    assert len(rows("La vieja")) == 1 and "Hermanos Díaz" in rows("La vieja")[0] and "Hernán Díaz" in rows("La vieja")[0]
    assert len(rows("Gweddi'r Arglwydd")) == 2
    assert len(rows("Nansi")) == 2
    assert len(rows("Ave María")) == 3
    assert "video transcripto: **10**" in md
    assert "| falta el texto | 10 | 13 |" in section(md, "Huecos documentados")


def test_merged_row_takes_a_gap_entry_by_any_of_its_credits():
    d = data([piece("Rhyddid", "Olwen Jones", "v1"), piece("Rhyddid", "E. Olwen Jones", "v2")],
             huecos=[{"obra": "Rhyddid", "autoria": "Olwen Jones", "motivo": "version_por_confirmar", "detalle": "x"}])
    assert row(render(d), "Rhyddid").endswith("| versión por confirmar |")


def test_no_text_videos_join_the_merged_row():
    d = data([piece("Rhyddid", "Olwen Jones", "v1")],
             sin_texto=[appearance("vN", "Triawd: «Rhyddid», E. Olwen Jones.", comp=51, year=2019)])
    md = render(d)
    assert "| 1 (+1 sin texto) |" in row(md, "Rhyddid")
    assert "(0)" in md.split("## Huecos documentados")[0]  # no piece sung only in videos without text


# --- what a session already identifies --------------------------------------------------------

def test_session_note_from_aligned_spans():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             letras=[("bonita-rama", "Bonita rama de sauce", "Carlos Guastavino"), ("gurisito", "Gurisito", "Daniel Viglietti"),
                     ("otra", "Otra obra", "Anónimo")],
             spans={"vS": ["bonita-rama"], "vM": ["gurisito", "otra"]},
             span_rangos={"vS": {"bonita-rama": [[95, 292]]}, "vM": {"gurisito": [[1500, 1800]], "otra": [[2500, 2600]]}},
             choice=[appearance("vS", "Solo libre: obra a elección de Carlos Guastavino.", comp=75, year=2025, rango=(0, None)),
                     appearance("vM", "Coro: obra a elección.", comp=73, t=1000, rango=(1000, 2000)),
                     appearance("vM", "Dúo: a elección.", comp=74, t=2000, rango=(2000, 2400))])
    sec = section(render(d), "Obras «a elección» (identificar primero cuál se cantó)")
    lines = {(line.split(" | ")[1], line.split(" | ")[3].split("]")[0]): line for line in sec.splitlines()
             if line.startswith("| chubut")}
    assert "ya identificada aquí: «Bonita rama de sauce»" in lines[("75", "[vS")]
    assert "«Gurisito»" in lines[("73", "[vM 16:40")] and "Otra obra" not in lines[("73", "[vM 16:40")]
    assert "ya identificada" not in lines[("74", "[vM 33:20")]  # the span at 2500 s is past this chapter's end


def test_session_note_by_the_middle_of_a_span_and_by_an_entry_time():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1"), piece("Pam Fod Eira yn Wyn?", "Tradicional", "vM", comp=62)],
             letras=[("naranjo", "Naranjo en flor", "Homero Expósito"), ("himno", "Himno de la sesión", "Anónimo"), PAM],
             spans={"vM": ["naranjo", "pam-fod-eira"]},
             span_rangos={"vM": {"naranjo": [[1995, 2300]],  # starts 5 s before its chapter
                                 "pam-fod-eira": [[2100, 2200]]}},  # set piece of comp. 62: a misplaced chapter
             videos=["vM"],
             huecos=[{"letra": "himno", "videos": ["vM"], "desde": {"vM": 1200}, "motivo": "estrofa_omitida", "detalle": "x"}],
             choice=[appearance("vM", "Cuarteto: himno a elección.", comp=55, t=1000, rango=(1000, 2000)),
                     appearance("vM", "Solo libre: tango a elección.", comp=49, t=2000, rango=(2000, 2400))])
    sec = section(render(d), "Obras «a elección» (identificar primero cuál se cantó)")
    c55 = next(line for line in sec.splitlines() if "| 55 |" in line)
    c49 = next(line for line in sec.splitlines() if "| 49 |" in line)
    assert "«Himno de la sesión»" in c55 and "Naranjo" not in c55
    assert "«Naranjo en flor»" in c49 and "Himno" not in c49.split("|")[4]
    assert "Pam Fod" not in c49  # the set piece of another competition is not this one's free piece


# --- a second performance in a video already aligned ------------------------------------------

PAM = ("pam-fod-eira", "Pam Fod Eira yn Wyn?", "Tradicional")


def second_performance(desde):
    return data([piece("Pam Fod Eira yn Wyn?", "Tradicional", "vC", "vS")], letras=[PAM],
                spans={"vC": ["pam-fod-eira"], "vS": ["pam-fod-eira"]},
                span_rangos={"vC": {"pam-fod-eira": [[0, 260]]}, "vS": {"pam-fod-eira": [[10449, 10709]]}},
                huecos=[{"letra": "pam-fod-eira", "videos": ["vS"], "desde": {"vS": desde},
                         "motivo": "gales_insuficiente", "detalle": "La segunda actuación de la sesión."}])


def test_a_second_performance_in_an_aligned_video_keeps_its_entry():
    md = render(second_performance(10844))
    r = row(md, "Pam Fod Eira yn Wyn?")
    assert "✅ alineada" in r and "1 actuación más sin alinear: el reconocedor galés oyó muy poco" in r
    assert "| el reconocedor galés oyó muy poco | 1 | 1 |" in section(md, "Huecos documentados")
    detail = section(md, "Detalle de los huecos documentados")
    assert "[vS 3:00:44](https://www.youtube.com/watch?v=vS&t=10844s)" in detail
    assert "t=10844s" not in r  # the table does not point at the other performance


def test_an_entry_inside_the_aligned_span_raises():
    with pytest.raises(ValueError, match="vS"):
        assess(second_performance(10500))


# --- what is left out, said ------------------------------------------------------------------

def test_clips_whose_title_is_not_a_song_are_counted():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             fuera=[{"video": f"g{i}", "festival": "chubut", "year": 2019, "texto": True, "estado": "no_es_canto"}
                    for i in range(3)])
    huecos = section(render(d), "Huecos documentados")
    assert "3 videos cuyo título dice que no se canta (instrumento, danza, recitación)" in huecos


# --- identifications (data/letras/identificaciones.json) --------------------------------------

def ident(titulo, autoria="Autor", t=None, letra=None, confianza="alta", derechos="con_derechos"):
    e = {"titulo": titulo, "autoria": autoria, "confianza": confianza, "derechos": derechos,
         "evidencia": "Lo anuncia la cantante y lo confirma lo que oyó Whisper."}
    if t is not None:
        e["t"] = t
    if letra:
        e["letra"] = letra
    return e


CHOICE_SEC = "Obras «a elección» (identificar primero cuál se cantó)"
IDENT_SEC = "Obras identificadas, sin texto"


def test_an_identified_clip_leaves_a_eleccion_and_its_piece_stays_a_gap():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             choice=[appearance("vC", "Solo libre: tango a elección.", comp=46, year=2012, single=True),
                     appearance("vD", "Solo libre: tango a elección.", comp=46, year=2012, single=True),
                     appearance("vE", "Solo libre: tango a elección.", comp=46, year=2012, single=True)],
             identificaciones={"vC": [ident("La última curda", "Aníbal Troilo; letra de Cátulo Castillo", t=20)],
                               "vD": [ident("La última curda", "Aníbal Troilo; letra de Cátulo Castillo")]})
    md = render(d)
    sec = section(md, CHOICE_SEC)
    assert "[vC" not in sec and "[vD" not in sec and "[vE" in sec
    assert "por identificar: **1** apariciones" in md
    r = row(section(md, IDENT_SEC), "La última curda")
    assert "Aníbal Troilo; letra de Cátulo Castillo" in r and "con derechos" in r and "alta" in r
    assert "[vC 0:20](https://www.youtube.com/watch?v=vC&t=20s)" in r and "[vD](" in r
    assert "Lo anuncia la cantante" in r
    huecos = section(md, "Huecos documentados")
    assert "| falta el texto | 2 | 3 |" in huecos  # Cwm Rhondda (v1) and the identified piece (vC, vD)
    assert "| obra «a elección» sin identificar | — | 1 |" in huecos


def test_an_identification_in_a_session_is_context_for_its_chapter():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             choice=[appearance("vM", "Solo libre: tango a elección.", comp=49, t=1000, rango=(1000, 2000)),
                     appearance("vM", "Dúo: a elección.", comp=50, t=2000, rango=(2000, 3000))],
             identificaciones={"vM": [ident("Yuyo verde", t=1500)]})
    sec = section(render(d), CHOICE_SEC)
    c49 = next(line for line in sec.splitlines() if "| 49 |" in line)
    c50 = next(line for line in sec.splitlines() if "| 50 |" in line)
    assert "«Yuyo verde»" in c49 and "Yuyo" not in c50  # a session keeps its appearance: others sing there too
    assert "(2 apariciones, 1 con alguna obra ya identificada ahí; lista al final)" in section(render(d), "Huecos documentados")


def test_an_identification_with_a_saved_text_brings_its_video_to_the_text():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             letras=[("hen-ferchetan", "Hen Ferchetan", "Tradicional galesa")],
             spans={"vA": ["hen-ferchetan"]}, videos=["vB"],
             identificaciones={"vA": [ident("Hen Ferchetan", letra="hen-ferchetan", derechos="dominio_publico")],
                               "vB": [ident("Hen Ferchetan", letra="hen-ferchetan", derechos="dominio_publico")]})
    md = render(d)
    r = row(section(md, "Textos guardados fuera de la tabla"), "Hen Ferchetan")
    assert "✅ [vA]" in r and "✗ [vB]" in r and "sin motivo registrado" in r
    assert "Hen Ferchetan" not in section(md, "Huecos documentados").split(IDENT_SEC)[0].split("| Obra |")[0]
    assert IDENT_SEC not in md  # no identified piece without text


def test_an_identification_wins_over_a_title_that_names_another_setting():
    d = data([piece("Ave verum corpus", "Francis Poulenc", "vP", comp=89)],
             letras=[("ave-verum-poulenc", "Ave verum corpus", "Francis Poulenc")],
             titulos=[titulo("vQ", "[CH2014054] Ave Verum Corpus - Cuarteto", comp=54)],
             identificaciones={"vQ": [ident("Ave verum corpus (arreglo sin identificar)", derechos="sin_confirmar",
                                            confianza="media")]})
    md = render(d)
    assert "[vQ" not in row(md, "Ave verum corpus")
    assert "[vQ" in row(section(md, IDENT_SEC), "Ave verum corpus (arreglo sin identificar)")


def test_an_identified_performance_is_no_longer_unidentified():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             fuera=[{"video": f"u{i}", "festival": "chubut", "year": 2014, "texto": True, "estado": "sin_identificar"}
                    for i in range(3)],
             identificaciones={"u0": [ident("Bring Him Home")]})
    md = render(d)
    assert "| actuación sin identificar | — | 2 |" in section(md, "Huecos documentados")
    assert "[u0" in row(section(md, IDENT_SEC), "Bring Him Home")


@pytest.mark.parametrize("entry, message", [
    ({"vX": [ident("Obra")]}, "vX"),  # unknown video
    ({"v1": [ident("Obra", letra="no-existe")]}, "no-existe"),
    ({"v1": [ident("Obra", confianza="segura")]}, "confianza"),
    ({"v1": [ident("Obra", derechos="libre")]}, "derechos"),
    ({"v1": [{**ident("Obra"), "evidencia": " "}]}, "evidencia"),
    ({"v1": [{**ident("Obra"), "letras": "x"}]}, "letras"),
    ({"v1": [{**ident("Obra"), "t": -3}]}, "'t'"),
])
def test_an_identification_the_report_cannot_read_raises(entry, message):
    with pytest.raises(ValueError, match=message):
        assess(data([piece("Cwm Rhondda", "John Hughes", "v1")], identificaciones=entry))


def test_identifications_file_is_read(tmp_path):
    p = tmp_path / "identificaciones.json"
    p.write_text('{"nota": "x", "identificaciones": {"v1": [{"titulo": "Obra", "confianza": "alta", '
                 '"derechos": "con_derechos", "evidencia": "El anuncio."}]}}', encoding="utf-8")
    assert lp.load_identificaciones(p) == {"v1": [{"titulo": "Obra", "confianza": "alta", "derechos": "con_derechos",
                                                   "evidencia": "El anuncio."}]}
    p.write_text('{"identificaciones": {"v1": {"titulo": "Obra"}}}', encoding="utf-8")
    with pytest.raises(ValueError, match="lista"):
        lp.load_identificaciones(p)
    assert lp.load_identificaciones(tmp_path / "no-hay.json") == {}


def test_an_identified_piece_in_a_video_without_text_is_counted_there():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")],
             titulos=[titulo("vN", "Competencia principal - Open thou mine eyes", texto=False)],
             identificaciones={"vN": [ident("Open thou mine eyes", "John Rutter", derechos="sin_confirmar")]})
    md = render(d)
    huecos = section(md, "Huecos documentados")
    assert "sin motivo registrado" not in huecos.split("Cada caso")[1]
    assert "| el video no tiene texto publicado | 1 | 1 |" in huecos
    assert "[vN](https://www.youtube.com/watch?v=vN) (sin texto publicado)" in row(section(md, IDENT_SEC), "Open thou mine eyes")


def test_a_video_with_a_span_but_no_text_yet_is_not_listed_as_without_text():
    d = data([piece("Cwm Rhondda", "John Hughes", "v1")], letras=[("hen-wlad", "Hen Wlad fy Nhadau", "Evan James")],
             spans={"vG": ["hen-wlad"]},
             titulos=[titulo("vG", "Gorsedd 2014: Himno galés Hen Wlad fy Nhadau", texto=False)])
    md = render(d)
    assert "✅ alineada" in row(section(md, "Textos guardados fuera de la tabla"), "Hen Wlad fy Nhadau")
    assert "Obras en videos sin texto publicado" not in md  # its rebuild will publish the text with the lyric
