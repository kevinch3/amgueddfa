import shutil

import pytest
from PIL import Image, ImageDraw, ImageFont

from scripts.ocr import ocr_image, parse_tsv, select, transcribed_ids


def it(id, **kw):
    base = {"id": id, "formato": "image", "tipo": "bases", "coleccion": "chubut", "fecha": {"year": 1990, "inferred": False, "undated": False}, "title": "t",
            "restricted": False, "hidden": False, "no_text": False, "text_excerpt": None}
    return {**base, **kw}


def test_select_only_public_scans_without_text():
    items = [
        it("a"),                               # yes
        it("b", formato="pdf"),                   # yes
        it("c", restricted=True),              # restricted
        it("d", hidden=True),                  # hidden
        it("e", no_text=True),                 # nothing to transcribe
        it("f", text_excerpt="Rhaglen ..."),   # has embedded text
        it("g", formato="web"),                   # not a scan
        it("h"),                               # human transcription
        it("i"),                               # already done
        it("j", tipo="otros"),             # mostly photos
    ]
    assert [i["id"] for i in select(items, transcribed={"h"}, done={"i"})] == ["a", "b"]
    assert [i["id"] for i in select(items, transcribed={"h"}, done={"i"}, skip_categories=set())] == ["a", "b", "j"]


def test_transcribed_ids_reads_file_and_front_matter(tmp_path):
    d = tmp_path / "src" / "data" / "transcripciones"
    d.mkdir(parents=True)
    (d / "aaa.md").write_text("---\nitems: aaa bbb ccc\n---\n## Lunes\n", encoding="utf-8")
    (d / "ddd.md").write_text("## Sin front matter\n", encoding="utf-8")
    assert transcribed_ids(tmp_path) == {"aaa", "bbb", "ccc", "ddd"}


TSV = "\n".join([
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
    "1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t",
    "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tEisteddfod",
    "5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t80\tY",
    "5\t1\t1\t1\t1\t3\t0\t0\t10\t10\t70\tWladfa",
    "5\t1\t1\t1\t2\t1\t0\t0\t10\t10\t60\tRhaglen",
    "5\t1\t2\t1\t1\t1\t0\t0\t10\t10\t-1\t ",
    "5\t1\t2\t1\t1\t2\t0\t0\t10\t10\t100\tTrelew",
    # A phone status bar: few letters, low confidence.
    "5\t1\t3\t1\t1\t1\t0\t0\t10\t10\t30\ti",
    "5\t1\t3\t1\t1\t2\t0\t0\t10\t10\t40\t12:06",
    # Letters but unreadable.
    "5\t1\t4\t1\t1\t1\t0\t0\t10\t10\t20\tUraleajog",
])


def test_parse_tsv_lines_blocks_and_confidence():
    text, conf = parse_tsv(TSV)
    assert text == "Eisteddfod Y Wladfa\nRhaglen\n\nTrelew"
    assert conf == 80.0


def test_parse_tsv_empty():
    assert parse_tsv("level\tpage_num\n") == ("", None)


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
def test_ocr_image_reads_printed_text(tmp_path):
    img = Image.new("RGB", (900, 160), "white")
    ImageDraw.Draw(img).text((20, 40), "EISTEDDFOD 1937", fill="black", font=ImageFont.load_default(size=64))
    p = tmp_path / "x.png"
    img.save(p)
    text, conf = ocr_image(p, "eng")
    assert "EISTEDDFOD" in text and conf is not None
