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
