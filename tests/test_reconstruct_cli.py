import json
import threading
import time

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


@pytest.mark.parametrize("jobs", [1, 2])
def test_three_model_errors_in_a_row_stop_the_run(tmp_path, jobs):
    repo, backup, video = _setup(tmp_path)

    def down(w):
        raise ModelError("usage limit")
    with pytest.raises(TooManyErrors):
        reconstruct_video(repo, backup, video, ask=down, replies=tmp_path / "replies", jobs=jobs)
    assert not (repo / "data/reconstruccion/vid.json").exists()


def test_juventud_video_is_never_reconstructed(tmp_path):
    repo, backup, video = _setup(tmp_path, festival="juventud")
    assert reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies") is None
    assert not (repo / "data/reconstruccion").exists()


def test_music_only_and_empty_results_publish_nothing(tmp_path):
    repo, backup, video = _setup(tmp_path)
    (backup / "videos/x/clip_vid.es-orig.vtt").write_text(
        "WEBVTT\nKind: captions\nLanguage: es\n\n00:00:01.000 --> 00:00:03.000 align:start position:0%\n[Música]\n\n"
        "00:01:30.000 --> 00:01:32.000 align:start position:0%\n[Aplausos]\n", encoding="utf-8")
    dest = repo / "data/reconstruccion/vid.json"
    dest.parent.mkdir(parents=True)
    dest.write_text("{}", encoding="utf-8")  # an older reconstruction
    res = reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies")
    assert res["seg"] == [] and res["ventanas"]["vacias"] == res["ventanas"]["total"]
    assert not dest.exists()  # empty: no file, the export keeps today's transcript


def test_rules_lines_get_the_eisteddfod_spelling_fix(tmp_path):
    repo, backup, video = _setup(tmp_path)
    calls = []
    good = echo_model(calls)
    state = {"n": 0}

    def flaky(w):
        state["n"] += 1
        if state["n"] == 1:
            raise ModelError("boom")
        return good(w)
    res = reconstruct_video(repo, backup, video, ask=flaky, replies=tmp_path / "replies",
                            fix_text=lambda s: s.replace("Stedbot", "Eisteddfod"))
    first_window = [x for t, x in res["seg"] if t < 60]
    assert first_window and all("Stedbot" not in x for x in first_window)


def test_welsh_only_video_is_reconstructed_and_marked_welsh(tmp_path):
    repo, backup, video = _setup(tmp_path)
    (repo / "public/transcripciones-video/vid.json").unlink()  # nothing published today
    (backup / "videos/x/clip_vid.es-orig.vtt").unlink()
    (backup / "videos/x/clip_vid.cy-techiaith.json").write_text(json.dumps({"segments": [
        {"s": float(s), "text": f"Croeso i bawb heddiw {s}"} for s in range(0, 180, 10)]}), encoding="utf-8")
    res = reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies")
    assert res is not None and res["lang"] == "cy" and len(res["seg"]) == 18
    assert all(f == ["cy"] for f in res["fuentes"])


def test_jobs_ask_several_windows_at_once_and_give_the_same_text(tmp_path):
    repo, backup, video = _setup(tmp_path)
    serial = reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "one")
    calls, live, peak, lock = [], [0], [0], threading.Lock()
    echo = echo_model(calls)

    def slow(w):
        with lock:
            live[0] += 1
            peak[0] = max(peak[0], live[0])
        time.sleep(0.05)
        with lock:
            live[0] -= 1
        return echo(w)
    together = reconstruct_video(repo, backup, video, ask=slow, replies=tmp_path / "many", jobs=3)
    assert together == serial and peak[0] > 1
    assert sorted(calls) == sorted(p.stem for p in (tmp_path / "many/vid").iterdir())


def test_cached_windows_between_failures_do_not_hide_a_usage_limit(tmp_path):
    repo, backup, video = _setup(tmp_path)
    (backup / "videos/x/clip_vid.info.json").write_text('{"duration": 420}', encoding="utf-8")
    (backup / "videos/x/clip_vid.es-orig.vtt").write_text("WEBVTT\nKind: captions\nLanguage: es\n\n" + "".join(
        f"00:{m:02d}:{s:02d}.000 --> 00:{m:02d}:{s + 2:02d}.000 align:start position:0%\nbienvenidos a Trelew {m}{s}\n\n"
        for m in range(0, 7) for s in range(0, 60, 10)), encoding="utf-8")
    first = []
    reconstruct_video(repo, backup, video, ask=echo_model(first), replies=tmp_path / "replies")
    for h in first[1::2]:  # every other window loses its cached reply
        (tmp_path / f"replies/vid/{h}.json").unlink()

    def down(w):
        raise ModelError("usage limit")
    with pytest.raises(TooManyErrors):
        reconstruct_video(repo, backup, video, ask=down, replies=tmp_path / "replies")
