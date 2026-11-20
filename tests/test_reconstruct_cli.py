import json

import pytest

from scripts.reconstruct.model import ModelError
from scripts.reconstruct_videos import TooManyErrors, reconstruct_video

VTT = "WEBVTT\nKind: captions\nLanguage: es\n\n" + "".join(
    f"00:{m:02d}:{s:02d}.000 --> 00:{m:02d}:{s + 2:02d}.000 align:start position:0%\nbienvenidos al Stedbot de Trelew {m}{s}\n\n"
    for m in range(0, 3) for s in range(0, 60, 10))


def _setup(tmp_path, festival="chubut"):
    repo, backup = tmp_path / "repo", tmp_path / "backup"
    for d in ("src/data/transcripciones", "data/approved", "data/letras", "public/transcripciones-video"):
        (repo / d).mkdir(parents=True)
    (repo / "src/data/catalog.json").write_text('{"items": []}', encoding="utf-8")
    (repo / "data/approved/contributions.json").write_text("[]", encoding="utf-8")
    (repo / "public/transcripciones-video/vid.json").write_text("{}", encoding="utf-8")
    (backup / "videos/x").mkdir(parents=True)
    (backup / "INDEX.tsv").write_text("id\tfile\nvid\tx/clip_vid.mp4\n", encoding="utf-8")
    (backup / "videos/x/clip_vid.es-orig.vtt").write_text(VTT, encoding="utf-8")
    (backup / "videos/x/clip_vid.info.json").write_text('{"duration": 180}', encoding="utf-8")
    video = {"id": "vid", "festival": festival, "year": "2025", "title": "Competencia Nº 5"}
    return repo, backup, video


def echo_model(calls):
    def ask(w):
        calls.append(w.hash)
        return {"lines": [{"t": l.t, "lang": "es", "text": l.text, "src": [l.src], "fixes": []}
                          for l in w.lines if w.t0 <= l.t < w.t1], "_usd": 0.01}
    return ask


def test_rerun_with_same_inputs_makes_no_model_calls(tmp_path):
    repo, backup, video = _setup(tmp_path)
    calls = []
    first = reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    out = repo / "data/reconstruccion/vid.json"
    before = out.read_bytes()
    assert first["src"] == "reconstruida" and len(first["seg"]) == len(first["fuentes"]) == 18
    n = len(calls)
    assert n == first["ventanas"]["modelo"] > 0
    reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    assert len(calls) == n and out.read_bytes() == before


def test_failed_window_uses_rules_and_is_counted(tmp_path):
    repo, backup, video = _setup(tmp_path)
    calls = []
    good = echo_model(calls)

    def flaky(w):
        if not calls:
            calls.append("x")
            raise ModelError("boom")
        return good(w)
    res = reconstruct_video(repo, backup, video, ask=flaky, replies=tmp_path / "replies")
    assert res["ventanas"]["reglas"] == 1 and len(res["seg"]) == 18


def test_checker_failure_uses_rules(tmp_path):
    repo, backup, video = _setup(tmp_path)

    def liar(w):
        return {"lines": [{"t": w.t0 + 1, "lang": "es", "text": "ganador absoluto", "src": ["yt_es"], "fixes": []}]}
    res = reconstruct_video(repo, backup, video, ask=liar, replies=tmp_path / "replies")
    assert res["ventanas"]["reglas"] == res["ventanas"]["total"]
    assert not any("ganador" in t for _, t in res["seg"])


def test_three_model_errors_in_a_row_stop_the_run(tmp_path):
    repo, backup, video = _setup(tmp_path)

    def down(w):
        raise ModelError("usage limit")
    with pytest.raises(TooManyErrors):
        reconstruct_video(repo, backup, video, ask=down, replies=tmp_path / "replies")
    assert not (repo / "data/reconstruccion/vid.json").exists()


def test_juventud_video_is_never_reconstructed(tmp_path):
    repo, backup, video = _setup(tmp_path, festival="juventud")
    assert reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies") is None
    assert not (repo / "data/reconstruccion").exists()
