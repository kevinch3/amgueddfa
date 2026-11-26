"""The app-data-update helper's batch → SQL step (no database: facts_sql only builds the text)."""
import importlib.util
import json
import re
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "db_helper", Path(__file__).resolve().parents[1] / ".claude/skills/app-data-update/db.py")
db = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(db)

ADMIN = "00000000-0000-4000-8000-000000000001"


def _facts(sql: str) -> list[list[dict]]:
    """The facts JSON of every admin_add_facts call, in order."""
    return [json.loads(m.replace("''", "'")) for m in re.findall(r", '(\[.*?\])'::jsonb\);", sql)]


def test_batch_fuente_on_every_fact():
    sql = db.facts_sql({"contributor": ADMIN, "festival": "chubut", "fuente": "Libro de actas",
                        "years": {"1950": [["venue", "Salón Ejemplo, Trelew"], ["other", "Nota de prueba."]]}})
    (facts,) = _facts(sql)
    assert [f["fuente"] for f in facts] == ["Libro de actas", "Libro de actas"]


def test_row_fuente_overrides_batch_fuente_and_shares_one_lote():
    sql = db.facts_sql({"contributor": ADMIN, "festival": "chubut", "fuente": "Fuente general",
                        "years": {"1950": [["start_date", "1950-10-20", "Cartel del video (0:05): https://example.org/v?t=5s"]],
                                  "1951": [["other", "Nota sin fuente propia."]]}})
    a, b = _facts(sql)
    assert a[0]["fuente"] == "Cartel del video (0:05): https://example.org/v?t=5s"
    assert b[0]["fuente"] == "Fuente general"
    assert a[0]["lote"] == b[0]["lote"]


def test_row_fuente_without_batch_fuente():
    sql = db.facts_sql({"contributor": ADMIN, "festival": "trevelin",
                        "years": {"1990": [["other", "Nota uno.", "Placa de la ceremonia (1:00): https://example.org/a"],
                                           ["other", "Nota dos."]]}})
    (facts,) = _facts(sql)
    assert facts[0]["fuente"] == "Placa de la ceremonia (1:00): https://example.org/a"
    assert "fuente" not in facts[1]


def test_apostrophes_are_quoted():
    sql = db.facts_sql({"contributor": ADMIN, "festival": "chubut",
                        "years": {"1960": [["other", "Ganador: Pat O'Brien.", "Diario d'ejemplo"]]}})
    (facts,) = _facts(sql)
    assert facts[0]["value"] == "Ganador: Pat O'Brien." and facts[0]["fuente"] == "Diario d'ejemplo"
