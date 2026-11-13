import os
import time
from pathlib import Path

from PIL import Image

from scripts.catalog.derive import derive
from scripts.catalog.model import Item


def mk(src_path, kind, **kw):
    return Item(id="abc123def456", festival="chubut", year=1990, undated=False,
                category="otros", title="t", kind=kind, src_path=src_path, **kw)


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
