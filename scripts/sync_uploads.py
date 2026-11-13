"""Copy approved uploads' originals from the private `uploads` bucket into the archive.

Run locally, never in CI:  python3 -m scripts.sync_uploads [--dry-run]
Reads PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from .env.

Each approved upload lands in ../<Festival>/<Year>/<Category>/Aporte_<id8>.<ext>
with a SOURCES.tsv row whose source is "Aporte de <nombre>, <fecha>". Idempotent:
an upload whose bytes (sha256[:12], the catalog id) are already anywhere in the
archive, or whose Aporte_<id8> file exists, is skipped. Re-run build_catalog after.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Callable

from scripts.catalog.scan import CATEGORIES, FESTIVALS, _walk
from scripts.push_restricted import read_env

REPO = Path(__file__).resolve().parent.parent
FESTIVAL_DIR = {slug: folder for folder, slug in FESTIVALS.items()}
CATEGORY_DIR = {slug: folder for folder, slug in CATEGORIES.items()} | {"otros": "Varios"}
MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf"}
PATH_RE = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$")
SOURCE_PREFIX = "Aporte de "


def _clean(s: object) -> str:
    """One line, no tabs: safe inside a TSV cell."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


def target(row: dict) -> Path | None:
    """Archive-relative path for an approved upload row, or None if it cannot be placed."""
    path = str((row.get("payload") or {}).get("storage_path") or "")
    m = PATH_RE.match(path)
    fest = FESTIVAL_DIR.get(row.get("festival") or "")
    if not m or not fest:
        return None
    year = row.get("year")
    ydir = str(int(year)) if isinstance(year, int) else "_general"
    cat = CATEGORY_DIR.get((row.get("payload") or {}).get("category") or "otros", "Varios")
    return Path(fest) / ydir / cat / f"Aporte_{str(row['id'])[:8]}.{m.group(1)}"


def source_row(rel: Path, row: dict, today: str) -> dict[str, str]:
    name = _clean(row.get("display_name")) or "una persona de la comunidad"
    when = str(row.get("reviewed_at") or row.get("created_at") or today)[:10]
    ext = rel.suffix.lstrip(".").lower()
    return {
        "path": rel.as_posix(),
        "source_url": f"{SOURCE_PREFIX}{name}, {when}",
        "retrieved": today,
        "mime": MIME.get(ext, "application/octet-stream"),
        "notes": _clean((row.get("payload") or {}).get("description")),
    }


def known_ids(archive: Path) -> set[str]:
    return {hashlib.sha256(p.read_bytes()).hexdigest()[:12] for p, _ in _walk(archive)}


def sync(
    archive: Path,
    rows: list[dict],
    download: Callable[[str], bytes],
    today: str,
    dry_run: bool = False,
) -> tuple[list[str], int]:
    """Write new originals and append their SOURCES.tsv rows. Returns (added paths, skipped)."""
    have = known_ids(archive)
    added: list[str] = []
    new_rows: list[dict[str, str]] = []
    skipped = 0
    for row in sorted(rows, key=lambda r: str(r.get("id"))):
        rel = target(row)
        if rel is None:
            print(f"skip {row.get('id')}: no festival or bad storage path", file=sys.stderr)
            skipped += 1
            continue
        dest = archive / rel
        if any(dest.parent.glob(f"{dest.stem}.*")):
            skipped += 1
            continue
        data = download(row["payload"]["storage_path"])
        sid = hashlib.sha256(data).hexdigest()[:12]
        if sid in have:
            skipped += 1
            continue
        have.add(sid)
        added.append(rel.as_posix())
        new_rows.append(source_row(rel, row, today))
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    if new_rows and not dry_run:
        tsv = archive / "SOURCES.tsv"
        with open(tsv, encoding="utf-8", newline="") as f:
            fields = next(csv.reader(f, delimiter="\t"))
        needs_nl = tsv.read_bytes()[-1:] not in (b"\n", b"")
        with open(tsv, "a", encoding="utf-8", newline="") as f:
            if needs_nl:
                f.write("\n")
            w = csv.DictWriter(f, fieldnames=fields, delimiter="\t", lineterminator="\n", extrasaction="ignore")
            for r in new_rows:
                w.writerow({k: r.get(k, "") for k in fields})
    return added, skipped


def _get(url: str, key: str) -> bytes:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "apikey": key})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch_rows(base: str, key: str) -> list[dict]:
    q = urllib.parse.urlencode({
        "select": "id,festival,year,payload,created_at,reviewed_at,author:profiles!contributions_user_id_fkey(display_name)",
        "status": "eq.approved",
        "type": "eq.upload",
        "order": "id.asc",
    })
    rows = json.loads(_get(f"{base}/rest/v1/contributions?{q}", key))
    for r in rows:
        r["display_name"] = (r.pop("author", None) or {}).get("display_name")
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=str(REPO.parent))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    env = read_env(REPO / ".env")
    base = (env.get("PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env", file=sys.stderr)
        return 2
    try:
        rows = fetch_rows(base, key)
        added, skipped = sync(
            Path(a.archive),
            rows,
            lambda p: _get(f"{base}/storage/v1/object/authenticated/uploads/{urllib.parse.quote(p)}", key),
            date.today().isoformat(),
            a.dry_run,
        )
    except urllib.error.HTTPError as e:
        print(f"supabase error {e.code}: {e.read()[:300]!r}", file=sys.stderr)
        return 1
    for p in added:
        print(("would add " if a.dry_run else "added ") + p)
    print(f"uploads: {'would add' if a.dry_run else 'added'} {len(added)}, skipped {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
