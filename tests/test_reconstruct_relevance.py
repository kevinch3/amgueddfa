"""Which facts a window gets: only those a heard word may be a mishearing of (invented names)."""
import json

import pytest

from scripts.reconstruct.context import Context, relevant
from scripts.reconstruct.sources import Line

COMMON = frozenset({"tiene", "danza", "nancy", "buenas", "noches"})


def ctx(*facts):
    return Context("Eisteddfod del Chubut 2030.\n" + "\n".join(facts), frozenset({"eisteddfod"}))


def kept(fact, heard):
    return fact in relevant(ctx(fact), [Line(1.0, heard, "yt_es", "es")], COMMON).text


@pytest.mark.parametrize("fact,heard", [
    ("presentadores: Ana Zamorano", "la señora ana samorano"),            # s/z
    ("ganador_silla: Yesenia Ruiz", "ganó jesenia ruis"),                  # j/y
    ("ganador_corona: Clara Bordagrin", "a clara borda grin"),             # name split in two
    ("ganador_corona: Rita Bordagreen", "la poeta borddagryn"),            # one heard token, two-word surname joined
    ("presentadores: Nanci Ferro", "presenta nancy"),                      # a common word spelled nearly like the name
    ("venue: Salón Sáez, Trelew", "en el salón saez"),                     # heard right but without its accent
    ("ganador_silla: Kevin Cuello", "quevin cuello gana"),                 # c/k/q
])
def test_likely_mishearings_bring_the_fact(fact, heard):
    assert kept(fact, heard)


@pytest.mark.parametrize("fact,heard", [
    ("presentadores: Diana Prado", "ella tiene una danza"),                # real words near the name
    ("presentadores: Diana Prado", "buenas noches"),                       # nothing like it
    ("venue: Salón Sáez, Trelew", "en el salón Sáez"),                     # heard exactly right
])
def test_names_heard_right_or_not_at_all_leave_the_fact_out(fact, heard):
    assert not kept(fact, heard)


def test_missing_dictionary_stops_instead_of_changing_keys(monkeypatch, tmp_path):
    import importlib
    from scripts.reconstruct import context
    real = importlib.reload(context)  # the autouse fixture patched the old module object
    monkeypatch.setattr(real, "SPANISH_DICT", tmp_path / "none")
    real.load_common_words.cache_clear()
    with pytest.raises(SystemExit):
        real.load_common_words()
    real.load_common_words.cache_clear()


def test_common_words_come_from_the_frozen_file_not_the_live_corpus(monkeypatch, tmp_path):
    import importlib
    from scripts.reconstruct import context
    real = importlib.reload(context)
    d = tmp_path / "dict"
    d.write_text("casa\nperro\n", encoding="utf-8")
    f = tmp_path / "comunes.txt"
    f.write_text("# frozen\nhafan\nwedi\n", encoding="utf-8")
    monkeypatch.setattr(real, "SPANISH_DICT", d)
    monkeypatch.setattr(real, "COMMON_FILE", f)
    real.load_common_words.cache_clear()
    assert real.load_common_words() == frozenset({"casa", "perro", "hafan", "wedi"})
    real.load_common_words.cache_clear()
