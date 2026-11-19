import json

from scripts.export_video_transcripts import export, parse_vtt

YT_AUTO = """WEBVTT
Kind: captions
Language: es

00:00:01.360 --> 00:00:03.590 align:start position:0%

buenas<00:00:01.760><c> noches</c><00:00:02.000><c> a</c><00:00:02.200><c> todos</c>

00:00:03.590 --> 00:00:03.600 align:start position:0%
buenas noches a todos


00:00:03.600 --> 00:00:06.000 align:start position:0%
buenas noches a todos
comienza<00:00:04.000><c> la</c><00:00:04.200><c> competencia</c>
"""


def test_parse_vtt_drops_tags_and_repeated_lines():
    assert parse_vtt(YT_AUTO) == [[1.4, "buenas noches a todos"], [3.6, "comienza la competencia"]]


def _video(backup, rel, vtts=None, info=None, whisper=None):
    mp4 = backup / "videos" / rel
    mp4.parent.mkdir(parents=True, exist_ok=True)
    mp4.write_bytes(b"")
    stem = mp4.with_suffix("")
    for lang, text in (vtts or {}).items():
        (stem.parent / f"{stem.name}.{lang}.vtt").write_text(text, encoding="utf-8")
    (stem.parent / f"{stem.name}.info.json").write_text(json.dumps(info or {}), encoding="utf-8")
    if whisper is not None:
        (stem.parent / f"{stem.name}.whisper.json").write_text(json.dumps(whisper), encoding="utf-8")


def test_export_picks_source_and_skips_children_festivals(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2018/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO, "es": YT_AUTO})
    _video(b, "C/2018/b_BBBBBBBBBBB.mp4", whisper={"language": "cy", "segments": [[2.0, 4.0, "Hyd fedd hi gâr"]]})
    _video(b, "C/2018/c_CCCCCCCCCCC.mp4", {"en-GB": "WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nHello\n"},
           info={"subtitles": {"en-GB": [], "live_chat": []}})
    _video(b, "J/2018/d_DDDDDDDDDDD.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + "".join(
        f"{c * 11}\t{p}\n" for c, p in [("A", "C/2018/a_AAAAAAAAAAA.mp4"), ("B", "C/2018/b_BBBBBBBBBBB.mp4"),
                                        ("C", "C/2018/c_CCCCCCCCCCC.mp4"), ("D", "J/2018/d_DDDDDDDDDDD.mp4")]), encoding="utf-8")
    videos = [{"id": "A" * 11, "festival": "chubut"}, {"id": "B" * 11, "festival": "trevelin"},
              {"id": "C" * 11, "festival": "chubut"}, {"id": "D" * 11, "festival": "juventud"}]
    out = tmp_path / "out"
    (out).mkdir()
    (out / "ZZZZZZZZZZZ.json").write_text("{}")  # a video that left the list
    r = export(b, videos, out)
    assert r == {"written": 3, "removed": 1, "subida": 1, "youtube": 1, "whisper": 1}
    a = json.loads((out / ("A" * 11 + ".json")).read_text())
    assert a["src"] == "youtube" and a["lang"] == "es" and a["seg"][0] == [1.4, "buenas noches a todos"]
    assert json.loads((out / ("B" * 11 + ".json")).read_text()) == {"src": "whisper", "lang": "cy", "seg": [[2.0, "Hyd fedd hi gâr"]]}
    assert json.loads((out / ("C" * 11 + ".json")).read_text())["src"] == "subida"
    assert not (out / ("D" * 11 + ".json")).exists()  # Juventud: no transcription published
