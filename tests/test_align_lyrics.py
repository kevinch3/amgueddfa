from scripts.align_lyrics import align, apply, parse_letra

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


def test_parse_letra_meta_and_stanzas():
    meta, stanzas = parse_letra(LETRA)
    assert meta["titulo"] == "Canción de prueba" and meta["idioma"] == "pt"
    assert stanzas == [["Verde campo de la sierra", "Lindo río que se va"], ["Llueve mucho sobre el valle", "Nadie sabe donde está"]]


def test_align_detects_repeated_stanza_and_keeps_anchor_times():
    _, stanzas = parse_letra(LETRA)
    out = align(SEG, stanzas, 5, 40)
    texts = [x for _, x in out]
    assert texts == ["Verde campo de la sierra", "Lindo río que se va",
                     "Llueve mucho sobre el valle", "Nadie sabe donde está",
                     "Llueve mucho sobre el valle", "Nadie sabe donde está"]
    times = [t for t, _ in out]
    assert times == sorted(times) and len(set(times)) == len(times)
    assert times[0] == 10.0 and times[2] == 20.0 and times[4] == 28.0


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
    _, stanzas = parse_letra(LETRA)
    once = [s for s in SEG if s[0] < 25 or s[0] >= 40]  # second stanza heard only once
    assert len(align(once, stanzas, 5, 40)) == 4
