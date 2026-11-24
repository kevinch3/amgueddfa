import json

from scripts.reconstruct import casos
from scripts.reconstruct.sources import Line

LINES = [
    Line(10.0, "Buenas tardes a todos", "whisper_es", "es"),
    Line(20.0, "Diolch yn fawr i bawb", "cy", "cy", 0.9),
    Line(21.0, "Diolch yn fawr de nuevo", "yt_es", "es"),
    Line(40.0, "Hola hola", "yt_es", "es"),
    Line(41.0, "Hola otra vez", "whisper_es", "es"),
]


def run(cases):
    return dict(casos.check(cases, casos.lines_from_sources(LINES)))


def test_casos_kinds():
    r = run([
        {"kind": "present", "name": "p1", "t": 11, "tol": 2, "words": ["BUENAS", "tardes"]},
        {"kind": "present", "name": "p2", "t": 11, "tol": 2, "words": ["buenas", "noches"]},
        {"kind": "present", "name": "p3", "t": 20, "tol": 2, "words": ["diolch"], "lang": "cy"},
        {"kind": "present", "name": "p4", "t": 21, "tol": 0.5, "words": ["diolch"], "lang": "cy"},
        {"kind": "present", "name": "p5", "t": 30, "tol": 1, "words": ["diolch"]},
        {"kind": "once", "name": "o1", "from": 0, "to": 15, "words": ["buenas"]},
        {"kind": "once", "name": "o2", "from": 15, "to": 30, "words": ["diolch"]},
        {"kind": "once", "name": "o3", "from": 35, "to": 50, "words": ["hola"]},
        {"kind": "once", "name": "o4", "from": 35, "to": 50, "words": ["nada"]},
        {"kind": "absent_lang", "name": "a1", "from": 0, "to": 30, "src": "whisper_es", "pattern": "diolch"},
        {"kind": "absent_lang", "name": "a2", "from": 0, "to": 30, "src": "cy", "pattern": "diolch|fawr"},
        {"kind": "absent_lang", "name": "a3", "from": 0, "to": 30, "src": "cy", "pattern": "buenas"},
    ])
    assert r == {"p1": True, "p2": False, "p3": True, "p4": False, "p5": False,
                 "o1": True, "o2": False, "o3": False, "o4": False,
                 "a1": True, "a2": False, "a3": True}


def test_reconstruccion_lines_use_fuentes_and_mezcla():
    doc = {"seg": [[1, "buenas tardes"], [5, "diolch yn fawr"]], "fuentes": [["whisper_es"], ["cy"]], "mezcla": True}
    ls = casos.lines_from_reconstruccion(doc)
    r = dict(casos.check([
        {"kind": "present", "name": "w", "t": 5, "tol": 1, "words": ["diolch"], "lang": "cy"},
        {"kind": "absent_lang", "name": "x", "from": 0, "to": 9, "src": "cy", "pattern": "buenas"},
        {"kind": "absent_lang", "name": "y", "from": 0, "to": 9, "src": "whisper_es", "pattern": "buenas"},
    ], ls))
    assert r == {"w": True, "x": True, "y": False}


def test_cli_exit_code(tmp_path, capsys, monkeypatch):
    f = tmp_path / "c.json"
    f.write_text(json.dumps([{"kind": "present", "name": "n", "t": 10, "tol": 1, "words": ["zzz"]}]))
    monkeypatch.setattr(casos, "load_lines", lambda vid, recon: casos.lines_from_sources(LINES))
    assert casos.main(["vid", str(f)]) == 1
    out = capsys.readouterr().out
    assert "FAIL n" in out and "0/1 pass" in out


def test_pattern_and_src_on_present():
    r = run([
        {"kind": "present", "name": "a", "t": 20, "tol": 1, "pattern": "fawr|nada", "src": "cy"},
        {"kind": "present", "name": "b", "t": 20, "tol": 1, "pattern": "fawr|nada", "src": "whisper_es"},
        {"kind": "present", "name": "c", "t": 20, "tol": 2, "pattern": "nada|noche"},
        {"kind": "once", "name": "d", "from": 0, "to": 15, "pattern": "tard|noch"},
    ])
    assert r == {"a": True, "b": False, "c": False, "d": True}


def test_no_duplicate_with_ends():
    lines = [Line(10.0, "uno", "cy", "cy", 0.9, 13.0), Line(11.0, "dos", "whisper_es", "es", None, 12.0),
             Line(30.0, "tres", "cy", "cy", 0.9, 31.0), Line(30.6, "cuatro", "yt_es", "es", None, 31.6),
             Line(50.0, "cinco", "cy", "cy", 0.9, 51.0), Line(50.1, "seis", "cy", "cy", 0.9, 51.1)]
    rows = casos.lines_from_sources(lines)
    r = dict(casos.check([
        {"kind": "no_duplicate", "name": "over", "from": 0, "to": 20},
        {"kind": "no_duplicate", "name": "short", "from": 25, "to": 40},
        {"kind": "no_duplicate", "name": "same", "from": 45, "to": 60},
        {"kind": "no_duplicate", "name": "outside", "from": 11.5, "to": 20},
    ], rows))
    assert r == {"over": False, "short": True, "same": True, "outside": True}


def _recon_dup(fu1, fu2, x1="buenas tardes a todos", x2="buenas tardes a todos"):
    doc = {"seg": [[1, x1], [2, x2]], "fuentes": [fu1, fu2]}
    rows = casos.lines_from_reconstruccion(doc)
    return dict(casos.check([{"kind": "no_duplicate", "name": "n", "from": 0, "to": 20}], rows))["n"]


def test_no_duplicate_reconstruccion_compares_words():
    assert _recon_dup(["cy"], ["whisper_es"]) is False
    assert _recon_dup(["cy"], ["whisper_es"], x2="Buenas tardes, a todos!") is False
    assert _recon_dup(["cy"], ["whisper_es"], x2="diolch yn fawr i bawb") is True
    assert _recon_dup(["cy"], ["cy"]) is True
    assert _recon_dup(["cy"], ["whisper_es"], "buenas tardes", "buenas tardes") is True  # under 3 words
    assert _recon_dup(["cy"], ["whisper_es"], "buenas tardes a todos ustedes y diolch", "buenas tardes a todos") is False


def test_no_duplicate_without_fuentes_fails_loudly():
    import pytest
    rows = casos.lines_from_reconstruccion({"seg": [[1, "buenas tardes a todos"], [2, "buenas tardes a todos"]]})
    with pytest.raises(ValueError, match="fuentes"):
        casos.check([{"kind": "no_duplicate", "name": "n", "from": 0, "to": 20}], rows)
