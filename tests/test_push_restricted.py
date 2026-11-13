from pathlib import Path

from scripts.push_restricted import content_type, object_keys, read_env


def test_object_keys(tmp_path):
    root = tmp_path / ".restricted"
    (root / "abc123def456").mkdir(parents=True)
    (root / "abc123def456" / "p01.webp").write_bytes(b"1")
    (root / "abc123def456" / "thumb.webp").write_bytes(b"2")
    (root / "0123456789ab").mkdir()
    (root / "0123456789ab" / "p01.webp").write_bytes(b"3")
    (root / "stray.txt").write_text("not in an item folder")
    (root / "abc123def456" / ".tmp-p02.webp").write_bytes(b"partial")
    keys = object_keys(root)
    assert [k for _, k in keys] == [
        "0123456789ab/p01.webp",
        "abc123def456/p01.webp",
        "abc123def456/thumb.webp",
    ]
    assert keys[0][0] == root / "0123456789ab" / "p01.webp"


def test_object_keys_missing_root(tmp_path):
    assert object_keys(tmp_path / "nope") == []


def test_read_env(tmp_path):
    p = tmp_path / ".env"
    p.write_text('# c\nPUBLIC_SUPABASE_URL="https://x.supabase.co"\nexport SUPABASE_SERVICE_ROLE_KEY=abc\n\nBAD\n')
    assert read_env(p) == {"PUBLIC_SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "abc"}


def test_text_file_key_and_content_type(tmp_path):
    root = tmp_path / ".restricted"
    (root / "abc123def456").mkdir(parents=True)
    (root / "abc123def456" / "text.txt").write_text("Ganó Ana", encoding="utf-8")
    (root / "abc123def456" / ".text.txt.tmp").write_text("partial")
    keys = object_keys(root)
    assert [k for _, k in keys] == ["abc123def456/text.txt"]
    assert content_type(keys[0][0]) == "text/plain; charset=utf-8"
    assert content_type(Path("p01.webp")) == "image/webp"
    assert content_type(Path("x.bin")) == "application/octet-stream"
