"""The correction rule against the shared vectors (tests-js/video-corrections.test.ts runs the same files)."""
import copy
import json
from pathlib import Path

import pytest

from scripts.video_corrections import apply_corrections, fold_line

VECTORS = sorted((Path(__file__).parent / "fixtures" / "video-corrections").glob("*.json"))


def test_finds_every_vector():
    assert len(VECTORS) >= 21


@pytest.mark.parametrize("path", VECTORS, ids=[p.name for p in VECTORS])
def test_vector(path):
    v = json.loads(path.read_text(encoding="utf-8"))
    before = copy.deepcopy(v["transcript"])
    out, applied, sin_anclar = apply_corrections(v["transcript"], v["rows"])
    exp = v["expected"]
    assert out["seg"] == exp["seg"]
    assert out["fuentes"] == exp["fuentes"]
    assert ("idiomas" in out) == ("idiomas" in exp)
    assert out.get("idiomas") == exp.get("idiomas")
    assert [[s["id"], s["cambio"]["t"], s["motivo"]] for s in sin_anclar] == v["sinAnclar"]
    assert applied == v["applied"]
    assert v["transcript"] == before


def test_fold_line():
    assert fold_line("¡Gracias, Señor ŵ!") == "gracias senor w"
    assert fold_line("  Côr   Meibion—Gaiman ") == "cor meibion gaiman"
    assert fold_line("♪ ♪") == ""


def test_keeps_other_fields_and_adds_nothing_without_rows():
    t = {"src": "reconstruida", "lang": "es", "seg": [[1, "Hola"]], "fuentes": [["yt_es"]],
         "letras": [{"desde": 5, "hasta": 9, "titulo": "Calon Lân", "autor": "Gwyrosydd", "idioma": "cy"}]}
    assert apply_corrections(t, []) == (t, [], [])


def test_reports_a_change_it_cannot_read_instead_of_dropping_it():
    row = {"id": "r", "reviewed_at": "2026-11-22T10:00:00+00:00", "payload": {"video": {"id": "v"},
           "cambios": [{"t": "x", "antes": "Hola", "texto": "Chau"}, {"t": 3, "texto": "  "}]}}
    out, applied, sin_anclar = apply_corrections({"lang": "es", "seg": [[1, "Hola"]], "fuentes": [["yt_es"]]}, [row])
    assert out["seg"] == [[1, "Hola"]] and applied == []
    assert [s["motivo"] for s in sin_anclar] == ["sin_linea", "sin_linea"]
