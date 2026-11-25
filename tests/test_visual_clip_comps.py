from scripts.visual import clip_comps as cc

TITLES = {"22": "Solo vocal femenino, obra libre", "51": "Coro de cámara, obra a elección", "7": "Recitado en galés"}


def row(t, text):
    return {"t": t, "text": text, "conf": 90.0}


def test_code_gives_year_and_number():
    assert cc.from_code("CH2013022") == (2013, "22")
    assert cc.from_code("CH2008001") == (2008, "1")
    assert cc.from_code("JU2013001") is None and cc.from_code("") is None


def test_title_numbers():
    assert cc.from_title("2015 Comp. 99 Primer premio - Dawnswyr Gwanwyn") == ["99"]
    assert cc.from_title("EISTEDDFOD DEL CHUBUT 2.024 APERTURA Y COMP. 76, 28 Y 70") == ["76", "28", "70"]
    assert cc.from_title("Competencia 7 - Recitado") == ["7"]
    assert cc.from_title("Coro en el teatro") == []


def test_cards_in_time_order_one_per_number():
    rows = [row(0, "buenas tardes a todos"), row(5, "COMP. 22 SOLO VOCAL FEMENINO"), row(10, "COMP. 22 SOLO VOCAL FEMENINO"),
            row(40, "competencia 51 coro de cámara")]
    assert [(n, t) for n, t, _ in cc.cards(rows)] == [("22", 5), ("51", 40)]
    assert cc.cards([row(0, "Competencia Nº 7 recitado")])[0][0] == "7"
    assert cc.cards([row(0, "comp")]) == []


def test_a_clip_of_one_competition_starts_at_zero_even_when_its_card_comes_late():
    # 2015: a single-competition clip showed its card at 4:05, with the result; the performance starts at 0:00.
    got = cc.identify("CH2013022", "", 2013, [row(245, "COMP. 22 SOLO VOCAL")], TITLES)
    assert got == {"marks": [[0, "22", "Solo vocal femenino, obra libre"]], "source": "code+card", "review": []}


def test_a_trusted_number_without_a_card_starts_at_zero_only_when_alone():
    assert cc.identify("CH2013022", "", 2013, [], TITLES)["marks"] == [[0, "22", "Solo vocal femenino, obra libre"]]
    assert cc.identify("", "Comp. 22 y 51", 2013, [], TITLES) is None  # two competitions, no times
    assert cc.identify("CH2013099", "", 2013, [], TITLES) is None       # not in the programa


def test_several_competitions_each_at_its_card():
    rows = [row(15, "COMPETENCIA 51 CORO DE CÁMARA"), row(495, "COMPETENCIA 22 SOLO VOCAL")]
    got = cc.identify("", "Apertura y Comp. 51 y 22", 2013, rows, TITLES)
    assert got["marks"] == [[15, "51", "Coro de cámara, obra a elección"], [495, "22", "Solo vocal femenino, obra libre"]]
    assert got["source"] == "title+card"


def test_a_card_against_the_code_or_title_is_not_published():
    got = cc.identify("", "2015 Comp. 22", 2013, [row(150, "COMPETENCIA 51 CORO DE CÁMARA")], TITLES)
    assert got["marks"] == [[0, "22", "Solo vocal femenino, obra libre"]] and got["review"] == ["card 51"]


def test_a_card_alone_must_match_the_title_words():
    assert cc.identify("", "", 2013, [row(5, "COMPETENCIA 51 CORO DE CÁMARA")], TITLES)["source"] == "card"
    assert cc.identify("", "", 2013, [row(5, "COMPETENCIA 51 BUENAS TARDES A TODOS")], TITLES) is None
    assert cc.identify("", "", 2013, [row(5, "COMPETENCIA 60 CORO")], TITLES) is None


def test_marker_file():
    assert cc.marker([[5, "22", "Solo"], [495, "51", "Coro"]]) == {
        "auto": True, "markers": [[5, "22", "Solo", "comp"], [495, "51", "Coro", "comp"]]}
