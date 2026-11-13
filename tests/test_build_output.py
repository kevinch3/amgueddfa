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
