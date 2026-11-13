import csv
import hashlib
import shutil
from pathlib import Path

from scripts.catalog.scan import scan
from scripts.sync_uploads import source_row, sync, target

FIXTURE = Path(__file__).parent / "fixtures" / "mini_archive"
UID = "11111111-2222-3333-4444-555555555555"
CID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def row(**over):
    r = {
        "id": CID, "festival": "chubut", "year": 1995, "created_at": "2026-11-10T10:00:00Z",
        "reviewed_at": "2026-11-12T09:00:00Z", "display_name": "Ana\tGriffiths",
        "payload": {"category": "programa", "storage_path": f"{UID}/{CID}.pdf", "description": "Programa\ncompleto"},
    }
    r.update(over)
    return r


def test_target_and_source_row():
    rel = target(row())
    assert rel == Path("Eisteddfod_del_Chubut/1995/Programa/Aporte_aaaaaaaa.pdf")
    assert target(row(year=None, payload={"category": "otros", "storage_path": f"{UID}/{CID}.jpg"})) == Path(
        "Eisteddfod_del_Chubut/_general/Varios/Aporte_aaaaaaaa.jpg"
    )
    assert target(row(payload={"storage_path": "../../etc/passwd"})) is None
    assert target(row(festival="nope")) is None
    assert source_row(rel, row(), "2026-11-13") == {
        "path": "Eisteddfod_del_Chubut/1995/Programa/Aporte_aaaaaaaa.pdf",
        "source_url": "Aporte de Ana Griffiths, 2026-11-12",
        "retrieved": "2026-11-13",
        "mime": "application/pdf",
        "notes": "Programa completo",
    }


def test_sync_adds_once_and_scan_accepts_it(tmp_path):
    arch = tmp_path / "arch"
    shutil.copytree(FIXTURE, arch)
    calls = []

    def download(p):
        calls.append(p)
        return b"%PDF-1.4 new programa " + p.encode()

    existing = (arch / "Eisteddfod_del_Chubut/1990/Suelto.png").read_bytes()
    dup = row(id="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", payload={"category": "otros", "storage_path": f"{UID}/{CID}.png"})
    added, skipped = sync(arch, [row(), dup], lambda p: existing if p.endswith(".png") else download(p), "2026-11-13")
    assert added == ["Eisteddfod_del_Chubut/1995/Programa/Aporte_aaaaaaaa.pdf"]
    assert skipped == 1  # same bytes as Suelto.png
    with open(arch / "SOURCES.tsv", encoding="utf-8", newline="") as f:
        rows = {r["path"]: r for r in csv.DictReader(f, delimiter="\t")}
    assert rows[added[0]]["source_url"] == "Aporte de Ana Griffiths, 2026-11-12"

    # idempotent: a re-run neither downloads nor appends
    before = (arch / "SOURCES.tsv").read_bytes()
    calls.clear()
    added2, _ = sync(arch, [row()], download, "2026-11-14")
    assert added2 == [] and calls == []
    assert (arch / "SOURCES.tsv").read_bytes() == before

    items = scan(arch, set())
    new = [i for i in items if i.src_path == added[0]]
    assert len(new) == 1
    assert new[0].source_url is None
    assert new[0].source_label == "Aporte de Ana Griffiths, 2026-11-12"
    assert new[0].id == hashlib.sha256((arch / added[0]).read_bytes()).hexdigest()[:12]


def test_dry_run_writes_nothing(tmp_path):
    arch = tmp_path / "arch"
    shutil.copytree(FIXTURE, arch)
    before = (arch / "SOURCES.tsv").read_bytes()
    added, _ = sync(arch, [row()], lambda p: b"x", "2026-11-13", dry_run=True)
    assert added and not (arch / added[0]).exists()
    assert (arch / "SOURCES.tsv").read_bytes() == before
