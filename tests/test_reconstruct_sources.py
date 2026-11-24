import json

from scripts.reconstruct import sources
from scripts.reconstruct.sources import load_sources

VTT = """WEBVTT
Kind: captions
Language: es

00:00:01.000 --> 00:00:03.000 align:start position:0%
competencia número doce

00:00:10.000 --> 00:00:12.000 align:start position:0%
verde canto de la

00:00:20.000 --> 00:00:22.000 align:start position:0%
lluve mucho sobre
"""

WHISPER = {"language": "es", "segments": [[30.0 + 3 * i, 32.0 + 3 * i, "muchas gracias a todos por venir hoy"] for i in range(8)]}

LETRA = """---
titulo: Canción de prueba
idioma: pt
---
Verde campo de la sierra

Llueve mucho sobre el valle
"""


def _fixture(tmp_path, cy=False):
    folder = tmp_path / "videos"
    folder.mkdir()
    stem = folder / "2025_clip_vid"
    (folder / "2025_clip_vid.es-orig.vtt").write_text(VTT, encoding="utf-8")
    (folder / "2025_clip_vid.whisper.json").write_text(json.dumps(WHISPER), encoding="utf-8")
    if cy:
        (folder / "2025_clip_vid.cy-whisper.vtt").write_text(VTT.replace("Language: es", "Language: cy"), encoding="utf-8")
    letras = tmp_path / "letras"
    letras.mkdir()
    (letras / "prueba.md").write_text(LETRA, encoding="utf-8")
    (letras / "videos.json").write_text(json.dumps({"vid": [{"letra": "prueba", "desde": 5, "hasta": 25}]}), encoding="utf-8")
    return stem, letras


def test_load_sources_reads_youtube_whisper_and_lyrics(tmp_path):
    stem, letras = _fixture(tmp_path)
    lines = load_sources(stem, "vid", letras)
    assert {l.src for l in lines} == {"yt_es", "whisper_es", "letra"}
    assert [l.t for l in lines] == sorted(l.t for l in lines)
    assert all(l.lang == "es" for l in lines if l.src != "letra")
    assert all(l.lang == "pt" for l in lines if l.src == "letra")
    assert [l.text for l in lines if l.src == "letra"] == ["Verde campo de la sierra", "Llueve mucho sobre el valle"]


def test_spanish_lines_carry_their_end(tmp_path):
    stem, letras = _fixture(tmp_path)
    lines = load_sources(stem, "vid", letras)
    assert [l.e for l in lines if l.src == "yt_es" and l.t == 1.0] == [3.0]
    assert [(l.t, l.e) for l in lines if l.src == "whisper_es"] == [(30.0 + 3 * i, 32.0 + 3 * i) for i in range(8)]
    assert all(l.e is None for l in lines if l.src == "letra")


def test_welsh_lines_come_from_the_bangor_file(tmp_path):
    stem, letras = _fixture(tmp_path, cy=True)
    assert sources.WELSH_SOURCE == "cy-techiaith"  # chosen 2026-11-20 after the A/B review
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 80.0, "e": 82.0, "text": "Croeso i Eisteddfod y Wladfa"}, {"s": 85.0, "e": 86.0, "text": ""}]}), encoding="utf-8")
    cy = [l for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert [(l.t, l.text, l.lang) for l in cy] == [(80.0, "Croeso i Eisteddfod y Wladfa", "cy")]


def test_uploaded_subtitles_only_in_spanish(tmp_path):
    stem, letras = _fixture(tmp_path)
    folder = stem.parent
    (folder / "2025_clip_vid.en.vtt").write_text(VTT.replace("Language: es", "Language: en"), encoding="utf-8")
    (folder / "2025_clip_vid.info.json").write_text(json.dumps({"subtitles": {"en": []}}), encoding="utf-8")
    assert not any(l.src == "subida" for l in load_sources(stem, "vid", letras))


def test_welsh_lyrics_are_timed_from_the_welsh_lines(tmp_path):
    stem, letras = _fixture(tmp_path)
    (letras / "can.md").write_text("---\ntitulo: Cân\nidioma: cy\n---\nAr lan y môr mae rhosys cochion\n\nAr lan y môr mae lilis gwynion\n", encoding="utf-8")
    (letras / "videos.json").write_text(json.dumps({"vid": [{"letra": "can", "desde": 100, "hasta": 140}]}), encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 104.0, "text": "ar lan y mor mae rhosys"}, {"s": 121.0, "text": "ar lan y mor mae lili gwynion"}]}), encoding="utf-8")
    lyr = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "letra"]
    assert lyr == [(104.0, "Ar lan y môr mae rhosys cochion"), (121.0, "Ar lan y môr mae lilis gwynion")]


def test_welsh_lines_only_where_the_spanish_sources_are_silent(tmp_path):
    # Bangor's model writes Welsh even over Spanish speech: on a video with Spanish text,
    # its lines count only in the Spanish gaps (where the Welsh speech actually is).
    stem, letras = _fixture(tmp_path)          # yt_es lines at 1, 10, 20 s; whisper_es 30-51 s
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 30.5, "text": "nonsens dros sbaeneg"},       # over Spanish speech (Whisper, 7 words): dropped
        {"s": 70.0, "text": "Croeso i Eisteddfod y Wladfa"},  # in a gap: kept
    ]}), encoding="utf-8")
    cy = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy == [(70.0, "Croeso i Eisteddfod y Wladfa")]


def test_welsh_lines_next_to_youtube_scraps_are_kept(tmp_path):
    # 59 videos with both sources: 118 of the 134 Welsh lines dropped were next to a tag or a few
    # words YouTube guessed over Welsh singing ("[Música]", "cvar", "div"), not Spanish speech.
    stem, letras = _fixture(tmp_path)          # yt_es lines at 1, 10 (4 words), 20 s (3 words)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    vtt = stem.parent / f"{stem.name}.es-orig.vtt"
    vtt.write_text(vtt.read_text(encoding="utf-8") + "\n00:01:20.000 --> 00:01:22.000 align:start position:0%\n[Música]\n", encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 10.5, "text": "Yr arglwydd a'th geidw rhag pob drwg"},  # 4 words of YouTube nearby: kept
        {"s": 20.5, "text": "Llueve mucho sobre el valle"},           # Spanish the Welsh model heard too: dropped
        {"s": 80.5, "text": "Diolch yn fawr"},                         # next to a tag only: kept
    ]}), encoding="utf-8")
    cy = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy == [(10.5, "Yr arglwydd a'th geidw rhag pob drwg"), (80.5, "Diolch yn fawr")]


def test_welsh_lines_carry_confidence(tmp_path):
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 80.0, "text": "Croeso i bawb", "lp": -0.19}]}), encoding="utf-8")
    cy = [l for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy[0].conf == 0.83 and all(l.conf is None for l in load_sources(stem, "vid", letras) if l.src != "cy")


def test_low_confidence_welsh_lines_are_left_out(tmp_path):
    # Bangor writes Welsh-looking text over music and background chatter, with low confidence
    # (2009 chair ceremony, 0:10-2:49: conf 0.14-0.49); real speech there is 0.67 or more.
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 80.0, "text": "Diolch am y cofio", "lp": -0.82},             # conf 0.44: background
        {"s": 90.0, "text": "Mae pedair cerdd yn dod i'r dosbarth cyntaf", "lp": -0.23},  # conf 0.79: speech
        {"s": 95.0, "text": "heb sgôr", "s_": 0}]}), encoding="utf-8")       # no confidence given: kept
    cy = [l.text for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy == ["Mae pedair cerdd yn dod i'r dosbarth cyntaf", "heb sgôr"]


def test_english_the_welsh_model_heard_is_left_out(tmp_path):
    # Bangor's model is Welsh and English: an English song sung in the hall comes out in English.
    stem, letras = _fixture(tmp_path, cy=True)
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 80.0, "e": 82.0, "text": "Croeso i Eisteddfod y Wladfa"},
        {"s": 90.0, "e": 95.0, "text": "Wade in the water, wade in the water children, oh Lord my God"}]}), encoding="utf-8")
    assert [l.text for l in load_sources(stem, "vid", letras) if l.src == "cy"] == ["Croeso i Eisteddfod y Wladfa"]


def test_the_spanish_pass_replaces_the_welsh_model_where_it_heard_spanish(tmp_path):
    # #112: Whisper took Chubut 2021 UW0GV9sicGs for Welsh, so the Welsh model was its only source and it wrote
    # Spanish speech in Welsh spelling or translated it. The Spanish pass detects each Bangor segment's language
    # and transcribes the Spanish ones: their text is Spanish Whisper's, the Bangor line goes.
    folder = tmp_path / "C" / "2021"
    folder.mkdir(parents=True)
    stem = folder / "2021_sesion_vid"
    (folder / "2021_sesion_vid.whisper.json").write_text(json.dumps({"language": "cy", "segments": [[0, 5, "rhywbeth"]]}), encoding="utf-8")
    (folder / "2021_sesion_vid.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 2648.76, "e": 2652.7, "text": "música, ystá en el segundo año de la carrera de locución"},
        {"s": 3061.06, "e": 3069.0, "text": "Yn ystod y casglu, yna unig un cyngor sydd ar y stafell"},  # a translation
        {"s": 2774.82, "e": 2804.8, "text": "yn dref yr hebog airiw"},                                    # Welsh poem
        {"s": 3290.48, "e": 3291.4, "text": "Gracias."},
    ]}), encoding="utf-8")
    (folder / "2021_sesion_vid.whisper-es.json").write_text(json.dumps({"segments": [
        {"s": 2648.76, "e": 2652.7, "es": 0.999, "cy": 0.0, "text": "Música, está en el segundo año de la carrera de locución."},
        {"s": 3061.06, "e": 3069.0, "es": 0.998, "cy": 0.0, "text": "En este caso hay una sola participante que ya está en el escenario."},
        {"s": 2774.82, "e": 2804.8, "es": 0.001, "cy": 0.832},
        {"s": 3290.48, "e": 3291.4, "es": 0.526, "cy": 0.0, "text": ""},  # Spanish, but nothing worth keeping
    ]}), encoding="utf-8")
    letras = tmp_path / "letras"
    letras.mkdir()
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    got = [(l.t, l.src, l.text) for l in load_sources(stem, "vid", letras)]
    assert got == [
        (2648.76, "whisper_es", "Música, está en el segundo año de la carrera de locución."),
        (2774.82, "cy", "yn dref yr hebog airiw"),
        (3061.06, "whisper_es", "En este caso hay una sola participante que ya está en el escenario."),
    ]


def test_welsh_speech_written_by_spanish_whisper_does_not_push_out_the_welsh_model(tmp_path):
    # Spanish Whisper writes Welsh speech as Welsh, with "en" for "yn" (Chubut 2022 -t5r4pwKx50):
    # that is not Spanish speech, so Bangor's own line next to it stays.
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.whisper.json").write_text(json.dumps({"language": "es", "segments": WHISPER["segments"] + [
        [60.0, 64.0, "Ma hwnna'n rhywbeth i'w ganmol en fawr iawn a ni ddim en gweld hyn"],
        [90.0, 94.0, "muchas gracias a todos por venir hoy"]]}), encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 60.5, "text": "Mae hwnna'n rhywbeth i'w ganmol yn fawr iawn"},  # next to Welsh: kept
        {"s": 90.5, "text": "Diolch yn fawr i chi gyd am ddod"},           # next to Spanish speech: dropped
    ]}), encoding="utf-8")
    cy = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy == [(60.5, "Mae hwnna'n rhywbeth i'w ganmol yn fawr iawn")]


def test_welsh_that_spanish_whisper_wrote_gives_way_to_bangor(tmp_path):
    # Chubut 2016 hsUB7VS3ozo: Whisper (Spanish) wrote the chair ceremony's Welsh as "Iagor o ddebod, bydd
    # William Windy en un harwain"; Bangor has it right 4.6 s earlier. Only Bangor's is kept; with no Bangor
    # line near, the Spanish source's Welsh stays (it may be the only text of that speech).
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.whisper.json").write_text(json.dumps({"language": "es", "segments": WHISPER["segments"] + [
        [65.0, 69.0, "Iagor o ddebod, bydd William Windy en un harwain i ganu Gwedir Orser."],
        [150.0, 154.0, "Diolch yn fawr i chi gyd am wrando mor astud heddiw"]]}), encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 60.4, "text": "I agor y ddefod bydd William Windi yn ein harwain i ganu Gweddi'r Orsedd."}]}), encoding="utf-8")
    lines = load_sources(stem, "vid", letras)
    assert [l.t for l in lines if l.src == "cy"] == [60.4]
    assert [l.t for l in lines if l.src == "whisper_es" and l.t > 60] == [150.0]


# The mixed-language pass (design 2026-11-24-gales-castellano-mezclados): three files beside the video.
TURBO_FILLER = [{"s": 1000.0 + 3 * i, "e": 1002.0 + 3 * i, "text": "buenas tardes a todos los presentes hoy", "lp": -0.2,
                 "words": []} for i in range(8)]


def _words(s, text, step=0.5, p=0.9):
    return [[round(s + step * i, 2), round(s + step * (i + 1), 2), w, p] for i, w in enumerate(text.split())]


def _row(s, cy, es="", cy_p=0.9, es_p=0.3):
    cw, ew = _words(s, cy, p=cy_p), _words(s, es, p=es_p) if es else []
    return {"s": cw[0][0], "e": cw[-1][1], "cy": cy, "cy_p": cy_p, "cy_words": cw, "es": es, "es_p": es_p, "es_words": ew}


def _mezcla_fixture(tmp_path, segments, rows, turbo=(), parts=("cy-palabras", "es-lineas", "es-turbo")):
    """The base fixture (yt_es at 1, 10, 20 s; whisper_es 30-51 s) plus the mixed pass's files, no lyric spans."""
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    docs = {"cy-palabras": {"segments": segments}, "es-lineas": {"lines": rows},
            "es-turbo": {"language": "es", "segments": list(turbo) + TURBO_FILLER}}
    for k in parts:
        (stem.parent / f"{stem.name}.{k}.json").write_text(json.dumps(docs[k]), encoding="utf-8")
    return stem, letras


def _seg(row, lp=-0.1, text=None):
    return {"s": row["s"], "e": row["e"], "text": text or row["cy"], "lp": lp, "ns": 0.0, "cr": 1.0, "words": row["cy_words"]}


def test_has_mezcla_needs_all_three_files(tmp_path):
    stem, _ = _mezcla_fixture(tmp_path, [], [], parts=("cy-palabras", "es-lineas"))
    assert not sources.has_mezcla(stem)
    (stem.parent / f"{stem.name}.es-turbo.json").write_text("{}", encoding="utf-8")
    assert sources.has_mezcla(stem)
    assert (sources.OVERLAP, sources.UNKNOWN_SPAN) == (0.5, 1.0)


def test_welsh_kept_next_to_spanish_garble(tmp_path):
    # 5:21: clear Welsh, and Spanish Whisper's garble of it starting 1 s later, overlapping it for 0.4 of its length.
    row = _row(321.0, "diolch yn fawr i chi gyd")              # 321.0-324.0
    garble = {"s": 322.0, "e": 327.0, "text": "dio jen ba ri chi cid", "lp": -0.5, "words": []}  # 2 of its 5 s overlap
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row], turbo=[garble])
    got = [(l.t, l.src, l.text) for l in load_sources(stem, "vid", letras) if 300 < l.t < 400]
    assert got == [(321.0, "cy", "diolch yn fawr i chi gyd"), (322.0, "whisper_es", "dio jen ba ri chi cid")]


def test_spanish_line_before_welsh_segment_is_kept(tmp_path):
    # 7:34: Spanish speech that ends before Bangor's line starts is other speech.
    row = _row(454.0, "croeso cynnes i bawb yma")
    before = {"s": 450.0, "e": 453.9, "text": "y ahora pasamos a la siguiente", "lp": -0.2, "words": []}
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row], turbo=[before])
    got = [(l.t, l.src) for l in load_sources(stem, "vid", letras) if 400 < l.t < 500]
    assert got == [(450.0, "whisper_es"), (454.0, "cy")]


def _vtt_cue(stem, t, e, text):
    vtt = stem.parent / f"{stem.name}.es-orig.vtt"
    ts = lambda x: f"00:{int(x // 60):02d}:{x % 60:06.3f}"
    vtt.write_text(vtt.read_text(encoding="utf-8") + f"\n{ts(t)} --> {ts(e)} align:start position:0%\n{text}\n", encoding="utf-8")


def test_duplicate_spanish_line_dropped_by_overlap(tmp_path):
    # 7:45: YouTube's line of the speech a decided line already has; dropped from half its own length overlapped.
    row = _row(465.0, "el número siete del programa", es="el número siete del programa", cy_p=0.3, es_p=0.9)  # 465-467.5
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row])
    _vtt_cue(stem, 466.0, 468.5, "el número siete")                 # 1.5 of its 2.5 s overlap: 60 %
    _vtt_cue(stem, 466.5, 469.0, "siete del programa")              # 1.0 of 2.5 s: 40 %
    got = [(l.t, l.src) for l in load_sources(stem, "vid", letras) if 400 < l.t < 500]
    assert got == [(465.0, "whisper_es"), (466.5, "yt_es")]


def test_unknown_end_counts_one_second(tmp_path):
    row = _row(100.0, "diolch yn fawr iawn")  # 100.0-102.0
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row])
    decided = [l for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    near = sources.Line(101.4, "gracias", "yt_es", "es")  # no end: 101.4-102.4, 0.6 of 1 s overlapped
    far = sources.Line(101.6, "gracias", "yt_es", "es")   # 101.6-102.6: 0.4
    assert sources._overlapped(near, decided) and not sources._overlapped(far, decided)


def test_incomplete_pass_keeps_todays_rules(tmp_path):
    stem, letras = _fixture(tmp_path)
    (letras / "videos.json").write_text("{}", encoding="utf-8")
    (stem.parent / f"{stem.name}.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": 30.5, "text": "nonsens dros sbaeneg"},          # next to Spanish speech: dropped (SPANISH_NEAR)
        {"s": 70.0, "text": "Croeso i Eisteddfod y Wladfa"}]}), encoding="utf-8")
    before = load_sources(stem, "vid", letras)
    row = _row(70.0, "croeso i eisteddfod y wladfa")
    (stem.parent / f"{stem.name}.cy-palabras.json").write_text(json.dumps({"segments": [_seg(row)]}), encoding="utf-8")
    after = load_sources(stem, "vid", letras)
    assert after == before
    assert [l.t for l in after if l.src == "cy"] == [70.0]


def test_segment_without_words_is_kept(tmp_path):
    row = _row(200.0, "diolch yn fawr")
    bare = lambda lp: {"s": 210.0, "e": 213.0, "text": "pnawn da i bawb", "lp": lp, "ns": 0.0, "cr": 1.0, "words": []}
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row), bare(-0.223)], [row])  # exp(-0.223) = 0.80
    cy = [(l.t, l.text, l.conf, l.e) for l in load_sources(stem, "vid", letras) if l.src == "cy"]
    assert cy == [(200.0, "diolch yn fawr", 0.9, 201.5), (210.0, "pnawn da i bawb", 0.8, 213.0)]
    (stem.parent / f"{stem.name}.cy-palabras.json").write_text(
        json.dumps({"segments": [_seg(row), bare(-0.693)]}), encoding="utf-8")  # 0.50: below MIN_CY_CONF
    assert [l.t for l in load_sources(stem, "vid", letras) if l.src == "cy"] == [200.0]


def test_low_confidence_and_english_rows_are_dropped(tmp_path):
    low, eng, ok = (_row(200.0, "diolch am y cofio"), _row(220.0, "wade in the water children oh my god"),
                    _row(240.0, "croeso i bawb yma heddiw"))
    stem, letras = _mezcla_fixture(tmp_path, [_seg(low, lp=-0.82), _seg(eng), _seg(ok)], [low, eng, ok])
    assert [l.t for l in load_sources(stem, "vid", letras) if l.src == "cy"] == [240.0]


def test_confidence_follows_the_row_into_its_segment(tmp_path):
    # Two lines cut from one Bangor segment both take its confidence; the second row starts inside the segment.
    a, b = _row(300.0, "diolch yn fawr"), _row(302.5, "croeso i bawb")  # 300-301.5, 302.5-304.0
    seg = {"s": 300.0, "e": 304.0, "text": "diolch yn fawr croeso i bawb", "lp": -0.105, "ns": 0.0, "cr": 1.0,
           "words": a["cy_words"] + b["cy_words"]}
    stem, letras = _mezcla_fixture(tmp_path, [seg], [a, b])
    assert [(l.t, l.conf) for l in load_sources(stem, "vid", letras) if l.src == "cy"] == [(300.0, 0.9), (302.5, 0.9)]


def test_whisper_es_pass_ignored_when_mezcla(tmp_path):
    row = _row(300.0, "diolch yn fawr i chi")
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row])
    (stem.parent / f"{stem.name}.whisper-es.json").write_text(json.dumps({"segments": [
        {"s": 300.0, "e": 302.5, "es": 0.99, "cy": 0.0, "text": "esto no debe salir"},
        {"s": 600.0, "e": 602.0, "es": 0.99, "cy": 0.0, "text": "esto tampoco"}]}), encoding="utf-8")
    lines = load_sources(stem, "vid", letras)
    assert not any("esto" in l.text for l in lines)
    assert [l.t for l in lines if l.src == "cy"] == [300.0]


def test_welsh_lyric_timed_from_decided_lines(tmp_path):
    a, b = _row(104.0, "pnawn da i bawb sydd yma"), _row(121.0, "diolch yn fawr am ddod heno")
    stem, letras = _mezcla_fixture(tmp_path, [_seg(a), _seg(b)], [a, b])
    (letras / "can.md").write_text("---\ntitulo: Prawf\nidioma: cy\n---\nPnawn da i bawb sydd yma\n\nDiolch yn fawr am ddod heno\n",
                                   encoding="utf-8")
    (letras / "videos.json").write_text(json.dumps({"vid": [{"letra": "can", "desde": 100, "hasta": 140}]}), encoding="utf-8")
    lyr = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "letra"]
    assert lyr == [(104.0, "Pnawn da i bawb sydd yma"), (121.0, "Diolch yn fawr am ddod heno")]


def test_uploaded_subtitles_are_never_dropped_by_overlap(tmp_path):
    # The uploader's subtitles are the most reliable source: a decided line covering one does not remove it.
    row = _row(100.0, "diolch yn fawr iawn i chi")  # 100.0-103.0
    stem, letras = _mezcla_fixture(tmp_path, [_seg(row)], [row])
    (stem.parent / f"{stem.name}.es.vtt").write_text(
        "WEBVTT\n\n00:01:40.500 --> 00:01:42.500\nmuchas gracias a ustedes\n", encoding="utf-8")
    (stem.parent / f"{stem.name}.info.json").write_text(json.dumps({"subtitles": {"es": []}}), encoding="utf-8")
    got = [(l.t, l.src) for l in load_sources(stem, "vid", letras) if 90 < l.t < 110]
    assert got == [(100.0, "cy"), (100.5, "subida")]


def test_row_at_a_segment_boundary_takes_the_later_segment(tmp_path):
    # Bangor's segments touch (e1 == s2): a row starting at s2 is the second segment's, not the first's.
    music, speech = _row(400.0, "la la la la"), _row(402.0, "croeso i bawb yma")  # 400-402, 402-404
    seg1 = {**_seg(music, lp=-0.82), "e": 402.0}                                     # conf 0.44: background
    seg2 = _seg(speech, lp=-0.105)                                                   # conf 0.90
    for words in (True, False):  # matched by the row's first word, then by time alone
        segs = [seg1, seg2] if words else [{**g, "words": [[0, 0, "x", 0]]} for g in (seg1, seg2)]
        (tmp_path / str(words)).mkdir()
        stem, letras = _mezcla_fixture(tmp_path / str(words), segs, [music, speech])
        assert [(l.t, l.conf) for l in load_sources(stem, "vid", letras) if l.src == "cy"] == [(402.0, 0.9)]


def test_overlap_counts_the_union_of_decided_lines():
    # Two decided lines each cover 47 % of a YouTube cue (101-104): together 93 %, so it is the same speech.
    cue = sources.Line(101.0, "gracias", "yt_es", "es", None, 104.0)
    decided = [sources.Line(100.0, "diolch", "cy", "cy", 0.9, 102.4), sources.Line(102.6, "yn fawr", "cy", "cy", 0.9, 105.0)]
    assert sources._overlapped(cue, decided)
    # overlapping decided lines are not counted twice: 101-102.4 twice is still 47 %
    assert not sources._overlapped(cue, [decided[0], decided[0]._replace(t=100.5)])


def test_first_whisper_pass_gives_way_to_turbo_long_form(tmp_path):
    # Both are whisper_es: where turbo's long form has the speech, the first pass's line of it is left out.
    longform = {"s": 30.5, "e": 32.5, "text": "muchas gracias por estar aquí esta tarde", "lp": -0.2, "words": []}
    stem, letras = _mezcla_fixture(tmp_path, [], [], turbo=[longform])  # first pass: 30-32, 33-35, ...
    got = [(l.t, l.text) for l in load_sources(stem, "vid", letras) if l.src == "whisper_es" and l.t < 36]
    assert got == [(30.5, "muchas gracias por estar aquí esta tarde"), (33.0, "muchas gracias a todos por venir hoy")]


def test_lines_differing_only_in_confidence_sort(tmp_path):
    # A row whose segment has no confidence and a bare segment with one, same start and text: sorting whole
    # tuples compared None with a float.
    row = _row(500.0, "pnawn da i bawb")
    seg = {k: v for k, v in _seg(row).items() if k != "lp"}
    bare = {**_seg(row), "words": []}
    stem, letras = _mezcla_fixture(tmp_path, [seg, bare], [row])
    assert [l.conf for l in load_sources(stem, "vid", letras) if l.src == "cy"] in ([None, 0.9], [0.9, None])


def test_word_confidence_index_keeps_the_first_segment():
    w = [1.0, 1.5, "gair", 0.9]
    segments = [{"words": [w]}, {"words": [list(w)]}, {"words": []}]
    assert sources._word_conf(segments, [(0, 2, 0.8), (0, 2, 0.4), (2, 3, 0.5)]) == {tuple(w): 0.8}


def test_same_start_lines_of_different_sources_reach_the_aligner_in_text_order(tmp_path, monkeypatch):
    stem, letras = _fixture(tmp_path)
    _vtt_cue(stem, 100.0, 102.0, "alfa inicial")                     # yt_es
    (stem.parent / f"{stem.name}.whisper.json").write_text(json.dumps(
        {"language": "es", "segments": [[100.0, 102.0, "zeta final"]] + WHISPER["segments"]}), encoding="utf-8")
    (letras / "videos.json").write_text(json.dumps({"vid": [{"letra": "prueba", "desde": 90, "hasta": 110}]}), encoding="utf-8")
    seen = []
    monkeypatch.setattr(sources, "align", lambda heard, *a, **k: seen.append(heard) or [])
    load_sources(stem, "vid", letras)
    same = [x for t, x in seen[0] if t == 100.0]
    assert same == sorted(same) and len(same) == 2
