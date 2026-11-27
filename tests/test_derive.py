import os
import time
from pathlib import Path

from PIL import Image

from scripts.catalog.derive import derive
from scripts.catalog.model import Item


def mk(src_path, kind, **kw):
    return Item(id="abc123def456", coleccion="chubut", year=1990, undated=False,
                tipo="otros", title="t", formato=kind, src_path=src_path, **kw)


def test_image_long_side_1200_and_thumb_320(tmp_path):
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    Image.new("RGB", (3000, 2000), "red").save(arch / "a.jpg")
    it = derive(mk("a.jpg", "image"), arch, out)
    assert it.pages == 1 and it.page_paths == ["abc123def456/p01.webp"]
    assert it.thumb == "abc123def456/thumb.webp"
    assert max(Image.open(out / it.page_paths[0]).size) == 1200
    assert max(Image.open(out / it.thumb).size) == 320


def test_pdf_every_page_rendered(tmp_path):
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    pages = [Image.new("RGB", (850, 1100), c) for c in ("white", "gray", "black")]
    pages[0].save(arch / "p.pdf", save_all=True, append_images=pages[1:])
    it = derive(mk("p.pdf", "pdf"), arch, out)
    assert it.pages == 3
    assert it.page_paths == [f"abc123def456/p0{n}.webp" for n in (1, 2, 3)]
    assert all((out / p).exists() for p in it.page_paths)
    assert (out / it.thumb).exists()


def test_table_rows_parsed(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "t.csv").write_text("a,b\n1,2\n3,4\n")
    it = derive(mk("t.csv", "table"), arch, tmp_path / "out")
    assert it.table == [{"a": "1", "b": "2"}, {"a": "3", "b": "4"}]
    assert it.pages == 0 and it.thumb is None


def test_web_excerpt_strips_tags(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "w.html").write_text(
        "<html><head><title>x</title><style>b{}</style></head>"
        "<body><script>var a=1</script><p>Hola &amp; <b>mundo</b></p></body></html>")
    it = derive(mk("w.html", "web"), arch, tmp_path / "out")
    assert it.text_excerpt == "Hola & mundo"


def test_restricted_goes_to_restricted_root(tmp_path):
    arch, pub, res = tmp_path / "arch", tmp_path / "public", tmp_path / "res"
    arch.mkdir()
    Image.new("RGB", (100, 100)).save(arch / "a.png")
    derive(mk("a.png", "image", restricted=True), arch, res)
    assert (res / "abc123def456" / "p01.webp").exists()
    assert not pub.exists()


def test_skip_when_fresh(tmp_path):
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    Image.new("RGB", (100, 100)).save(arch / "a.png")
    it = derive(mk("a.png", "image"), arch, out)
    page = out / it.page_paths[0]
    old = time.time() + 1000
    os.utime(page, (old, old))
    derive(mk("a.png", "image"), arch, out)
    assert page.stat().st_mtime == old
    # a newer source forces regeneration
    newer = old + 1000
    os.utime(arch / "a.png", (newer, newer))
    derive(mk("a.png", "image"), arch, out)
    assert page.stat().st_mtime != old


def test_restricted_text_not_extracted(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "t.csv").write_text("a\n1\n")
    (arch / "w.html").write_text("<p>secret</p>")
    t = derive(mk("t.csv", "table", restricted=True), arch, tmp_path / "o")
    w = derive(mk("w.html", "web", restricted=True), arch, tmp_path / "o")
    assert t.table is None and t.text_excerpt is None
    assert w.text_excerpt is None and w.table is None


def test_failed_pdf_render_leaves_nothing_fresh(tmp_path):
    import pytest
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    (arch / "bad.pdf").write_bytes(b"not a pdf")
    with pytest.raises(RuntimeError, match="pdftoppm"):
        derive(mk("bad.pdf", "pdf"), arch, out)
    assert not (out / "abc123def456").exists()
    assert not list(out.glob(".tmp-*"))
    # a leftover thumb without pages is not "fresh"
    d = out / "abc123def456"
    d.mkdir()
    Image.new("RGB", (10, 10)).save(d / "thumb.webp")
    pages = [Image.new("RGB", (850, 1100), c) for c in ("white", "gray")]
    pages[0].save(arch / "ok.pdf", save_all=True, append_images=pages[1:])
    assert derive(mk("ok.pdf", "pdf"), arch, out).pages == 2


WP_PAGE = """<html><head><title>Reglamento</title></head>
<body class="page header-classic sticky-header menu-highlight">
<div id="Wrapper"><div id="Header_wrapper"><header id="Header">
<div class="widget widget_mfn_recent_comments"><h3>Últimos comentarios</h3>
<div class="Recent_comments"><ul><li><span class="date">3 July, 2017</span>
<p><i class="icon-user"></i> <strong>Lucia DAddona</strong> commented on
<a href="#">Programa Eisteddfod del Chubut 2017</a></p></li></ul></div></div>
<nav id="menu"><ul class="menu"><li class="menu-item"><a>Inicio</a></li>
<li class="menu-item"><a>Institucional</a></li></ul></nav></header></div>
<div id="Subheader"><h1 class="title">Reglamento</h1><ul class="breadcrumbs"><li>Inicio</li></ul></div>
<div id="Content"><div class="section section-post-header"><div class="column one post-nav">
<ul class="next-prev-nav"><li><a class="fixed-nav fixed-nav-prev">Competencias de Danzas 22 junio, 2017</a></li></ul>
<a class="list-nav">Show all</a></div></div><div class="entry-content"><p>Artículo 1: El Eisteddfod del Chubut es un certamen.</p>
<p>Artículo 2: Las obras serán inéditas.<br>Fin.</p></div>
<div class="section section-post-related"><div class="column one-third post-related">
Related posts 13 enero, 2017</div></div><div id="comments"><h3 id="reply-title">Deja un comentario</h3><ol class="commentlist">
<li class="comment"><cite>Juan Pérez</cite> dice: ¡Qué lindo!</li></ol></div></div>
<footer id="Footer"><p>© 2017 secretaria@eisteddfodpatagonia.com</p></footer></div></body></html>"""


def test_web_excerpt_drops_comment_widgets_nav_and_footer(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "w.html").write_text(WP_PAGE, encoding="utf-8")
    it = derive(mk("w.html", "web"), arch, tmp_path / "out")
    ex = it.text_excerpt
    assert ex.startswith("Artículo 1: El Eisteddfod del Chubut es un certamen.")
    assert "Las obras serán inéditas." in ex
    for bad in ("Lucia", "DAddona", "commented", "comentario", "Juan", "dice:",
                "Institucional", "secretaria@", "Inicio", "Danzas", "Show all",
                "Related"):
        assert bad not in ex, bad


def test_web_excerpt_cut_at_text_comment_marker(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "w.html").write_text(
        "<html><body><p>Bases del concurso de poesía.</p>"
        "<p>2 Comentarios</p><p>María López dice: 12 marzo, 2015 at 10:00 Responder</p>"
        "</body></html>", encoding="utf-8")
    it = derive(mk("w.html", "web"), arch, tmp_path / "out")
    assert it.text_excerpt == "Bases del concurso de poesía."
    for leave in ("Leave a Reply", "John says: hi"):
        (arch / "e.html").write_text(f"<p>Rules here.</p><p>{leave}</p><p>Bob Smith</p>")
        assert derive(mk("e.html", "web"), arch, tmp_path / "out").text_excerpt == "Rules here."


def test_web_latin1_page_decoded(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "w.html").write_bytes("<p>La Asociación del Eisteddfod</p>".encode("latin-1"))
    it = derive(mk("w.html", "web"), arch, tmp_path / "out")
    assert it.text_excerpt == "La Asociación del Eisteddfod"


def test_table_cells_lose_sql_escape_artifacts(tmp_path):
    from scripts.catalog.derive import clean_cell
    cases = {
        'Corona del EisteddfodrnTrabajo en verso, inédito': "Corona del Eisteddfod\nTrabajo en verso, inédito",
        'Memoriasrn"De un banco de la plaza"': 'Memorias\n"De un banco de la plaza"',
        'Coro Mixto:rn1) "Cyfoda" - Syr George J. Elveyrn2) Can werin': 'Coro Mixto:\n1) "Cyfoda" - Syr George J. Elvey\n2) Can werin',
        'integrantes).rn rn rna) “Anfonaf Angel”': 'integrantes).\na) “Anfonaf Angel”',
        'artes rnrnvisuales, teatro': 'artes\nvisuales, teatro',
        'Pintura sobre porcelana: rnNivel 1: posa-pava': 'Pintura sobre porcelana:\nNivel 1: posa-pava',
        'Técnica, rnmateriales y soporte': 'Técnica,\nmateriales y soporte',
        'de Carlos Freyerrn': 'de Carlos Freyer',
        'Limrig: n a)“Beth rof yn fy ngês?” holodd Sandra.n n nb)Wrth drefnu  n':
            'Limrig:\na)“Beth rof yn fy ngês?” holodd Sandra.\nb)Wrth drefnu',
        'uno\\r\\ndos\\nTres': 'uno\ndos\nTres',
        'Poema inÃ©dito, ExtensiÃ³n mÃ¡xima': 'Poema inédito, Extensión máxima',
        # real words containing "rn" are untouched
        'Adrodd darn o ryddiaith Codi`n Hwyr': 'Adrodd darn o ryddiaith Codi`n Hwyr',
        '"Byw Fyddi Nant Gwrtheyrn", R. LL. Owain': '"Byw Fyddi Nant Gwrtheyrn", R. LL. Owain',
        'Caperucita encarnada, Jornada, Pengwern, Hernán Bernárdez, barniz': 'Caperucita encarnada, Jornada, Pengwern, Hernán Bernárdez, barniz',
        'yn bwysig yn eich barn chi': 'yn bwysig yn eich barn chi',
    }
    for raw, want in cases.items():
        assert clean_cell(raw) == want, raw


def test_table_derive_cleans_cells(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "t.csv").write_text('a,b\r\n"Ensayorn""¿Hemos perdido?""",x\r\n', encoding="utf-8")
    it = derive(mk("t.csv", "table"), arch, tmp_path / "out")
    assert it.table == [{"a": 'Ensayo\n"¿Hemos perdido?"', "b": "x"}]


def test_restricted_item_note_cleared(tmp_path):
    arch = tmp_path / "arch"
    arch.mkdir()
    (arch / "w.html").write_text("<p>Ganadores: Ana Gómez</p>")
    it = derive(mk("w.html", "web", restricted=True, note_public="Ganadores: Ana Gómez"),
                arch, tmp_path / "o")
    assert it.note_public == ""


def test_restricted_web_text_written_privately(tmp_path):
    arch, res = tmp_path / "arch", tmp_path / "res"
    arch.mkdir()
    (arch / "w.html").write_text(
        "<html><body><nav>Inicio</nav><h1>Resultados</h1><p>Primer premio: Ana</p>"
        "<p>Segundo premio: Juan</p><div class='comments'>Pepe dice: hola</div>"
        "<p>2 Comentarios</p><p>Pepe dice: felicitaciones</p></body></html>")
    it = derive(mk("w.html", "web", restricted=True), arch, res)
    assert it.text_excerpt is None and it.table is None
    text = (res / "abc123def456" / "text.txt").read_text(encoding="utf-8")
    assert text == "Resultados\nPrimer premio: Ana\nSegundo premio: Juan\n"


def test_restricted_text_is_long_but_capped(tmp_path):
    from scripts.catalog.derive import EXCERPT_LEN, TEXT_LEN
    arch, res = tmp_path / "arch", tmp_path / "res"
    arch.mkdir()
    (arch / "w.html").write_text("<p>" + "palabra " * 5000 + "</p>")
    derive(mk("w.html", "web", restricted=True), arch, res)
    text = (res / "abc123def456" / "text.txt").read_text(encoding="utf-8")
    assert EXCERPT_LEN < len(text.strip()) <= TEXT_LEN


def test_restricted_table_text_rendering(tmp_path):
    arch, res = tmp_path / "arch", tmp_path / "res"
    arch.mkdir()
    (arch / "t.csv").write_text("nombre,premio\nAna,1\nJuan,2\n")
    it = derive(mk("t.csv", "table", restricted=True), arch, res)
    assert it.table is None
    assert (res / "abc123def456" / "text.txt").read_text(encoding="utf-8") == \
        "nombre | premio\nAna | 1\nJuan | 2\n"


def test_restricted_doc_text_written(tmp_path, monkeypatch):
    import scripts.catalog.derive as d
    arch, res = tmp_path / "arch", tmp_path / "res"
    arch.mkdir()
    (arch / "a.doc").write_bytes(b"x")
    monkeypatch.setattr(d, "_office_text", lambda p: "Acta  del jurado\r\n\r\n\r\nGanó   Ana\n")
    it = derive(mk("a.doc", "doc", restricted=True), arch, res)
    assert it.text_excerpt is None
    assert (res / "abc123def456" / "text.txt").read_text(encoding="utf-8") == "Acta del jurado\n\nGanó Ana\n"


def test_public_text_items_write_no_text_file(tmp_path):
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    (arch / "w.html").write_text("<p>Hola</p>")
    it = derive(mk("w.html", "web"), arch, out)
    assert it.text_excerpt == "Hola"
    assert not (out / "abc123def456").exists()


def test_empty_restricted_text_writes_nothing(tmp_path):
    arch, res = tmp_path / "arch", tmp_path / "res"
    arch.mkdir()
    (arch / "w.html").write_text("<script>x</script>")
    derive(mk("w.html", "web", restricted=True), arch, res)
    assert not (res / "abc123def456" / "text.txt").exists()


def test_page_one_size_is_recorded_even_when_fresh(tmp_path):
    # The edition page sets the cover's width/height from it, so the layout does not jump (#5).
    arch, out = tmp_path / "arch", tmp_path / "out"
    arch.mkdir()
    Image.new("RGB", (2000, 3000), "red").save(arch / "a.jpg")
    assert derive(mk("a.jpg", "image"), arch, out).page_size == [800, 1200]
    assert derive(mk("a.jpg", "image"), arch, out).page_size == [800, 1200]  # skipped (fresh), still known
