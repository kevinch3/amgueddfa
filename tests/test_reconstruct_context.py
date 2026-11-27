import json

from scripts.reconstruct.context import programa_lines, tokens, video_context

PROGRAMA = """---
items: aaaaaaaaaaaa
---
## Música · Cerddoriaeth
74. Principal, coro mixto: «O bone Jesu», Fernando Moruja.
75. Segunda competencia principal, coro mixto: a) «Rosa Amarela», Heitor Villalobos.
## Recitación
29. Para voz masculina: «El Pueblo», de Pablo Neruda.
"""


def _repo(tmp_path):
    (tmp_path / "src/data/transcripciones").mkdir(parents=True)
    (tmp_path / "data/approved").mkdir(parents=True)
    (tmp_path / "src/data/catalog.json").write_text(json.dumps({"items": [
        {"id": "aaaaaaaaaaaa", "coleccion": "chubut", "fecha": {"year": 2025, "inferred": False, "undated": False}, "tipo": "programa"}]}), encoding="utf-8")
    (tmp_path / "src/data/transcripciones/aaaaaaaaaaaa.md").write_text(PROGRAMA, encoding="utf-8")
    (tmp_path / "data/approved/contributions.json").write_text(json.dumps([
        {"type": "fact", "status": "approved", "coleccion": "chubut", "year": 2025, "payload": {"field": "venue", "value": "Gimnasio Municipal N.º 1, Trelew"}},
        {"type": "fact", "status": "approved", "coleccion": "chubut", "year": 2024, "payload": {"field": "venue", "value": "Otro lugar"}},
        {"type": "memory", "status": "approved", "coleccion": "chubut", "year": 2025, "payload": {"text": "un recuerdo privado"}},
    ]), encoding="utf-8")
    return tmp_path


def test_programa_lines_keeps_every_numbered_competition(tmp_path):
    lines = programa_lines(_repo(tmp_path), "chubut", 2025)
    assert sorted(lines) == [29, 74, 75]


def test_context_names_the_competition_and_edition_facts(tmp_path):
    repo = _repo(tmp_path)
    video = {"id": "vid", "coleccion": "chubut", "fecha": {"year": 2025, "inferred": False, "undated": False}, "title": "Eisteddfod del Chubut 2025, día sábado. Competencia Nº 75, segunda competencia"}
    ctx = video_context(repo, video, 0, 60)
    assert "Rosa Amarela" in ctx.text and "Gimnasio Municipal" in ctx.text
    assert "O bone Jesu" not in ctx.text and "Otro lugar" not in ctx.text and "recuerdo" not in ctx.text
    assert {"rosa", "amarela", "villalobos", "gimnasio", "eisteddfod"} <= ctx.words


def test_context_follows_session_chapters(tmp_path):
    repo = _repo(tmp_path)
    (repo / "public/marcadores-video").mkdir(parents=True)
    (repo / "public/marcadores-video/ses.json").write_text(json.dumps({"markers": [[100, "74", "x", "comp"], [900, "75", "y", "comp"]]}), encoding="utf-8")
    video = {"id": "ses", "coleccion": "chubut", "fecha": {"year": 2025, "inferred": False, "undated": False}, "title": "Eisteddfod del chubut 2025"}
    assert "O bone Jesu" in video_context(repo, video, 300, 360).text
    assert "Rosa Amarela" in video_context(repo, video, 880, 940).text


def test_tokens_fold_accents_case_and_punctuation():
    assert tokens("¡Gracias, TRELEW! Gŵyl Eisteddfod's") == ["gracias", "trelew", "gwyl", "eisteddfod's"]


def test_word_list_has_fact_values_not_field_labels(tmp_path):
    repo = _repo(tmp_path)
    video = {"id": "vid", "coleccion": "chubut", "fecha": {"year": 2025, "inferred": False, "undated": False}, "title": "Competencia Nº 75"}
    ctx = video_context(repo, video, 0, 60)
    assert {"gimnasio", "municipal"} <= ctx.words
    assert "venue" not in ctx.words and "ganador" not in ctx.words


def test_share_of_words_counts_repeats():
    from scripts.reconstruct.context import SAME_WORDS, share_of_words
    assert SAME_WORDS == 0.6
    assert share_of_words(["diolch", "yn", "fawr"], ["diolch", "en", "fawr", "iawn"]) == 2 / 3
    assert share_of_words(["hola", "hola"], ["hola"]) == 0.5
    assert share_of_words([], ["hola"]) == 0.0
