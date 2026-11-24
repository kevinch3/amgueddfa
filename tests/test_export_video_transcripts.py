import json
import os
import time

import pytest

from scripts.export_video_transcripts import export, parse_vtt, parse_vtt_timed

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


def test_parse_vtt_timed_keeps_cue_end():
    # a line repeated in rolling cues keeps the end of the cue where it first appears
    assert parse_vtt_timed(YT_AUTO) == [[1.4, 3.6, "buenas noches a todos"], [3.6, 6.0, "comienza la competencia"]]


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
    assert r == {"written": 3, "removed": 1, "sin_anclar": 0, "subida": 1, "youtube": 1, "whisper": 1}
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


def test_export_credits_each_lyric_with_its_rights_and_source(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2025/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2025/a_AAAAAAAAAAA.mp4\n", encoding="utf-8")
    letras = tmp_path / "letras"
    letras.mkdir()
    (letras / "pieza.md").write_text("---\ntitulo: Pieza\nautor: X\nidioma: es\nderechos: Texto tradicional (dominio público)\n"
                                     "fuente: https://ejemplo.org/pieza, aportado por Alguien\n---\nuna línea\n", encoding="utf-8")
    (letras / "videos.json").write_text(json.dumps({"A" * 11: [{"letra": "pieza", "desde": 0, "hasta": 9}]}), encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    rec = {"src": "reconstruida", "lang": "es", "seg": [[1.4, "una línea"]], "fuentes": [["letra"]],
           "letras": [{"desde": 0, "hasta": 9, "titulo": "Pieza", "autor": "X", "idioma": "es"}]}
    (recon / f"{'A' * 11}.json").write_text(json.dumps(rec), encoding="utf-8")
    out = tmp_path / "out"
    export(b, [{"id": "A" * 11, "festival": "chubut"}], out, recon=recon, letras=letras)
    l = json.loads((out / ("A" * 11 + ".json")).read_text())["letras"][0]
    assert l["derechos"] == "Texto tradicional (dominio público)"
    assert l["fuente"] == "https://ejemplo.org/pieza, aportado por Alguien"


def test_main_language_follows_the_published_text_not_the_count_of_source_lines():
    from scripts.export_video_transcripts import main_language
    t = {"lang": "es", "seg": [[0, "Ynawn, dyma ni'n symud ymlaen i gadeirio'r Tŷ Graham Williams yn brifardd"], [10, "Williams"],
                              [30, "Saes uwch adlais, a oes heddwch, heddwch. Debiwch adledd, a oes heddwch."]],
         "fuentes": [["cy"], ["yt_es"], ["cy"]]}
    assert main_language(t) == "cy"
    t2 = {"lang": "cy", "seg": [[0, "Buenas noches a todos, bienvenidos a la última sesión"], [5, "Diolch"]], "fuentes": [["yt_es"], ["cy"]]}
    assert main_language(t2) == "es"
    assert main_language({"lang": "es", "seg": [[0, "hola"]]}) == "es"  # no per-line sources: keep it


def _t(seg, fuentes=None, letras=None):
    t = {"src": "reconstruida", "lang": "es", "seg": [list(s) for s in seg], "fuentes": fuentes or [["yt_es"]] * len(seg)}
    if letras: t["letras"] = letras
    return t


def test_join_fragments_makes_sentences_from_caption_chunks():
    from scripts.export_video_transcripts import join_fragments
    t = join_fragments(_t([[455, "tardes solicitamos a todos que vayan"], [459, "tomando"], [461, "ubicación para poder dar inicio a la"],
                           [464, "última sesión."], [488, "Bienvenidos a todos"]], fuentes=[["yt_es"], ["yt_es"], ["whisper_es"], ["yt_es"], ["yt_es"]]))
    assert t["seg"] == [[455, "tardes solicitamos a todos que vayan tomando ubicación para poder dar inicio a la última sesión."],
                        [488, "Bienvenidos a todos"]]
    assert t["fuentes"] == [["yt_es", "whisper_es"], ["yt_es"]]  # union, in order, one list per line


def test_join_fragments_respects_gaps_caps_languages_lyrics_and_tags():
    from scripts.export_video_transcripts import join_fragments
    assert len(join_fragments(_t([[0, "y entonces"], [9, "llegaron"]]))["seg"]) == 2  # 9 s apart: a pause, not one sentence
    long = [[i * 2, "una dos tres cuatro cinco"] for i in range(6)]
    assert all(len(x.split()) <= 20 for _, x in join_fragments(_t(long))["seg"])  # 20-word cap
    slow = [[i * 5, "palabra"] for i in range(6)]
    assert all(b - a >= 0 for (a, _), (b, _) in zip(join_fragments(_t(slow))["seg"], join_fragments(_t(slow))["seg"][1:]))
    assert max(len(x.split()) for _, x in join_fragments(_t(slow))["seg"]) <= 4  # 15 s span cap
    mixed = join_fragments(_t([[0, "diolch yn fawr"], [2, "muchas gracias a"], [4, "todos"]], fuentes=[["cy"], ["yt_es"], ["yt_es"]]))
    assert mixed["seg"] == [[0, "diolch yn fawr"], [2, "muchas gracias a todos"]]  # Welsh and Spanish never joined
    sung = join_fragments(_t([[100, "Libertad,"], [102, "libertad,"], [104, "libertad"]], fuentes=[["letra"]] * 3,
                             letras=[{"desde": 90, "hasta": 200, "titulo": "Himno", "autor": "", "idioma": "es"}]))
    assert len(sung["seg"]) == 3  # one verse per line
    tags = join_fragments(_t([[0, "[música]"], [2, "y ahora"], [3, "[aplausos]"]]))
    assert [x for _, x in tags["seg"]] == ["[música]", "y ahora", "[aplausos]"]


def test_join_fragments_leaves_a_transcript_without_sources_alone():
    from scripts.export_video_transcripts import join_fragments
    t = {"src": "youtube", "lang": "es", "seg": [[0, "a"], [1, "b"]]}
    assert join_fragments(t)["seg"] == [[0, "a"], [1, "b"]]


def test_join_fragments_starts_a_line_where_whisper_starts_a_sentence():
    from scripts.export_video_transcripts import join_fragments
    t = join_fragments(_t([[0, "Hoy me aterra este cansancio sin final"], [3, "Y se trizas mi sonrisa de cristal"], [5, "cuando miro"]],
                          fuentes=[["whisper_es"], ["whisper_es"], ["whisper_es"]]))
    assert [x for _, x in t["seg"]] == ["Hoy me aterra este cansancio sin final", "Y se trizas mi sonrisa de cristal cuando miro"]


def test_join_fragments_sees_a_sentence_end_before_a_trailing_tag_and_never_joins_the_same_second():
    from scripts.export_video_transcripts import join_fragments
    assert len(join_fragments(_t([[0, "un diente menos. [canto]"], [3, "por ese portillito"]]))["seg"]) == 2
    assert len(join_fragments(_t([[8, "Gales optó por el narciso,"], [8, "como emblema"]]))["seg"]) == 2


def test_join_fragments_keeps_declared_lyric_spans_line_by_line():
    from scripts.export_video_transcripts import join_fragments
    t = join_fragments(_t([[80, "zamba quiero"], [82, "oír"]]), spans=[(75, 318)])
    assert len(t["seg"]) == 2


@pytest.mark.parametrize("text, english", [
    ("Why do stars in the sky every time you are by look just like these", True),
    ("You can take, you can leave, let him be, let him leave.", True),
    ("Fix me, fix me for my journey home", True),
    ("Felly, diolch yn fawr iawn i chi am eich gysylltu efo ni", False),
    ("Halleluja, halleluja, i'r gŵr tewi'n anial dydd.", False),
    ("Will it, will it Llywelyn, will it why pe gwelyd hyn, ein calon gan estron ŵr", False),  # mostly Welsh
    ("Hoy quise escuchar tu voz, y ya no estabas.", False),
    ("Oh yes", False),  # too short to tell
    # Chubut 2021 UW0GV9sicGs: pop songs over the break, kept until the capital "I" and these words counted
    ("Even if I stop wanting you And perspective pushes true", True),
    ("I cannot blame myself yet I should just be my own best friend", True),
    ("The dark covers me and I cannot run now.", True),
    ("Diolch i chi i gyd am ddod, a diolch i'r beirniaid", False),  # Welsh "i" is lowercase
    ("I Patagonia I Patagonia I Patagonia.", False),  # a Welsh refrain: "I" alone is not English
    ("No he hablado de ella como amiga, porque me resulta difícil", False),
])
def test_is_english(text, english):
    from scripts.export_video_transcripts import is_english
    assert is_english(text) is english


def test_export_drops_english_lines_the_welsh_model_heard(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2025/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    _video(b, "C/2025/b_BBBBBBBBBBB.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2025/a_AAAAAAAAAAA.mp4\n{'B' * 11}\tC/2025/b_BBBBBBBBBBB.mp4\n", encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    mixed = {"src": "reconstruida", "lang": "cy", "seg": [[0, "Diolch yn fawr iawn i chi am ddod heddiw"], [30, "Why do stars in the sky every time you are by look just like these"]],
             "fuentes": [["cy"], ["cy"]]}
    song = {"src": "reconstruida", "lang": "cy", "seg": [[0, "Wade in the water, wade in the water children, oh Lord"]], "fuentes": [["cy"]]}
    (recon / f"{'A' * 11}.json").write_text(json.dumps(mixed), encoding="utf-8")
    (recon / f"{'B' * 11}.json").write_text(json.dumps(song), encoding="utf-8")
    out = tmp_path / "out"
    export(b, [{"id": "A" * 11, "festival": "chubut"}, {"id": "B" * 11, "festival": "chubut"}], out, recon=recon)
    a = json.loads((out / ("A" * 11 + ".json")).read_text())
    assert [x for _, x in a["seg"]] == ["Diolch yn fawr iawn i chi am ddod heddiw"] and len(a["fuentes"]) == 1
    assert not (out / ("B" * 11 + ".json")).exists()  # nothing left: the video has no text


@pytest.mark.parametrize("text, fuentes, lang", [
    # Chubut 2021 UW0GV9sicGs: only the Welsh model heard this session, Spanish speech included
    ("Ahora si, entonces, si el Jurado de Música en Castellano lo dispone, competencia número cincuenta y tres, Magda y Antonella.", ["cy"], "es"),
    ("Así que le vamos a dar el paso a ella para que lea el próximo benedicto.", ["cy"], "es"),
    ("Mucho, gracias.", ["cy"], "es"),
    ("a ddylai gael eu gweithio'n hellach er mwyn eu chyhoeddi, cerdd wedi'u cynllunio'n ofalus i gyrraedd diweddglo effeithiol.", ["cy"], "cy"),
    ("parti neu côr merched yr unig yng ngosodliad y gosodleiaeth yma o'dd rhai sy'n barod. Wel dyma ni yym cystadleuaeth pum deg naw "
     "parti neu côr merched ein gwlad gan Nia Wyn Jones. yy ysta cansion yym habla sobre nuestro pais", ["cy"], "cy"),  # mostly Welsh
    ("Diolch yn fawr", ["cy"], "cy"),
    ("Gwych", ["cy"], "cy"),  # nothing to tell: the model's language
    ("Diolch", ["yt_es"], "es"),  # one Welsh word in a Spanish source's line: still Spanish
    # Spanish Whisper writes Welsh speech as Welsh too, with "en" for "yn" (Chubut 2022 -t5r4pwKx50)
    ("Mae'n rhaid wrth gannu Emin fod yn ddidwyll.", ["whisper_es"], "cy"),
    ("Ma hwnna'n rhywbeth i'w ganmol en fawr iawn a ni ddim en gweld hyn en amal yng Nghymru.", ["whisper_es"], "cy"),
    # a Spanish announcement naming Welsh choirs and chapels stays Spanish
    ("Invitamos al Côr Ysgol Gerdd y Gaiman", ["whisper_es"], "es"),
    ("Felicitamos al Côr Merched Ysgol Gerdd Hendre y al Capel Bethel", ["yt_es"], "es"),
])
def test_line_language_reads_the_text_of_a_welsh_model_line(text, fuentes, lang):
    from scripts.export_video_transcripts import line_language
    assert line_language(text, fuentes) == lang


def test_main_language_counts_spanish_the_welsh_model_heard_as_spanish():
    from scripts.export_video_transcripts import main_language
    t = {"lang": "cy", "seg": [[0, "Así que le vamos a dar el paso a ella para que lea el próximo veredicto."], [9, "Diolch yn fawr"]],
         "fuentes": [["cy"], ["cy"]]}
    assert main_language(t) == "es"


def test_export_writes_line_languages_only_where_the_source_would_mislead(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2021/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    _video(b, "C/2021/b_BBBBBBBBBBB.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2021/a_AAAAAAAAAAA.mp4\n{'B' * 11}\tC/2021/b_BBBBBBBBBBB.mp4\n", encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    mixed = {"src": "reconstruida", "lang": "cy", "fuentes": [["cy"], ["cy"]],
             "seg": [[0, "Así que le vamos a dar el paso a ella para que lea el próximo veredicto."], [30, "Diolch yn fawr iawn i chi am ddod heddiw"]]}
    plain = {"src": "reconstruida", "lang": "es", "fuentes": [["yt_es"], ["cy"]],
             "seg": [[0, "Buenas noches a todos, bienvenidos a la última sesión."], [30, "Diolch yn fawr iawn i chi am ddod heddiw"]]}
    (recon / f"{'A' * 11}.json").write_text(json.dumps(mixed), encoding="utf-8")
    (recon / f"{'B' * 11}.json").write_text(json.dumps(plain), encoding="utf-8")
    out = tmp_path / "out"
    export(b, [{"id": "A" * 11, "festival": "chubut"}, {"id": "B" * 11, "festival": "chubut"}], out, recon=recon)
    a = json.loads((out / ("A" * 11 + ".json")).read_text())
    assert a["idiomas"] == ["es", "cy"] and a["lang"] == "es"
    assert "idiomas" not in json.loads((out / ("B" * 11 + ".json")).read_text())  # every line's source tells its language


import scripts.export_video_transcripts as export_module


@pytest.mark.parametrize("encoding", ["utf-8", "latin-1"])
def test_the_word_list_keeps_its_accented_words(tmp_path, monkeypatch, encoding):
    # /usr/share/dict/spanish is UTF-8 today; older wspanish packages shipped it in Latin-1.
    p = tmp_path / "spanish"
    p.write_text("número\ncanción\ncasa\n", encoding=encoding)
    monkeypatch.setattr(export_module, "SPANISH_DICT", p)
    assert {"numero", "cancion", "casa"} <= export_module.spanish_words()


def test_term_fixes_keep_the_case_of_a_word_and_capitalise_a_name(monkeypatch):
    monkeypatch.setitem(export_module.TERM_FIXES, "nelsis", ("Nelcis", True))
    fix = export_module.fix_terms
    assert fix("la presidente del Círculo Várdico del Chubut") == "la presidente del Círculo Bárdico del Chubut"
    assert fix("del círculo várdico.") == "del círculo bárdico."
    assert fix("gracias a nelsis y a Nelsis") == "gracias a Nelcis y a Nelcis"
    assert fix("Vardicos y valdor") == "Vardicos y valdor"  # whole words only


def test_export_fixes_terms_in_spanish_lines_only(tmp_path):
    b = tmp_path / "backup"
    _video(b, "C/2021/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2021/a_AAAAAAAAAAA.mp4\n", encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    t = {"src": "reconstruida", "lang": "es", "fuentes": [["whisper_es"], ["cy"], ["letra"], ["whisper_es"], ["whisper_es"]],
         "seg": [[0, "Invitamos al presidente del Círculo Várdico del Chubut."],
                 [30, "Diolch i'r Cylch Várdico am ddod heddiw"], [60, "Várdico, canta el coro"],
                 [90, "Mae'r gerd hon yn hyfryd iawn, wrth gwrs."], [120, "Dyma gannu telenegol a swinol"]]}
    (recon / f"{'A' * 11}.json").write_text(json.dumps(t), encoding="utf-8")
    out = tmp_path / "out"
    export(b, [{"id": "A" * 11, "festival": "chubut"}], out, recon=recon)
    seg = [x for _, x in json.loads((out / ("A" * 11 + ".json")).read_text())["seg"]]
    assert seg[0] == "Invitamos al presidente del Círculo Bárdico del Chubut."
    assert "Várdico" in seg[1] and seg[2] == "Várdico, canta el coro"  # Welsh-model line and lyric untouched
    # Welsh that Spanish recognition wrote, whichever language the line reads as
    assert seg[3] == "Mae'r gerdd hon yn hyfryd iawn, wrth gwrs." and seg[4] == "Dyma ganu telenegol a swinol"


@pytest.mark.parametrize("heard, right", [
    ("aquí viene el Benedicto el jurado", "aquí viene el veredicto el jurado"),
    ("Benedicto de la competencia número 88", "Veredicto de la competencia número 88"),
    ("El benedicto dice lo siguiente", "El veredicto dice lo siguiente"),
    ("saludamos a Benedicto Jones", "saludamos a Benedicto Jones"),  # a person stays
    ("fotografía categoría nobeles tema mundo vegetal", "fotografía categoría noveles tema mundo vegetal"),
    ("los premios Nobeles de la paz", "los premios Nobeles de la paz"),
    ("los músicos Cintia Samarreño y Silvia Valdor", "los músicos Cinthia Zamarreño y Silvia Baldor"),
    ("el director Frank Valdor", "el director Frank Valdor"),
    ("segundo premio para Herr Cidriol,", "segundo premio para Her Siriol,"),
    ("el grupo de Madryn, Her Ciriol.", "el grupo de Madryn, Her Siriol."),
    ("el segundo coro fue locus amenus aquí", "el segundo coro fue Locus Amoenus aquí"),
    ("muchísimas grasias a la Associación San David", "muchísimas gracias a la Asociación San David"),
])
def test_term_fixes_in_context(heard, right, monkeypatch):
    monkeypatch.setitem(export_module.TERM_FIXES, "cintia", ("Cinthia", True))  # only for this test
    assert export_module.fix_terms(heard) == right


def _corrections_setup(tmp_path, rows, seg=None, fuentes=None, lang="es"):
    b = tmp_path / "backup"
    _video(b, "C/2021/a_AAAAAAAAAAA.mp4", {"es-orig": YT_AUTO})
    _video(b, "C/2021/b_BBBBBBBBBBB.mp4", {"es-orig": YT_AUTO})
    (b / "INDEX.tsv").write_text("id\tfile\n" + f"{'A' * 11}\tC/2021/a_AAAAAAAAAAA.mp4\n{'B' * 11}\tC/2021/b_BBBBBBBBBBB.mp4\n", encoding="utf-8")
    recon = tmp_path / "recon"
    recon.mkdir()
    seg = seg or [[0, "Buenas noches a todos, bienvenidos a la última sesión."], [30, "Gracias por venir esta noche a todos ustedes."]]
    t = {"src": "reconstruida", "lang": lang, "fuentes": fuentes or [["yt_es"], ["yt_es"]], "seg": seg}
    for v in "AB":
        (recon / f"{v * 11}.json").write_text(json.dumps(t), encoding="utf-8")
    approved = tmp_path / "contributions.json"
    approved.write_text(json.dumps(rows), encoding="utf-8")
    vids = [{"id": "A" * 11, "festival": "chubut"}, {"id": "B" * 11, "festival": "chubut"}]
    return b, vids, recon, approved


def _row(id, cambios, vid="A" * 11, type="video_text", at="2026-11-22T10:00:00+00:00"):
    return {"id": id, "type": type, "reviewed_at": at, "display_name": "x", "payload": {"video": {"id": vid}, "cambios": cambios}}


def _read(out, v):
    return json.loads((out / (v * 11 + ".json")).read_text())


def test_export_applies_approved_video_corrections(tmp_path):
    rows = [_row("r1", [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Gracias por venir esta noche."}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    out = tmp_path / "out"
    r = export(b, vids, out, recon=recon, approved=approved)
    a = _read(out, "A")
    assert a["seg"][1][1] == "Gracias por venir esta noche."
    assert "colab" in a["fuentes"][1] and a["correcciones"] == ["r1"] and "exportado" in a
    assert r["sin_anclar"] == 0 and "sin_anclar" not in a
    assert "correcciones" not in _read(out, "B")  # pending/other videos untouched


def test_export_keeps_a_correction_language(tmp_path):
    rows = [_row("r1", [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Diolch yn fawr iawn i chi", "idioma": "cy"}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    out = tmp_path / "out"
    export(b, vids, out, recon=recon, approved=approved)
    a = _read(out, "A")
    assert a["idiomas"][1] == "cy"


def test_export_reports_unanchored_corrections(tmp_path, capsys):
    rows = [_row("r1", [{"t": 500, "antes": "Nada de esto", "texto": "Otra cosa"}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    out = tmp_path / "out"
    r = export(b, vids, out, recon=recon, approved=approved)
    a = _read(out, "A")
    assert r["sin_anclar"] == 1
    assert a["sin_anclar"] == [{"id": "r1", "t": 500, "antes": "Nada de esto", "motivo": "sin_linea"}]
    assert "correcciones" not in a and a["seg"][1][1].startswith("Gracias")
    assert f"sin anclar {'A' * 11} 500 «Nada de esto» (contribución r1)" in capsys.readouterr().out


def test_export_ignores_pending_and_other_videos(tmp_path):
    ch = [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Otra"}]
    rows = [_row("r1", ch, type="video_lyrics"), _row("r2", ch, vid="Z" * 11)]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    out = tmp_path / "out"
    export(b, vids, out, recon=recon, approved=approved)
    assert _read(out, "A")["seg"][1][1].startswith("Gracias")
    export(b, vids, out, recon=recon, approved=tmp_path / "missing.json")  # no file: no corrections


def test_export_leaves_an_unchanged_file_alone(tmp_path):
    rows = [_row("r1", [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Gracias."}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    out = tmp_path / "out"
    export(b, vids, out, recon=recon, approved=approved)
    p = out / ("A" * 11 + ".json")
    first = p.read_text()
    export(b, vids, out, recon=recon, approved=approved)
    assert p.read_text() == first


def test_export_keeps_a_correction_language_equal_to_the_default(tmp_path):
    # The file's language is es, so "es" is the line's default; the corrected text reads Welsh to the recomputation
    # (line_language would say cy). The collaborator's "es" must still win, whatever main_language and the rule say.
    seg = [[0, "Buenas noches a todos, bienvenidos a la última sesión de hoy."], [30, "Una frase corta."]]
    rows = [_row("r1", [{"t": 30, "antes": "Una frase corta.", "texto": "Diolch yn fawr iawn i chi am ddod heddiw", "idioma": "es"}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows, seg=seg, fuentes=[["yt_es"], ["yt_es"]], lang="es")
    out = tmp_path / "out"
    export(b, vids, out, recon=recon, approved=approved)
    a = _read(out, "A")
    assert a["seg"][1][1].startswith("Diolch") and a["idiomas"] == ["es", "es"]


STALE = "merge main before exporting video corrections"


def _age(p, hours):
    t = time.time() - hours * 3600
    os.utime(p, (t, t))


def test_export_warns_when_the_approved_data_is_over_a_day_old(tmp_path, capsys):
    # A worktree with an old data/approved/ would bake corrections an admin withdrew since back into the files.
    rows = [_row("r1", [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Gracias por venir."}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    stamp = approved.parent / "stamp.json"
    stamp.write_text("{}", encoding="utf-8")
    _age(stamp, 50)
    export(b, vids, tmp_path / "out", recon=recon, approved=approved)
    assert f"data/approved is 50 h old: {STALE}" in capsys.readouterr().out
    _age(stamp, 3)  # merged main: fresh
    export(b, vids, tmp_path / "out", recon=recon, approved=approved)
    assert STALE not in capsys.readouterr().out


def test_export_reads_the_contributions_file_age_when_there_is_no_stamp(tmp_path, capsys):
    rows = [_row("r1", [{"t": 30, "antes": "Gracias por venir esta noche a todos ustedes.", "texto": "Gracias por venir."}])]
    b, vids, recon, approved = _corrections_setup(tmp_path, rows)
    export(b, vids, tmp_path / "out", recon=recon, approved=approved)
    assert STALE not in capsys.readouterr().out
    _age(approved, 30)
    export(b, vids, tmp_path / "out", recon=recon, approved=approved)
    assert f"data/approved is 30 h old: {STALE}" in capsys.readouterr().out
    export(b, vids, tmp_path / "out", recon=recon, approved=tmp_path / "missing.json")  # no data at all: nothing to say
    assert STALE not in capsys.readouterr().out
