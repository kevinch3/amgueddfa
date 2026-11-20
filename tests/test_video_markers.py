from scripts.video_markers import detect, programa_stage, programa_titles

PROG = """## Música · Cerddoriaeth
26. Recitación para voz femenina: «Luciérnagas», Gioconda Belli.
47. Solo libre para voz femenina o masculina: «Sebben, crudele», Antonio Caldara.
64. Cuarteto mixto: himno a elección.
7. Corona del Eisteddfod, Premio Municipalidad de Trelew: poema inédito.
"""


def test_programa_titles():
    t = programa_titles(PROG)
    assert t["64"] == "Cuarteto mixto: himno a elección"
    assert set(t) == {"26", "47", "64", "7"}


def test_detect_starts_skips_upcoming_and_verdicts_and_scores_by_title_words():
    cues = [
        (100.0, "que se vayan preparando para la competencia número 47"),   # upcoming: skipped
        (300.0, "damos inicio con la competencia 26, recitación para voz femenina"),
        (900.0, "veredicto de la competencia 64"),                          # verdict: skipped
        (1200.0, "continuamos con la competencia número 64"),
        (1215.0, "cuarteto mixto, himno"),                                  # title words within 90 s: high
        (2000.0, "competencia número 47"),
        (2300.0, "aplausos"),                                               # no title words near: low
        (2500.0, "competencia número 99"),                                  # not in the programa: dropped
        (3000.0, "y ahora la ceremonia de coronación del poeta"),
    ]
    m = detect(cues, programa_titles(PROG))
    starts = {x["n"]: x for x in m if x["kind"] == "comp"}
    assert set(starts) == {"26", "64", "47"}
    assert starts["26"]["t"] == 300.0 and starts["26"]["high"]
    assert starts["64"]["t"] == 1200.0 and starts["64"]["high"]
    assert starts["47"]["t"] == 2000.0 and not starts["47"]["high"]
    cer = [x for x in m if x["kind"] == "ceremonia"]
    assert len(cer) == 1 and cer[0]["n"] == "corona" and cer[0]["t"] == 3000.0 and cer[0]["high"]


def test_detect_ignores_repeated_caption_lines_and_keeps_first_start():
    cues = [(10.0, "competencia número 64 cuarteto mixto"), (12.0, "competencia número 64 cuarteto mixto"),
            (4000.0, "competencia número 64 cuarteto mixto")]
    m = [x for x in detect(cues, programa_titles(PROG)) if x["kind"] == "comp"]
    assert [(x["n"], x["t"]) for x in m] == [("64", 10.0)]


PROG2 = """## Literatura · Llenyddiaeth
18. Cuento fantástico: «De fugas y apariciones».
## Música · Cerddoriaeth
42. Unawd i fechgyn: «Aberdaron», Meirion Williams.
50. Solo libre: canción rock o pop a elección.
## Artesanías · Gwaith llaw
93. Orfebrería: mate de alpaca con detalles.
"""


def test_verdict_readings_and_non_stage_disciplines_are_not_starts():
    cues = [
        (100.0, "Voy a leer la competencia número 18, cuento fantástico"),           # literature: never on stage
        (200.0, "Competencia 42 solo masculino en galés, dice nuestro jurado"),       # verdict words after the call
        (300.0, "Competencia número 93, orfebrería, mate de alpaca"),                 # crafts: never on stage
        (400.0, "Continuamos con la competencia número 50, solo libre, canción rock"),
    ]
    m = detect(cues, programa_titles(PROG2), stage_only=programa_stage(PROG2))
    assert [(x["n"], x["high"]) for x in m if x["kind"] == "comp"] == [("50", True)]


def test_programa_with_base_year_and_suspensions():
    from scripts.video_markers import merge_programa
    base = "## Música\n44. Unawd cân ysgafn: hunanddewisiad.\n47. Solo libre: obra de Guastavino.\n50. Solo libre: rock.\n"
    adapted = "## Solos · Unawdau\n44. Unawd cân ysgafn: hunanddewisiad. (Suspendida)\n47. Solo libre: obra a elección. (Modificada)\n"
    titles, stage = merge_programa([adapted], base=[base])
    assert titles == {"47": "Solo libre: obra a elección. (Modificada)", "50": "Solo libre: rock"}
    assert stage == {"47", "50"}


def test_calls_for_later_are_not_starts():
    # Phrases heard in the Chubut 2025 sessions: the competition is announced, but starts later.
    cues = [
        (100.0, "Vamos a pasar a la competencia número 64, que va a ser inmediatamente después de la comedia musical. Cuarteto mixto"),
        (200.0, "Y luego de la ceremonia, daremos lugar a la competencia número 26, recitación para voz femenina"),
        (300.0, "Luego de ella, seguiremos con la competencia número 47, solo libre"),
        (400.0, "de la competencia 7 corona del eisteddfod. No los veo que estén listos, así que vamos"),
        (500.0, "Continuamos con la competencia número 64, cuarteto mixto, himno"),
    ]
    m = detect(cues, programa_titles(PROG))
    assert [(x["n"], x["t"]) for x in m if x["kind"] == "comp"] == [("64", 500.0)]


def test_call_for_later_split_over_several_caption_lines():
    # YouTube captions cut phrases in short lines: "No los" / "veo que estén listos".
    cues = [
        (8835.2, "de la competencia 64 cuarteto"),
        (8837.7, "mixto. No los"),
        (8841.8, "veo que estén listos, así que vamos a"),
        (8849.6, "a la competencia número 26, recitación para voz femenina"),
    ]
    m = detect(cues, programa_titles(PROG))
    assert [x["n"] for x in m if x["kind"] == "comp"] == ["26"]
