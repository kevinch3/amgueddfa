from scripts.reconstruct.context import Context
from scripts.reconstruct.merge import OutLine, merge, reply_lines, rules_lines
from scripts.reconstruct.sources import Line
from scripts.reconstruct.windows import Window

CTX = Context("", frozenset())


def win(t0, t1, lines):
    return Window(t0, t1, tuple(lines), CTX, "h")


def test_rules_prefer_lyrics_then_youtube():
    w = win(0, 60, [
        Line(2.0, "competencia doce", "yt_es", "es"), Line(2.0, "competencia 12", "whisper_es", "es"),
        Line(20.0, "lluve mucho", "yt_es", "es"), Line(20.0, "Llueve mucho sobre el valle", "letra", "pt"),
        Line(24.0, "Nadie sabe", "letra", "pt"), Line(40.0, "gracias", "yt_es", "es"),
    ])
    out = rules_lines(w)
    assert [(l.t, l.text, l.fuentes) for l in out] == [
        (2.0, "competencia doce", ("yt_es",)),
        (20.0, "Llueve mucho sobre el valle", ("letra",)),
        (24.0, "Nadie sabe", ("letra",)),
        (40.0, "gracias", ("yt_es",)),
    ]


def test_rules_keep_only_the_window_itself():
    w = win(60, 120, [Line(57.0, "antes", "yt_es", "es"), Line(61.0, "dentro", "yt_es", "es"), Line(122.0, "despues", "yt_es", "es")])
    assert [l.text for l in rules_lines(w)] == ["dentro"]


def test_reply_lines_read_the_model_output():
    out = reply_lines({"lines": [{"t": 3.4, "lang": "es", "text": "hola", "src": ["yt_es", "whisper_es"], "fixes": []}], "_usd": 0.01})
    assert out == [OutLine(3.4, "hola", "es", ("yt_es", "whisper_es"))]


def test_merge_keeps_one_copy_of_overlap_lines():
    a, b = win(0, 60, []), win(60, 120, [])
    dup = OutLine(62.0, "otra vez", "es", ("yt_es",))
    merged = merge([a, b], [[OutLine(10.0, "uno", "es", ("yt_es",)), dup], [dup, OutLine(90.0, "dos", "es", ("yt_es",))]])
    assert [l.text for l in merged] == ["uno", "otra vez", "dos"]


def test_lines_at_the_same_second_keep_their_order():
    # Sorting whole tuples ordered same-time lines alphabetically, scrambling uploaded subtitles (OZZG9Epk8CI).
    lines = [OutLine(11.0, "que comienza a abrirse en la temprana", "es", ("subida",)), OutLine(11.0, "Estilizado, el narciso", "es", ("subida",))]
    assert [l.text for l in merge([win(0, 60, [])], [lines])] == ["que comienza a abrirse en la temprana", "Estilizado, el narciso"]
    assert [l.text for l in rules_lines(win(0, 60, []))] == []


def test_rules_keep_the_welsh_model_beside_the_spanish_source():
    # A bilingual window (Chubut 2019 ZfwMxCXBdpM, 8564-8618 s): the announcer in Welsh, then in Spanish.
    # Bangor's lines left in a window are not over Spanish speech (sources drops those), so they stay.
    w = win(8563.9, 8617.9, [
        Line(8578.9, "Mae yna côr parti merched yn dod ar y llwyfan", "cy", "cy", 0.81),
        Line(8602.9, "Mientras el conjunto de mujeres se aproxima al escenario", "whisper_es", "es"),
        Line(8602.9, "mientras el conjunto de mujeres", "yt_es", "es"),
    ])
    assert [(l.t, l.fuentes) for l in rules_lines(w)] == [(8578.9, ("cy",)), (8602.9, ("yt_es",))]
