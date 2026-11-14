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
    assert first == {"id": "AAAAAAAAAAA", "festival": "chubut", "year": 2015, "kind": "ceremonia",
                     "title": "Silla", "channel": "Canal", "date": "2015-01-01", "year_inferred": False}
    assert data["videos"][2]["year_inferred"] is True
    # Nothing from the local archive leaks: no paths, no retrieval bookkeeping.
    assert "Videos/" not in out.read_text(encoding="utf-8")
