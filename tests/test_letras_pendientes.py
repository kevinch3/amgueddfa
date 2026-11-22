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
         otros=(), span_t=None):
    ps = dict(pieces_)
    known = ({w["video"] for p in ps.values() for w in p["where"]} | set(videos) | {t["video"] for t in titulos}
             | {a["video"] for a in sin_texto} | {c["video"] for c in choice})
    return {"pieces": ps, "choice": [{"single": False, **c} for c in choice],
            "letras": {x[0]: {"titulo": x[1], "autor": x[2], "programa": x[3] if len(x) > 3 else ""} for x in letras},
            "spans": spans or {}, "span_t": span_t or {}, "huecos": list(huecos), "videos": known,
            "titulos": list(titulos), "sin_texto": list(sin_texto), "fuera": list(fuera), "otros": list(otros)}


def titulo(video, title, comp=None, year=2023, texto=True, festival="chubut"):
    return {"video": video, "title": title, "festival": festival, "year": year, "comp": comp, "texto": texto}


def appearance(video, line, comp=76, year=2023, t=None, single=False):
    return {"video": video, "t": t, "festival": "chubut", "year": year, "comp": comp, "line": line, "single": single}


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
])
def test_programa_parser_artefacts(line, expected):
    assert pieces(line) == expected


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
])
def test_new_reason_codes(code, label):
    d = data([piece("Angor", "Tudur Huws Jones", "vidF")], letras=[ANGOR],
             huecos=[{"letra": "angor", "motivo": code, "detalle": "x"}])
    md = render(d)
    assert f"| {label} | 1 | 1 |" in section(md, "Huecos documentados")
    assert label in row(md, "Angor")
