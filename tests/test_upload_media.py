"""upload_media: what it asks rclone to do (rclone itself is faked)."""
from types import SimpleNamespace

import pytest

from scripts import build_catalog as bc


@pytest.fixture
def calls(monkeypatch):
    seen = []
    monkeypatch.setattr(bc.shutil, "which", lambda _: "/usr/bin/rclone")
    monkeypatch.setattr(bc.subprocess, "run",
                        lambda cmd, **kw: seen.append(cmd) or SimpleNamespace(returncode=0, stderr=""))
    return seen


def item(iid, restricted=False):
    return SimpleNamespace(id=iid, restricted=restricted)


def test_full_run_syncs_whole_tree(tmp_path, calls):
    assert bc.upload_media(tmp_path, [item("a"), item("b", True)], None, "r:b/media") == 0
    (cmd,) = calls
    assert cmd[:4] == ["rclone", "sync", str(tmp_path), "r:b/media"]
    assert "--checksum" in cmd


def test_only_public_item_syncs_just_that_item(tmp_path, calls):
    bc.upload_media(tmp_path, [item("a"), item("b")], "a", "r:b/media")
    (cmd,) = calls
    assert cmd[:4] == ["rclone", "sync", str(tmp_path / "a"), "r:b/media/a"]


def test_only_restricted_item_is_taken_down(tmp_path, calls):
    bc.upload_media(tmp_path, [item("a", True)], "a", "r:b/media")
    assert calls == [["rclone", "purge", "r:b/media/a"]]


def test_missing_rclone_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(bc.shutil, "which", lambda _: None)
    assert bc.upload_media(tmp_path, [], None) == 1
