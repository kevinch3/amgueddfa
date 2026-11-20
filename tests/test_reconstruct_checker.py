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
    assert check_window(W, {"lines": [line(70.0, "Trelew")]})[0].startswith("rule 3")
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
