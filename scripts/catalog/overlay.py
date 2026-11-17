"""The item overlay, Python port of src/lib/tags.ts applyTags.

Approved tags (and document reports) correct an item's place, title, credit,
caption and flags; the latest approval wins. It runs before media are derived
so a tag that makes an item "resultados" keeps its pages off the public bucket.
tests/fixtures/overlay.json holds the cases both implementations must pass.
"""
from __future__ import annotations

# payload key -> item field
OVERLAY_FIELDS = {"year": "year", "category": "category", "festival": "festival",
                  "title": "title", "rights": "rights", "caption": "note_public",
                  "no_text": "no_text", "hidden": "hidden"}
CLEARABLE = {"rights", "caption"}
FLAGS = {"no_text", "hidden"}


def _when(t: dict) -> str:
    return t.get("reviewed_at") or t.get("created_at") or ""


def _given(v) -> bool:
    return v is not None and v != ""


def _places(t: dict) -> bool:
    if t.get("type") == "tag":
        return True
    return t.get("type") == "report" and (t.get("payload") or {}).get("objetivo") == "documento"


def _get(it, f):
    return it.get(f) if isinstance(it, dict) else getattr(it, f, None)


def _set(it, f, v) -> None:
    if isinstance(it, dict):
        it[f] = v
    else:
        setattr(it, f, v)


def _has(it, f) -> bool:
    return f in it if isinstance(it, dict) else hasattr(it, f)


def apply_overlay(items, rows) -> None:
    """Apply approved tags and document reports to items (objects or dicts) in place, oldest first."""
    by_id = {_get(i, "id"): i for i in items}
    mine = sorted((r for r in rows if _places(r) and r.get("item_id") in by_id), key=_when)
    for t in mine:
        it, p = by_id[t["item_id"]], t.get("payload") or {}
        if t.get("type") == "report":
            if p.get("problema") == "no_corresponde":
                _set(it, "hidden", True)
            p = (p.get("arreglo") or {}) if p.get("problema") == "otra_edicion" else {}
        for k, f in OVERLAY_FIELDS.items():
            v = p.get(k)
            if k in FLAGS:
                if isinstance(v, bool):
                    _set(it, f, v)
            elif _given(v) or (k in CLEARABLE and v == ""):
                _set(it, f, int(v) if k == "year" else str(v))
        if _given(p.get("year")):
            _set(it, "undated", False)
            _set(it, "year_inferred", False)
        if _get(it, "category") == "resultados":  # only ever restrict
            _set(it, "restricted", True)
        if _get(it, "restricted") and _has(it, "note_public"):
            _set(it, "note_public", "")
