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
