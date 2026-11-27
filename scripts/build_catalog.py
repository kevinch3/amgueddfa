#!/usr/bin/env python3
"""Scan the archive, write derivatives and src/data/catalog.json, upload public derivatives.

Public derivatives go to media/ (git-ignored) and are mirrored to the R2 bucket
served at media.amgueddfa.org (src/lib/paths.ts MEDIA_BASE) with
rclone; restricted ones stay in .restricted/ and never leave this machine.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from scripts.catalog.derive import derive  # noqa: E402
from scripts.catalog.overlay import apply_overlay  # noqa: E402
from scripts.catalog.scan import caption_titles, number_repeats, scan  # noqa: E402
from scripts.catalog.visibilidad import apply_visibility, load_overrides, published  # noqa: E402

# rclone remote:path of the public derivatives ("r2" is set up in ~/.config/rclone/rclone.conf).
MEDIA_REMOTE = os.environ.get("MEDIA_REMOTE", "r2:amgueddfa-media/media")
# File names are not content-hashed (a re-render keeps p01.webp), so no long-lived cache.
RCLONE_FLAGS = ["--checksum", "--transfers", "16", "--checkers", "16",
                "--header-upload", "Cache-Control: public, max-age=86400"]


def load_extra(repo: Path) -> set[str]:
    p = repo / "data" / "restricted_extra.txt"
    if not p.exists():
        return set()
    return {ln.strip() for ln in p.read_text().splitlines()
            if ln.strip() and not ln.lstrip().startswith("#")}


def apply_tags(items, repo: Path) -> None:
    """The overlay from the last export (data/approved/contributions.json); see scripts/catalog/overlay.py."""
    p = repo / "data" / "approved" / "contributions.json"
    if p.exists():
        apply_overlay(items, json.loads(p.read_text() or "[]"))


def upload_media(public: Path, items, only: str | None, remote: str = MEDIA_REMOTE) -> int:
    """Mirror public derivatives to the bucket; only changed files are sent (--checksum).

    A full run syncs the whole tree, so items that became restricted or left the
    catalog are deleted from the bucket too. --only touches just that item.
    """
    if shutil.which("rclone") is None:
        print("ERROR: rclone not found; install it or pass --no-upload", file=sys.stderr)
        return 1
    if only:
        it = next(i for i in items if i.id == only)
        if it.restricted:  # it may have been public before: take it down
            cmd = ["rclone", "purge", f"{remote}/{it.id}"]
            res = subprocess.run(cmd, capture_output=True, text=True)
            return 0 if res.returncode == 0 or "not found" in res.stderr.lower() else res.returncode
        cmd = ["rclone", "sync", str(public / it.id), f"{remote}/{it.id}", *RCLONE_FLAGS]
    else:
        cmd = ["rclone", "sync", str(public), remote, *RCLONE_FLAGS]
    print("upload:", " ".join(cmd[:4]), flush=True)
    return subprocess.run(cmd).returncode


def dir_size(root: Path) -> int:
    return sum(f.stat().st_size for f in root.rglob("*") if f.is_file()) if root.exists() else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=str(REPO.parent))
    ap.add_argument("--only", help="derive only this item id; do not write catalog.json")
    ap.add_argument("--no-upload", action="store_true", help="do not mirror media/ to the bucket")
    ap.add_argument("--repo", default=str(REPO), help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    repo, archive = Path(a.repo), Path(a.archive).resolve()
    public, restricted = repo / "media", repo / ".restricted"

    items = scan(archive, load_extra(repo))
    caption_titles(items)  # before the overlay: an approved title correction still wins
    apply_tags(items, repo)
    number_repeats(items)  # after the overlay, which can hide an item
    apply_visibility(items, load_overrides(repo), date.today())  # before derive: it picks media/ or .restricted/
    todo = [i for i in items if a.only in (None, i.id)]
    if a.only and not todo:
        print(f"no item with id {a.only}", file=sys.stderr)
        return 1
    failures: list[tuple[str, str, str]] = []
    for n, it in enumerate(todo, 1):
        root, other = (restricted, public) if it.restricted else (public, restricted)
        shutil.rmtree(other / it.id, ignore_errors=True)  # never leave a stale copy
        try:
            derive(it, archive, root)
        except Exception as e:  # noqa: BLE001 - collect, report, fail at the end
            failures.append((it.id, it.src_path, f"{type(e).__name__}: {e}"))
        if n % 50 == 0:
            print(f"  {n}/{len(todo)}", flush=True)

    if failures:
        print(f"ERROR: {len(failures)} item(s) failed:", file=sys.stderr)
        for iid, path, msg in failures:
            print(f"  {iid} {path}: {msg}", file=sys.stderr)
        return 1

    if not a.only:
        ids = {i.id for i in items}
        for root in (public, restricted):
            if root.exists():
                for d in root.iterdir():
                    if d.is_dir() and d.name not in ids:
                        shutil.rmtree(d)
        out = repo / "src" / "data" / "catalog.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        rows = []
        for it in published(items):  # a private record is not even named in the public repo
            d = asdict(it)
            d.pop("notes", None)
            rows.append(d)
        out.write_text(json.dumps(
            {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "items": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"items {len(items)} (solo_ficha {sum(i.visibilidad == 'solo_ficha' for i in items)}, privado {sum(i.visibilidad == 'privado' for i in items)})")

    print(f"media {dir_size(public) / 1024 / 1024:.1f} MB; .restricted {dir_size(restricted) / 1024 / 1024:.1f} MB")
    if a.no_upload:
        return 0
    rc = upload_media(public, items, a.only)
    if rc:
        print("ERROR: upload to the media bucket failed; re-run to retry (only changed files are sent)", file=sys.stderr)
    return rc


if __name__ == "__main__":
    sys.exit(main())
