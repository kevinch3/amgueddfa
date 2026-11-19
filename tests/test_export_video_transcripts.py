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


WHISPER_SEGS = [[2.0 + 4 * i, 5.0 + 4 * i, "Hyd fedd hi gâr yn gywir ei chalon"] for i in range(8)]


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
    _video(b, "C/2018/b_BBBBBBBBBBB.mp4", whisper={"language": "es", "segments": WHISPER_SEGS})
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
    b_ = json.loads((out / ("B" * 11 + ".json")).read_text())
    assert b_["src"] == "whisper" and b_["lang"] == "es" and b_["seg"][0] == [2.0, "Hyd fedd hi gâr yn gywir ei chalon"]
    assert json.loads((out / ("C" * 11 + ".json")).read_text())["src"] == "subida"
    assert not (out / ("D" * 11 + ".json")).exists()  # Juventud: no transcription published


from scripts.export_video_transcripts import clean_whisper


def test_clean_whisper_drops_filler_windows_stock_phrases_and_loops():
    real = [[t, t + 3.0, "Galwn yn awr ar yr unawdwyr soprano i'r llwyfan"] for t in range(100, 160, 6)]
    segs = [
        [0.0, 2.0, "Cymru"],                                          # lone opener over music
        [30.0, 59.98, "Ychydig"],                                     # one word for a whole 30 s window
        [60.0, 89.98, "Mae'n ymwneud ymwneud ymwneud ymwneud."],     # loop
        [90.0, 92.0, "¡Gracias por ver el video!"],                   # stock phrase
        [200.0, 229.98, "Hyd fedd hi gâr yn gywir ei chalon sydd yn eiddo i mi a minnau iddi hi tra bo dŵr y môr yn hallt"],  # dense window: sung verse, kept
    ] + real
    out = clean_whisper(segs)
    assert [s[0] for s in out] == [200.0] + [float(t) for t in range(100, 160, 6)]
    assert all("ymwneud ymwneud ymwneud" not in s[1] for s in out)


def test_clean_whisper_rejects_files_with_too_little_left():
    assert clean_whisper([[0.0, 2.0, "Cymru"], [30.0, 59.98, "Ychydig"], [60.0, 63.0, "Diolch yn fawr i chi gyd am ddod heno"]]) == []


def test_welsh_whisper_is_held_until_checked(tmp_path):
    # User 2026-11-19: Whisper's Welsh (mostly singing) is often phonetic nonsense; publish Spanish only.
    b = tmp_path / "backup"
    _video(b, "C/2018/e_EEEEEEEEEEE.mp4", whisper={"language": "cy", "segments": WHISPER_SEGS})
    _video(b, "C/2018/f_FFFFFFFFFFF.mp4", whisper={"language": "es", "segments": [[2.0 + 4 * i, 5.0 + 4 * i, "comienza la competencia número doce, solo de soprano"] for i in range(8)]})
    (b / "INDEX.tsv").write_text("id\tfile\nEEEEEEEEEEE\tC/2018/e_EEEEEEEEEEE.mp4\nFFFFFFFFFFF\tC/2018/f_FFFFFFFFFFF.mp4\n", encoding="utf-8")
    r = export(b, [{"id": "E" * 11, "festival": "chubut"}, {"id": "F" * 11, "festival": "chubut"}], tmp_path / "out")
    assert r["whisper"] == 1 and (tmp_path / "out" / ("F" * 11 + ".json")).exists()
