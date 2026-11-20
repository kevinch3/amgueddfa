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


def test_welsh_is_left_out_until_chosen(tmp_path):
    stem, letras = _fixture(tmp_path, cy=True)
    assert sources.WELSH_SOURCE is None
    assert not any(l.src == "cy" for l in load_sources(stem, "vid", letras))
