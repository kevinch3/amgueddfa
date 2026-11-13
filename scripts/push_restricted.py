"""Upload restricted derivatives (.restricted/<id>/*) to the private `restricted` bucket.

Run locally, never in CI:  python3 -m scripts.push_restricted
Reads PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from .env.
Uses the Storage REST API; files already in the bucket are skipped, the rest are
sent with x-upsert so a re-run after a partial failure is safe.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BUCKET = "restricted"
ID_RE = re.compile(r"^[0-9a-f]{12}$")
CONTENT_TYPES = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}


def read_env(path: Path) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, optional `export` and quotes."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        if k:
            out[k] = v
    return out


def object_keys(root: Path) -> list[tuple[Path, str]]:
    """(local file, object key "<id>/<name>") for every derivative under root/<id>/.

    Only item folders (12 hex chars) count; hidden or partial files are skipped.
    """
    if not root.is_dir():
        return []
    out = []
    for d in sorted(root.iterdir()):
        if not d.is_dir() or not ID_RE.match(d.name):
            continue
        for f in sorted(d.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                out.append((f, f"{d.name}/{f.name}"))
    return out


def _request(url: str, key: str, method: str = "GET", body: bytes | None = None, headers: dict | None = None):
    h = {"Authorization": f"Bearer {key}", "apikey": key, **(headers or {})}
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def existing(base: str, key: str, prefix: str) -> set[str]:
    body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode()
    raw = _request(f"{base}/storage/v1/object/list/{BUCKET}", key, "POST", body, {"Content-Type": "application/json"})
    return {f"{prefix}/{o['name']}" for o in json.loads(raw) if o.get("id")}


def push(root: Path, base: str, key: str) -> tuple[int, int]:
    keys = object_keys(root)
    have: set[str] = set()
    for prefix in sorted({k.split("/", 1)[0] for _, k in keys}):
        have |= existing(base, key, prefix)
    sent = skipped = 0
    for f, k in keys:
        if k in have:
            skipped += 1
            continue
        _request(
            f"{base}/storage/v1/object/{BUCKET}/{urllib.parse.quote(k)}",
            key,
            "POST",
            f.read_bytes(),
            {"Content-Type": CONTENT_TYPES.get(f.suffix, "application/octet-stream"), "x-upsert": "true"},
        )
        sent += 1
    return sent, skipped


def main() -> int:
    env = read_env(REPO / ".env")
    base = (env.get("PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env", file=sys.stderr)
        return 2
    try:
        sent, skipped = push(REPO / ".restricted", base, key)
    except urllib.error.HTTPError as e:
        print(f"storage error {e.code}: {e.read()[:300]!r}", file=sys.stderr)
        return 1
    print(f"restricted: uploaded {sent}, already there {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
