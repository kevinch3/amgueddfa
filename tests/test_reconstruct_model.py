import json
import subprocess
from subprocess import CompletedProcess

import pytest

from scripts.reconstruct.context import Context
from scripts.reconstruct.model import CLAUDE_ARGV, ModelError, ask, window_prompt
from scripts.reconstruct.sources import Line
from scripts.reconstruct.windows import Window

WINDOW = Window(0.0, 60.0, (Line(3.4, "bienvenidos al Stedbot de Trelew", "yt_es", "es"),),
                Context("Eisteddfod del Chubut 2025.", frozenset({"eisteddfod", "trelew"})), "h")


def fake(stdout, code=0):
    return lambda argv, cwd: CompletedProcess(argv, code, stdout=stdout, stderr="")


def test_ask_reads_structured_output_from_last_result_event():
    out = json.dumps([{"type": "system", "subtype": "init"},
                      {"type": "result", "is_error": False, "structured_output": {"lines": []}}])
    assert ask(WINDOW, run=fake(out)) == {"lines": []}


@pytest.mark.parametrize("stdout,code", [
    ("", 1),
    (json.dumps([{"type": "result", "is_error": True}]), 0),
    (json.dumps([{"type": "result", "is_error": False}]), 0),
    ("not json", 0),
])
def test_ask_raises_model_error(stdout, code):
    with pytest.raises(ModelError):
        ask(WINDOW, run=fake(stdout, code))


def test_timeout_is_a_model_error():
    def slow(argv, cwd):
        raise subprocess.TimeoutExpired(argv, 1)
    with pytest.raises(ModelError):
        ask(WINDOW, run=slow)


def test_argv_never_uses_bare_and_disables_tools_and_mcp():
    assert "--bare" not in CLAUDE_ARGV
    assert CLAUDE_ARGV[CLAUDE_ARGV.index("--tools") + 1] == ""
    assert "--strict-mcp-config" in CLAUDE_ARGV
    assert CLAUDE_ARGV[CLAUDE_ARGV.index("--model") + 1] == "claude-sonnet-5-5"


def test_prompt_carries_lines_context_and_word_list():
    p = window_prompt(WINDOW)
    assert "[3.4] (yt_es, es) bienvenidos al Stedbot de Trelew" in p
    assert "Eisteddfod del Chubut 2025." in p and "Eisteddfod, Trelew" in p.split("WORD LIST:")[1]


def test_word_list_keeps_accents_and_capitals_of_the_context():
    w = WINDOW._replace(context=Context("Competencia 32: «Sueño Alfarero», de Julia Ibarbourou.\nvenue: Gimnasio Municipal, Trelew",
                                        frozenset({"sueno", "alfarero", "ibarbourou", "gimnasio", "trelew", "eisteddfod"})))
    words = window_prompt(w).split("WORD LIST:\n")[1]
    assert "Sueño" in words and "Ibarbourou" in words and "Gimnasio" in words and "Eisteddfod" in words
    assert "sueno" not in words


def test_prompt_shows_welsh_confidence():
    w = WINDOW._replace(lines=(Line(404.0, "Yn yr ail dosbarth rhoddaf", "cy", "cy", 0.83),))
    assert "[404] (cy, cy, conf 0.83) Yn yr ail dosbarth rhoddaf" in window_prompt(w)


def test_prompt_marks_an_alternative_and_says_to_publish_one():
    w = WINDOW._replace(lines=(Line(404.0, "croeso cynnes i bawb", "cy", "cy", 0.88),
                               Line(404.3, "croeso cynnes i bawb yna", "whisper_es", "es", None, 407.0, 404.0)))
    p = window_prompt(w)
    assert "[404.3] (whisper_es, es, alternative to 404) croeso cynnes i bawb yna" in p
    assert "never both" in p
    assert "never both" not in window_prompt(WINDOW)
