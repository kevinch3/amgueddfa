"""One-off (2026-11-27): rewrite the site's data files in the new record vocabulary.

docs/superpowers/specs/2026-11-27-reglas-de-datos-design.md, steps 4-5: records carry
coleccion, fecha {year, inferred, undated}, tipo and formato; contributions and editions
carry coleccion; payload keys category -> tipo and a tag's festival -> coleccion (the
database migration 20261127000001_colecciones.sql does the same to stored rows).
Idempotent: files already in the new shape are left as they are.

  python3 -m scripts.migrar.registros_2026_11
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def record(it: dict, tipo: str | None = None, formato: str | None = None) -> dict:
    if "coleccion" in it and "fecha" in it:
        return it
    out = {}
    for k, v in it.items():
        if k == "festival":
            out["coleccion"] = v
        elif k == "year":
            out["fecha"] = {"year": v, "inferred": bool(it.get("year_inferred")), "undated": bool(it.get("undated", v is None))}
        elif k in ("year_inferred", "undated"):
            continue
        elif k == "category":
            out["tipo"] = v
        elif k == "kind" and formato is None:
            out["formato"] = v
        else:
            out[k] = v
    if tipo:
        out.setdefault("tipo", tipo)
    if formato:
        out.setdefault("formato", formato)
    return out


def payload(p):
    if not isinstance(p, dict):
        return p
    p = dict(p)
    if "category" in p:
        p["tipo"] = p.pop("category")
    if "festival" in p:
        p["coleccion"] = p.pop("festival")
    if isinstance(p.get("arreglo"), dict):
        p["arreglo"] = payload(p["arreglo"])
    return p


def row(r: dict) -> dict:
    out = {("coleccion" if k == "festival" else k): v for k, v in r.items()}
    if "payload" in out:
        out["payload"] = payload(out["payload"])
    return out


def rewrite(path: Path, fn, indent):
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    new = fn(data)
    path.write_text(json.dumps(new, ensure_ascii=False, indent=indent) + ("\n" if raw.endswith("\n") else ""), encoding="utf-8")


def main():
    rewrite(REPO / "src/data/catalog.json", lambda d: {**d, "items": [record(i) for i in d["items"]]}, 1)
    rewrite(REPO / "src/data/videos.json", lambda d: {**d, "videos": [record(v, "video", "video") for v in d["videos"]]}, 0)
    rewrite(REPO / "data/approved/contributions.json", lambda d: [row(r) for r in d], 2)
    rewrite(REPO / "data/approved/editions.json", lambda d: [row(r) for r in d], 2)
    fx = REPO / "tests/fixtures/overlay.json"
    keys = {"year": "fecha.year", "year_inferred": "fecha.inferred", "undated": "fecha.undated", "category": "tipo", "festival": "coleccion"}

    def fixture(d):
        d["base"] = record(d["base"])
        for c in d["cases"]:
            c["tags"] = [row(t) for t in c.get("tags", [])]
            if "expect" in c:
                c["expect"] = {keys.get(k, k): v for k, v in c["expect"].items()}
            for k in ("items", "base"):
                if isinstance(c.get(k), dict):
                    c[k] = record(c[k])
        return d
    if "festival" in fx.read_text():
        rewrite(fx, fixture, 2)


if __name__ == "__main__":
    main()
