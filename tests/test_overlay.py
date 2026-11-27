"""The item overlay's shared cases (tests/fixtures/overlay.json); tests-js/overlay.test.ts runs the same file."""
import json
from pathlib import Path

import pytest

from scripts.catalog.overlay import apply_overlay

FIX = json.loads((Path(__file__).parent / "fixtures" / "overlay.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIX["cases"], ids=[c["name"] for c in FIX["cases"]])
def test_shared_case(case):
    item = {**FIX["base"], **case.get("base", {})}
    apply_overlay([item], case["tags"])
    for k, v in case["expect"].items():  # "fecha.year" names a nested field
        got = item
        for part in k.split("."):
            got = got[part]
        assert got == v, k
