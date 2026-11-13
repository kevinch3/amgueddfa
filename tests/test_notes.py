from scripts.catalog.notes import clean_note


def test_fb_note_strips_ui_and_commenters():
    raw = "FB page eisteddfodpuertomadryn; post text: Eisteddfod Mimosa Porth Madryn · Atención FECHAS IMPORTANTES para tener en cuenta 11 24 Comments No comments yet Be the first to comment. Comment as Kevin Roberts | links: http://www.eisteddfodmimosa.org.ar/"
    out = clean_note(raw, "Eisteddfod_Mimosa/2016/Bases_y_avisos/fb_x_1.jpg")
    assert out == "Atención FECHAS IMPORTANTES para tener en cuenta"
    for bad in ("Comment", "Kevin", "Be the first"):
        assert bad not in out


def test_fb_note_with_no_caption_is_empty():
    assert clean_note("FB page x; post text: Eisteddfod Mimosa Porth Madryn · 5 7 Comments No comments yet Be the first to comment. Comment as A B", "a/fb_1.jpg") == ""


def test_non_fb_note_kept_and_truncated():
    assert clean_note("9 pp. official program", "a/b.pdf") == "9 pp. official program"
    assert len(clean_note("x" * 1000, "a/b.pdf")) <= 300
