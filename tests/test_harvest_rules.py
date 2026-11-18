"""Festival folders the harvest picks: the Otros festivales rules (2026-11-18)."""
import importlib.util
from pathlib import Path

_p = Path(__file__).resolve().parent.parent / ".claude/skills/youtube-eisteddfod-harvest/harvest.py"
_spec = importlib.util.spec_from_file_location("harvest", _p)
harvest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(harvest)


def fest(title, uploader="@kevinhughes26"):
    r = harvest.classify({"id": "AAAAAAAAAAA", "title": title, "description": "", "uploader_id": uploader})
    return r and r["festival"]


def test_trevelin_children_go_to_trevelin():
    assert fest("Eisteddfod Infantil Trevelin 2020. Premiados competencia 22.", "@EisteddfodTrevelin") == "Eisteddfod_de_Trevelin"
    assert fest("Eisteddfod Juvenil Trevelin 2012 \"Coro San David\"") == "Eisteddfod_de_Trevelin"


def test_camwy_is_micro():
    assert fest("Eisteddfod Camwy 2014 - Gwanwyn") == "Micro_Eisteddfod_de_Camwy"
    assert fest("Micro Eisteddfod de Camwy Dylan") == "Micro_Eisteddfod_de_Camwy"


def test_william_morris_is_dolavon():
    assert fest("Coro San David de Trelew en Mini Eisteddfod William Morris (29/6/2013) en la localidad de Dolavon",
                "@emiliopinciroli162") == "Eisteddfod_de_Dolavon"


def test_eisteddfod_de_gales_dropped():
    assert fest("Alun Ial Jones (Teithiau): Eisteddfod Gales de Carreg Las // Radio Nacional Esquel #patagonia") is None


def test_chubut_with_gales_choir_kept():
    assert fest("Eisteddfod del Chubut 2019 - Coro de Gales") == "Eisteddfod_del_Chubut"


def test_galesa_is_not_gales():
    assert fest("Eisteddfod galesa en Trelew 2019") == "Eisteddfod_del_Chubut"
