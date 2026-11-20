from scripts.reconstruct.checker import check_window
from scripts.reconstruct.context import Context
from scripts.reconstruct.sources import Line
from scripts.reconstruct.windows import Window

W = Window(0.0, 60.0, (
    Line(3.4, "bienvenidos al Stedbot de Trelew", "yt_es", "es"),
    Line(20.0, "¡GRACIAS a Trelew!", "yt_es", "es"),
    Line(30.0, "Olha a Rosa amarela, Rosa", "letra", "pt"),
), Context("Eisteddfod del Chubut 2025.", frozenset({"eisteddfod", "chubut", "trelew", "gaiman"})), "h")


def line(t, text, src=("yt_es",), fixes=(), lang="es"):
    return {"t": t, "lang": lang, "text": text, "src": list(src), "fixes": [dict(f) for f in fixes]}


def test_reply_with_fix_from_word_list_passes():
    reply = {"lines": [line(3.4, "bienvenidos al Eisteddfod de Trelew", fixes=[{"from": "Stedbot", "to": "Eisteddfod"}])]}
    assert check_window(W, reply) == []


def test_invented_word_fails():
    errs = check_window(W, {"lines": [line(3.4, "bienvenidos al Eisteddfod de Trelew, ganadora")]})
    assert len(errs) == 1 and errs[0].startswith("rule 1") and "ganadora" in errs[0]


def test_word_heard_far_away_in_time_fails():
    # "gracias" was heard at 20 s, not near 50 s
    assert check_window(W, {"lines": [line(50.0, "gracias")]})[0].startswith("rule 1")


def test_fix_outside_word_list_fails():
    reply = {"lines": [line(3.4, "bienvenidos al Stedbot de Trelew", fixes=[{"from": "Trelew", "to": "Gaimán Viejo"}])]}
    assert any(e.startswith("rule 2") for e in check_window(W, reply))


def test_time_outside_window_or_backwards_fails():
    assert any(e.startswith("rule 3") for e in check_window(W, {"lines": [line(70.0, "Trelew")]}))
    errs = check_window(W, {"lines": [line(20.0, "gracias a Trelew"), line(3.4, "bienvenidos al Trelew")]})
    assert any(e.startswith("rule 3") for e in errs)


def test_edited_lyric_line_fails():
    reply = {"lines": [line(30.0, "Olha a Rosa vermelha, Rosa", src=("letra",), lang="pt")]}
    assert any(e.startswith("rule 4") for e in check_window(W, reply))
    ok = {"lines": [line(30.0, "Olha a Rosa amarela, Rosa", src=("letra",), lang="pt")]}
    assert check_window(W, ok) == []


def test_punctuation_accents_and_case_still_match():
    assert check_window(W, {"lines": [line(20.0, "gracias a trelew")]}) == []


def test_empty_reply_passes():
    assert check_window(W, {"lines": []}) == []


# Real-shaped context: a programa line and approved facts, as video_context builds them.
CTX_REAL = Context(
    "Eisteddfod del Chubut 2025.\nCompetencia 75: Segunda competencia principal, coro mixto: a) «Rosa Amarela», Heitor Villalobos.\n"
    "ganador_corona: Arie Lloyd de Lewis\nganador_silla: Sara Borda Green",
    frozenset({"eisteddfod", "chubut", "2025", "segunda", "competencia", "principal", "coro", "mixto", "a", "rosa", "amarela",
               "heitor", "villalobos", "arie", "lloyd", "de", "lewis", "sara", "borda", "green", "ganador", "corona", "silla", "trelew"}))
WR = Window(0.0, 60.0, (
    Line(3.4, "bienvenidos al Stedbot de Trelew", "yt_es", "es"),
    Line(30.0, "Olha a Rosa amarela, Rosa", "letra", "pt"),
    Line(32.0, "Tão Formosa, tão bela, Rosa", "letra", "pt"),
), CTX_REAL, "h")


def test_line_made_only_of_word_list_words_fails():
    reply = {"lines": [line(45.0, "ganador corona Sara Borda Green")]}
    assert any(e.startswith("rule 1") for e in check_window(WR, reply))


def test_word_list_word_only_through_a_heard_fix():
    ok = {"lines": [line(3.4, "bienvenidos al Eisteddfod de Trelew", fixes=[{"from": "Stedbot", "to": "Eisteddfod"}])]}
    assert check_window(WR, ok) == []
    unheard_from = {"lines": [line(3.4, "bienvenidos al Eisteddfod de Trelew", fixes=[{"from": "Estéduo", "to": "Eisteddfod"}])]}
    assert any(e.startswith("rule 2") for e in check_window(WR, unheard_from))
    no_fix = {"lines": [line(3.4, "bienvenidos al Eisteddfod de Trelew Sara Borda")]}
    assert any(e.startswith("rule 1") for e in check_window(WR, no_fix))


def test_lyric_words_cannot_build_a_new_line():
    reply = {"lines": [line(30.0, "a Rosa bela, tão amarela", src=("yt_es",), lang="pt")]}
    assert check_window(WR, reply)


def test_lyric_line_must_keep_its_time_and_appear_once():
    moved = {"lines": [line(5.0, "Olha a Rosa amarela, Rosa", src=("letra",), lang="pt")]}
    assert any(e.startswith("rule 4") for e in check_window(WR, moved))
    twice = {"lines": [line(30.0, "Olha a Rosa amarela, Rosa", src=("letra",), lang="pt"),
                       line(30.0, "Olha a Rosa amarela, Rosa", src=("letra",), lang="pt")]}
    assert any(e.startswith("rule 4") for e in check_window(WR, twice))


def test_sources_must_be_real_and_non_empty():
    fake_src = {"lines": [line(3.4, "bienvenidos al Stedbot de Trelew", src=("whisper_es",))]}
    assert any(e.startswith("rule 5") for e in check_window(WR, fake_src))
    no_src = {"lines": [line(3.4, "bienvenidos al Stedbot de Trelew", src=())]}
    assert any(e.startswith("rule 5") for e in check_window(WR, no_src))


def test_line_time_must_be_a_source_time():
    reply = {"lines": [line(4.1, "bienvenidos al Stedbot de Trelew")]}
    assert any(e.startswith("rule 3") for e in check_window(WR, reply))


def test_empty_text_line_fails():
    assert check_window(WR, {"lines": [line(3.4, "  ¡! ")]})


WCY = Window(0.0, 60.0, (Line(10.0, "ac yn cyfarch o Cymru am dychwelyd adre", "cy", "cy"),),
             Context("", frozenset()), "h")


def test_welsh_mutations_of_a_heard_word_pass_in_welsh_lines():
    ok = {"lines": [line(10.0, "ac yn cyfarch o Gymru am ddychwelyd adre", src=("cy",), lang="cy")]}
    assert check_window(WCY, ok) == []


def test_mutations_do_not_open_spanish_lines_or_other_words():
    es = {"lines": [line(10.0, "ac yn cyfarch o Gymru", src=("cy",), lang="es")]}
    assert any(e.startswith("rule 1") for e in check_window(WCY, es))
    other = {"lines": [line(10.0, "ac yn cyfarch o Gaerdydd", src=("cy",), lang="cy")]}
    assert any(e.startswith("rule 1") for e in check_window(WCY, other))
