import pytest

from scripts.letras_pendientes import assess, collect, fold, pieces, render, sung_competitions, title_competitions

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


def data(pieces_, letras=(), spans=None, huecos=(), choice=(), videos=(), sin_identificar=0):
    ps = dict(pieces_)
    known = {w["video"] for p in ps.values() for w in p["where"]} | set(videos)
    return {"pieces": ps, "choice": list(choice),
            "letras": {s: {"titulo": t, "autor": a, "programa": ""} for s, t, a in letras},
            "spans": spans or {}, "huecos": list(huecos), "videos": known, "sin_identificar": sin_identificar}


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
             sin_identificar=7)
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
