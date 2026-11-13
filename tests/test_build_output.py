import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
CATALOG = REPO / "src" / "data" / "catalog.json"

pytestmark = pytest.mark.skipif(not CATALOG.exists(), reason="catalog not built")


@pytest.fixture(scope="module")
def raw():
    return CATALOG.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def items(raw):
    return json.loads(raw)["items"]


def test_no_personal_data_strings(raw):
    for bad in ("Comment as", "Be the first to comment", " Comments"):
        assert bad not in raw


def test_no_notes_key(items):
    assert all("notes" not in i for i in items)


def test_restricted_not_in_public_media(items):
    for i in items:
        if i["restricted"]:
            assert not (REPO / "public" / "media" / i["id"]).exists()


def test_every_item_has_source_label(items):
    assert all(i["source_label"] for i in items)


def test_restricted_items_have_no_extracted_text(items):
    for i in items:
        if i["restricted"]:
            assert i["text_excerpt"] is None and i["table"] is None, i["id"]


def test_restricted_items_have_no_text(items):
    for i in items:
        if i["restricted"]:
            assert not i["text_excerpt"] and not i["table"] and not i["note_public"], i["id"]


COMMENT_MARKERS = ("comentarios", "deja un comentario", "dejar un comentario",
                   "leave a reply", "responder", " dice:", " says:", "comments",
                   "commented on")


def test_web_excerpts_have_no_comment_sections(items):
    for i in items:
        if i["kind"] == "web" and i["text_excerpt"]:
            low = i["text_excerpt"].lower()
            for m in COMMENT_MARKERS:
                assert m not in low, (i["id"], m)


def test_only_facebook_notes_published(items):
    for i in items:
        if i["source_label"] != "Facebook":
            assert i["note_public"] == "", i["id"]


def test_tables_have_no_escape_artifacts(items):
    import re
    for i in items:
        for row in i["table"] or []:
            for v in row.values():
                v = str(v or "")
                assert "\\r\\n" not in v and "\\n" not in v, i["id"]
                assert not re.search(r"(?:rn){2}|(?<![^\W\d_])rn(?![^\W\d_])", v), (i["id"], v)
