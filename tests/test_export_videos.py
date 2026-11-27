import json

from scripts.export_videos import export

HEADER = "video_id\turl\tfestival\tyear\tyear_source\tkind\ttitle\tchannel\tchannel_id\tupload_date\tduration\tdoc_links\tthumb_path\tretrieved\n"


def row(vid, festival, year, kind="actuacion", title="t", source="titulo"):
    return f"{vid}\thttps://www.youtube.com/watch?v={vid}\t{festival}\t{year}\t{source}\t{kind}\t{title}\tCanal\t@c\t20150101\t60\t\tVideos/x.jpg\t2026-11-14\n"


def test_exports_core_festivals_with_year(tmp_path):
    tsv = tmp_path / "VIDEOS.tsv"
    tsv.write_text(HEADER
                   + row("AAAAAAAAAAA", "Eisteddfod_del_Chubut", 2015, "ceremonia", "Silla")
                   + row("BBBBBBBBBBB", "Eisteddfod_de_la_Juventud", 2013)
                   + row("CCCCCCCCCCC", "Eisteddfod_de_Dolavon", 2015)       # not on the site yet
                   + row("DDDDDDDDDDD", "Eisteddfod_Mimosa", "")             # no year: no edition page
                   + row("EEEEEEEEEEE", "Eisteddfod_de_Trevelin", 2014, source="subida"),
                   encoding="utf-8")
    out = tmp_path / "videos.json"
    n = export(tsv, out)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert n == 3
    assert [v["id"] for v in data["videos"]] == ["AAAAAAAAAAA", "BBBBBBBBBBB", "EEEEEEEEEEE"]
    first = data["videos"][0]
    assert first == {"id": "AAAAAAAAAAA", "coleccion": "chubut",
                     "fecha": {"year": 2015, "inferred": False, "undated": False}, "kind": "ceremonia",
                     "title": "Silla", "channel": "Canal", "date": "2015-01-01", "tipo": "video", "formato": "video"}
    assert data["videos"][2]["fecha"]["inferred"] is True
    # Nothing from the local archive leaks: no paths, no retrieval bookkeeping.
    assert "Videos/" not in out.read_text(encoding="utf-8")


def test_trevelin_children_held_back_until_29(tmp_path):
    tsv = tmp_path / "VIDEOS.tsv"
    tsv.write_text(HEADER
                   + row("AAAAAAAAAAA", "Eisteddfod_de_Trevelin", 2020, title="Eisteddfod Infantil Trevelin 2020 - x")
                   + row("BBBBBBBBBBB", "Eisteddfod_de_Trevelin", 2012, title="EISTEDDFOD JUVENIL TREVELIN 2012")
                   + row("CCCCCCCCCCC", "Eisteddfod_de_Trevelin", 2019, title="Eisteddfod de los niños Trevelin")
                   + row("DDDDDDDDDDD", "Eisteddfod_de_Trevelin", 2014, title="Eisteddfod de Trevelin 2014 - Coro")
                   # a competition category of the main festival, public before: stays
                   + row("EEEEEEEEEEE", "Eisteddfod_de_Trevelin", 2014, title="Eisteddfod Trevelin 2014 - Canción infantil"),
                   encoding="utf-8")
    out = tmp_path / "videos.json"
    assert export(tsv, out) == 2
    assert [v["id"] for v in json.loads(out.read_text(encoding="utf-8"))["videos"]] == ["DDDDDDDDDDD", "EEEEEEEEEEE"]


def test_any_trevelin_children_title_the_harvest_files_is_held_back(tmp_path):
    tsv = tmp_path / "VIDEOS.tsv"
    tsv.write_text(HEADER
                   + row("AAAAAAAAAAA", "Eisteddfod_de_Trevelin", 2018, title="Eisteddfod para niños Trevelin 2018")
                   + row("BBBBBBBBBBB", "Eisteddfod_de_Trevelin", 2018, title="Trevelin infantil 2018 - recitado"),
                   encoding="utf-8")
    assert export(tsv, tmp_path / "videos.json") == 0
