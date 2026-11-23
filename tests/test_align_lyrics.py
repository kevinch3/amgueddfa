from scripts.align_lyrics import align, apply, parse_letra, preview

LETRA = """---
titulo: Canción de prueba
autor: Tradicional
idioma: pt
derechos: Dominio público
---
Verde campo de la sierra
Lindo río que se va

Llueve mucho sobre el valle
Nadie sabe donde está
"""

# What YouTube "heard": the second stanza is sung twice; words half right; a speaker before.
SEG = [
    [0.5, "Competencia 12, coro"],
    [10.0, "verde canto de la"],
    [14.0, "lindo rio que seba"],
    [18.0, "[música]"],
    [20.0, "lluve mucho sobre"],
    [24.0, "nada sabe"],
    [28.0, "lueve mucho [música] el valle"],
    [32.0, "nadie sabe donde"],
    [40.0, "[aplausos]"],
    [45.0, "Muchas gracias al coro"],
]

# SEG as the aligner placed it before the lyric's start and end came from its anchored lines:
# a piece sung through must stay exactly where it was.
SUNG = [[10.0, "Verde campo de la sierra"], [14.0, "Lindo río que se va"],
        [20.0, "Llueve mucho sobre el valle"], [24.0, "Nadie sabe donde está"],
        [28.0, "Llueve mucho sobre el valle"], [32.0, "Nadie sabe donde está"]]

# A text with two stanzas more than the choir sings.
LARGA = LETRA + """
Canta el gallo en la mañana
Vuela el ave sin parar

Brilla el sol en la ventana
Todo vuelve a comenzar
"""

# The announcer and the jury after the applause.
ANUNCIO = [
    [34.0, "Difícil tarea para el jurado de música"],
    [37.0, "Pedimos ahora el veredicto de la competencia"],
    [41.0, "Conjunto instrumental mínimo tres integrantes"],
    [44.0, "Buenas tardes, voy a comenzar con el grupo"],
]


def stanzas(text=LETRA):
    return parse_letra(text)[1]


def test_parse_letra_meta_and_stanzas():
    meta, st = parse_letra(LETRA)
    assert meta["titulo"] == "Canción de prueba" and meta["idioma"] == "pt"
    assert st == [["Verde campo de la sierra", "Lindo río que se va"], ["Llueve mucho sobre el valle", "Nadie sabe donde está"]]


def test_align_detects_repeated_stanza_and_keeps_anchor_times():
    out = align(SEG, stanzas(), 5, 40)
    texts = [x for _, x in out]
    assert texts == ["Verde campo de la sierra", "Lindo río que se va",
                     "Llueve mucho sobre el valle", "Nadie sabe donde está",
                     "Llueve mucho sobre el valle", "Nadie sabe donde está"]
    times = [t for t, _ in out]
    assert times == sorted(times) and len(set(times)) == len(times)
    assert times[0] == 10.0 and times[2] == 20.0 and times[4] == 28.0


def test_a_piece_sung_through_is_placed_as_before():
    assert align(SEG, stanzas(), 5, 40) == SUNG
    once = [s for s in SEG if s[0] < 25 or s[0] >= 40]
    assert align(once, stanzas(), 5, 40) == SUNG[:4]


def test_apply_replaces_only_the_span_and_records_it(tmp_path):
    (tmp_path / "prueba.md").write_text(LETRA, encoding="utf-8")
    t = {"src": "youtube", "lang": "es", "seg": [list(s) for s in SEG]}
    res = apply(t, [{"letra": "prueba", "desde": 5, "hasta": 40}], tmp_path)
    assert res["seg"][0] == [0.5, "Competencia 12, coro"]
    assert res["seg"][-2:] == [[40.0, "[aplausos]"], [45.0, "Muchas gracias al coro"]]
    assert "lluve mucho sobre" not in [x for _, x in res["seg"]]
    assert res["letras"] == [{"desde": 5, "hasta": 40, "titulo": "Canción de prueba", "autor": "Tradicional", "idioma": "pt",
                              "derechos": "Dominio público"}]


def test_apply_without_spans_is_unchanged(tmp_path):
    t = {"src": "youtube", "lang": "es", "seg": [[1.0, "hola"]]}
    assert apply(t, [], tmp_path) == t


def test_align_does_not_invent_repeats():
    once = [s for s in SEG if s[0] < 25 or s[0] >= 40]  # second stanza heard only once
    assert len(align(once, stanzas(), 5, 40)) == 4


def test_a_truncated_performance_leaves_the_unsung_lines_out():
    # hVtD63KLlsw at 1:15:54 in miniature: the choir stops before the end of the text and the
    # span runs on over the applause and the jury.
    seg = [s for s in SEG if s[0] < 25] + [[30.0, "[aplausos]"]] + ANUNCIO
    out, warn = preview(seg, stanzas(LARGA), 5, 48)
    times, texts = [t for t, _ in out], [x for _, x in out]
    assert out[:4] == SUNG[:4]
    assert max(times) < 34.0  # nothing over the announcer
    assert "Todo vuelve a comenzar" not in texts
    assert any("not placed" in w and "stanza 3" in w for w in warn), warn


def test_speech_after_the_singing_gets_no_lyric_lines():
    # The announcer thanks the choir and names words of the text ("lindo", "valle", "donde"):
    # that is not a third pass of the second stanza.
    seg = SEG[:-1] + [
        [44.0, "Muchas gracias al coro, qué lindo el valle"],
        [47.0, "Ahora el jurado nos dirá donde sigue la competencia"],
        [51.0, "Llamamos a los participantes de la siguiente categoría"],
    ]
    assert align(seg, stanzas(), 5, 60) == SUNG


def test_lines_before_the_first_heard_one_stay_off_the_introduction():
    # The span starts on the announcer; the first line is sung but not heard.
    seg = [
        [5.5, "Competencia número 12, coro de cámara"],
        [8.0, "Ahora escuchamos al coro de la escuela"],
        [10.5, "con su director, adelante por favor"],
    ] + [[t + 6, x] for t, x in SEG[2:8]]
    out = align(seg, stanzas(), 5, 46)
    assert out[0][1] == "Verde campo de la sierra"
    assert 14.5 <= out[0][0] < 20.0  # after the last announcer line (10.5) and its few seconds
    assert [t for t, _ in out[1:]] == [20.0, 26.0, 30.0, 34.0, 38.0]


def test_a_stray_word_in_speech_is_not_an_anchor():
    # The last line is not heard; a remark afterwards shares one short word with it ("está").
    seg = SEG[1:5] + [[30.0, "está bien"]]
    out = align(seg, stanzas(), 5, 36)
    assert [x for _, x in out] == [x for _, x in SUNG[:4]]
    assert 20.0 < out[3][0] < 30.0  # after line 3, at the pace of the others, not on the remark


def test_a_recording_that_starts_after_the_first_lines():
    # The clip opens on line 2: line 1 was sung before it and is not squeezed in at 0.
    seg = [[0.0, "lindo rio que seba"]] + [[t - 14, x] for t, x in SEG[3:8]]
    out, warn = preview(seg, stanzas(), 0, 26)
    assert out[0] == [0.0, "Lindo río que se va"]
    assert any("not placed at the start" in w for w in warn), warn


def test_a_segment_that_holds_the_first_lines_places_them_all():
    # One long heard segment at the start of the span holds a weak echo of line 1 ("de la") and line 2:
    # line 1 starts with the segment and line 2 follows it, instead of line 1 being left out.
    seg = [[0.0, "de la lindo rio que seba"]] + [[t - 14, x] for t, x in SEG[3:8]]
    out, warn = preview(seg, stanzas(), 0, 26)
    assert out[0] == [0.0, "Verde campo de la sierra"]
    assert out[1][1] == "Lindo río que se va" and 0.0 < out[1][0] < 6.0
    assert not any("not placed at the start" in w for w in warn), warn
