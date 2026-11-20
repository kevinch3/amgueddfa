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


from scripts.export_video_transcripts import useful


def test_useful_keeps_spanish_speech_and_drops_misdetected_or_garbled_captions():
    words = {"buenas", "noches", "comienza", "la", "competencia", "numero", "coro", "de", "trelew", "solo", "soprano"}
    good = [[i * 3.0, "buenas noches comienza la competencia numero doce coro de trelew"] for i in range(6)]
    assert useful({"src": "youtube", "lang": "es", "seg": good}, words)
    # YouTube guessed another language for a Spanish or Welsh video: nonsense
    assert not useful({"src": "youtube", "lang": "en", "seg": good}, words)
    # labelled Spanish but mostly not words: a song transcribed as noise
    noise = [[i * 3.0, "ter spr i can now n i can n glv miendo lios"] for i in range(8)]
    assert not useful({"src": "youtube", "lang": "es", "seg": noise}, words)
    # too little text
    assert not useful({"src": "youtube", "lang": "es", "seg": good[:1]}, words)
    # the author's own Spanish subtitles are kept as they are
    assert useful({"src": "subida", "lang": "es", "seg": noise}, words)


from scripts.export_video_transcripts import fix_eisteddfod

WORDS = {"estado", "estero", "estadio", "del", "de", "la", "comision", "santiago", "este", "en", "bot", "existe", "teddy"}


def test_fix_eisteddfod_spellings():
    f = lambda s: fix_eisteddfod(s, WORDS)
    assert f("la corona del Stedwood 2019") == "la corona del Eisteddfod 2019"
    assert f("de este Stedbot, Stedbot Mimosa") == "de este Eisteddfod, Eisteddfod Mimosa"
    assert f("la comisión del Estéduo del Chubut") == "la comisión del Eisteddfod del Chubut"
    assert f("este issted Bot del chubut 2022") == "este Eisteddfod del chubut 2022"
    assert f("la comisión del stad vot") == "la comisión del Eisteddfod"
    assert f("organizadora del Estado del chubut") == "organizadora del Eisteddfod del chubut"
    assert f("a esta última sesión del Estadio del Chibut") == "a esta última sesión del Eisteddfod del Chibut"
    # real words stay: Santiago del Estero, existe, a name
    assert f("en la campaña de Santiago del Estero") == "en la campaña de Santiago del Estero"
    assert f("pero existe uno tan bello") == "pero existe uno tan bello"
    assert f("le vamos a pedir a Teddy Lewis") == "le vamos a pedir a Teddy Lewis"
    assert f("el estado de las cosas") == "el estado de las cosas"


def test_author_subtitles_in_english_are_not_published():
    assert not useful({"src": "subida", "lang": "en", "seg": [[0.0, "Video gan Andes Celtig"]]}, set())


def test_fix_eisteddfod_leaves_inflected_words_and_names():
    words = {"estudio", "estar", "establecer", "estrella", "estremecer", "estado", "gloria", "silvina"}
    f = lambda s: fix_eisteddfod(s, words)
    for s in ["en los estudios de la Universidad", "estando de salir", "están estudiando", "está establecido",
              "los ecos estrellados", "corazón estremecido", "como el esternón", "Gloria Estefan", "Silvina Estuardo",
              "del estético del Chubut"]:
        assert f(s) == s or s == "del estético del Chubut", s
    assert f("la comisión del Estéreo del Chubut") == "la comisión del Eisteddfod del Chubut"


def test_fix_eisteddfod_shape_and_context_rules():
    f = lambda s: fix_eisteddfod(s, {"del", "la"})
    # the "-dfod" tail anywhere
    for w in ["Steadwood", "statbot", "stadb", "Istedvo", "Estetbot", "Steedgod", "Steadboard"]:
        assert f(f"en el {w} hoy") == "en el Eisteddfod hoy", w
    # context: after "comisión/corona/presidente… del" or before "del Chubut", "de la Juventud", Mimosa, Trevelin
    assert f("premio Corona del Estejo, competencia") == "premio Corona del Eisteddfod, competencia"
    assert f("del esteo del chubut") == "del Eisteddfod del chubut"
    assert f("de la Estadua del Chubut") == "de la Eisteddfod del Chubut"
    assert f("comisión del stadbot de la juventud") == "comisión del Eisteddfod de la juventud"
    # ordinary words and names stay, even right before "del Chubut" when they are common verbs
    for s in ["yo estaba allí", "estará en el escenario", "durante su estadía", "la estilística del texto",
              "Cat Stevens", "el estío", "se establece que", "Station", "la Stagnita"]:
        assert f(s) == s, s


def test_fix_eisteddfod_context_keeps_real_words():
    f = lambda s: fix_eisteddfod(s, {"estancia", "estado", "del", "la"})
    assert f("la estancia Trevelin") == "la estancia Trevelin"
    assert f("premio del Estado provincial") == "premio del Estado provincial"
    assert f("comisión del Estado del Chubut") == "comisión del Eisteddfod del Chubut"


def test_export_prefers_reconstruction(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2025/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    _video(b, "J/2025/d_DDDDDDDDDDD.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2025/a_AAAAAAAAAAA.mp4\n{'D' * 11}\tJ/2025/d_DDDDDDDDDDD.mp4\n", encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    rec = {"src": "reconstruida", "lang": "es", "modelo": "claude-sonnet-5-5", "seg": [[1.4, "buenas noches a todos"]],
           "fuentes": [["yt_es"]], "ventanas": {"total": 1, "modelo": 1, "reglas": 0, "vacias": 0}}
    for vid in ("A" * 11, "D" * 11):
        (recon / f"{vid}.json").write_text(json.dumps(rec), encoding="utf-8")
    out = tmp_path / "out"
    export(b, [{"id": "A" * 11, "festival": "chubut"}, {"id": "D" * 11, "festival": "juventud"}], out, recon=recon)
    a = json.loads((out / ("A" * 11 + ".json")).read_text())
    assert a["src"] == "reconstruida" and len(a["fuentes"]) == len(a["seg"]) == 1
    assert "ventanas" not in a and "modelo" not in a
    assert not (out / ("D" * 11 + ".json")).exists()  # Juventud stays out even with a reconstruction file
