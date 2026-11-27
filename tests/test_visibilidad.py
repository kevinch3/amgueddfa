"""Visibility levels in the catalog builder (scripts/catalog/visibilidad.py)."""
import json
from datetime import date
from pathlib import Path

import pytest

from scripts.catalog.model import Item
from scripts.catalog.visibilidad import apply_visibility, load_overrides, published, stricter

REPO = Path(__file__).resolve().parent.parent


def item(iid="a", coleccion="chubut", restricted=False, tipo="programa"):
    return Item(id=iid, coleccion=coleccion, year=1990, undated=False, tipo=tipo,
                title="t", formato="image", src_path="x.jpg", restricted=restricted)


def test_stricter_wins():
    assert stricter("publico", "solo_ficha") == "solo_ficha"
    assert stricter("privado", "solo_ficha") == "privado"
    assert stricter("publico", "publico") == "publico"


def test_restricted_items_become_listed_only_and_stay_restricted():
    a, b = item("a"), item("b", restricted=True, tipo="resultados")
    apply_visibility([a, b], {}, date(2026, 11, 27))
    assert (a.visibilidad, a.restricted) == ("publico", False)
    assert (b.visibilidad, b.restricted) == ("solo_ficha", True)


def test_an_override_can_only_restrict_until_its_date():
    a, b = item("a"), item("b")
    over = {"a": {"visibilidad": "privado"}, "b": {"visibilidad": "solo_ficha", "publico_desde": "2030-01-01"}}
    apply_visibility([a, b], over, date(2029, 12, 31))
    assert (a.visibilidad, a.restricted) == ("privado", True)
    assert (b.visibilidad, b.restricted, b.publico_desde) == ("solo_ficha", True, "2030-01-01")
    assert [i.id for i in published([a, b])] == ["b"]
    apply_visibility([b], over, date(2030, 1, 1))
    assert (b.visibilidad, b.restricted) == ("publico", False)


def test_an_unknown_collection_shows_nothing():
    a = item("a", coleccion="nueva")
    apply_visibility([a], {}, date(2026, 11, 27))
    assert a.visibilidad == "privado" and published([a]) == []


def test_overrides_file_is_valid(tmp_path):
    assert isinstance(load_overrides(REPO), dict)
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "visibilidad.json").write_text(json.dumps({"x": {"visibilidad": "secreto"}}))
    with pytest.raises(ValueError):
        load_overrides(tmp_path)


def test_committed_catalog_matches_the_rules():
    rows = json.loads((REPO / "src" / "data" / "catalog.json").read_text())["items"]
    for r in rows:
        assert r["visibilidad"] in ("publico", "solo_ficha"), r["id"]  # privado never reaches the public repo
        assert r["restricted"] == (r["visibilidad"] != "publico"), r["id"]
        if r["tipo"] == "resultados":
            assert r["visibilidad"] != "publico" or r.get("publico_desde"), r["id"]
