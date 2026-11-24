import pytest
from pathlib import Path

from scripts.colab import make_notebook
from scripts.colab.pase_mezcla import done, mean_p, side, split_lines, write


def w(s, e, text, p=0.9):
    return [s, e, text, p]


def test_split_at_pause():
    words = [w(0, 0.5, "diolch"), w(0.5, 1.0, "yn"), w(1.7, 2.0, "fawr")]
    assert [len(x) for x in split_lines(words)] == [2, 1]


def test_short_gap_does_not_split():
    words = [w(0, 0.5, "diolch"), w(1.05, 1.5, "yn")]
    assert len(split_lines(words)) == 1


def test_split_after_sentence_end():
    words = [w(0, 0.5, "fawr."), w(0.5, 1.0, "Felicitaciones")]
    assert [[x[2] for x in ln] for ln in split_lines(words)] == [["fawr."], ["Felicitaciones"]]


def test_split_at_14_words():
    words = [w(i * 0.3, i * 0.3 + 0.2, f"w{i}") for i in range(30)]
    assert [len(x) for x in split_lines(words)] == [14, 14, 2]


def test_mean_p_empty():
    assert mean_p([]) == 0.0
    assert mean_p([w(0, 1, "a", 0.5), w(1, 2, "b", 1.0)]) == 0.75


def test_write_is_atomic_and_done_needs_all_three(tmp_path):
    for k in ("words", "es-lines"):
        write(tmp_path / f"v.{k}.json", {"ok": 1})
    assert not done(tmp_path, "v")
    write(tmp_path / "v.es-words.json", {"ok": 1})
    assert done(tmp_path, "v")
    assert not list(tmp_path.glob("*.part"))


def test_notebook_is_built_from_the_module():
    nb = Path(make_notebook.__file__).with_name("pase_mezcla.ipynb").read_text(encoding="utf-8")
    assert nb == make_notebook.build(), "run python3 scripts/colab/make_notebook.py"


def test_match_words_by_time_not_position():
    from scripts.colab.pase_mezcla import match_words
    a = [w(0, 1, "extra"), w(1, 2, "Diolch"), w(2, 3, "fawr.")]
    b = [w(1.1, 2, "diolch"), w(2.0, 3, "fawr")]
    assert match_words(a, b) == [0.0, pytest.approx(0.1)]
    assert match_words(a, [w(5, 6, "diolch")]) == []


def test_gpu_name_without_nvidia_smi(monkeypatch):
    import shutil
    from scripts.colab import pase_mezcla
    monkeypatch.setattr(shutil, "which", lambda *_a, **_k: None)
    assert pase_mezcla.gpu_name() == "unknown"


def test_side_counts_a_gap_of_exactly_clear():
    assert side({"cy_p": 0.912, "es_p": 0.812, "es_words": [w(0, 1, "hola")]}) == "cy"
    assert side({"cy_p": 0.812, "es_p": 0.912, "es_words": [w(0, 1, "hola")]}) == "es"
    assert side({"cy_p": 0.85, "es_p": 0.8, "es_words": [w(0, 1, "hola")]}) == "mixed"
