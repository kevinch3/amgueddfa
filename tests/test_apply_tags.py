import json
from types import SimpleNamespace

from scripts import build_catalog as bc


def test_latest_tag_wins_whatever_the_file_order(tmp_path):
    # export_approved.mjs sorts rows by id, so an older tag can come after a newer one.
    (tmp_path / "data" / "approved").mkdir(parents=True)
    rows = [
        {"id": "a", "type": "tag", "item_id": "x", "payload": {"tipo": "programa-del-dia"},
         "created_at": "2026-11-17T13:04:12+00:00", "reviewed_at": "2026-11-17T13:04:12+00:00"},
        {"id": "b", "type": "tag", "item_id": "x", "payload": {"tipo": "programa"},
         "created_at": "2026-11-14T10:44:34+00:00", "reviewed_at": "2026-11-14T11:02:48+00:00"},
    ]
    (tmp_path / "data" / "approved" / "contributions.json").write_text(json.dumps(rows))
    it = SimpleNamespace(id="x", year=2022, tipo="bases", coleccion="chubut",
                         undated=False, year_inferred=False, restricted=False)
    bc.apply_tags([it], tmp_path)
    assert it.tipo == "programa-del-dia"
