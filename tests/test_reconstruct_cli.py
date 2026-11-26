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


def test_a_video_with_only_a_lyric_span_is_reconstructed(tmp_path):
    # Clips with no automatic text at all (a choir, no speech) still show the lyrics the maintainer gave (#129).
    repo, backup, video = _setup(tmp_path)
    (repo / "public/transcripciones-video/vid.json").unlink()
    (backup / "videos/x/clip_vid.es-orig.vtt").unlink()
    (repo / "data/letras/himno.md").write_text("---\ntitulo: Himno\nidioma: la\n---\nAve verum corpus\nnatum de Maria\n\nVere passum\nimmolatum\n", encoding="utf-8")
    (repo / "data/letras/videos.json").write_text(json.dumps({"vid": [{"letra": "himno", "desde": 10, "hasta": 90}]}), encoding="utf-8")
    res = reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies")
    assert res is not None and [x for _, x in res["seg"]] == ["Ave verum corpus", "natum de Maria", "Vere passum", "immolatum"]
    assert all(f == ["letra"] for f in res["fuentes"]) and 10 <= res["seg"][0][0] < res["seg"][-1][0] < 90


def test_cli_marks_mezcla(tmp_path, monkeypatch):
    import scripts.reconstruct_videos as rv
    repo, backup, video = _setup(tmp_path)
    monkeypatch.setattr(rv, "has_mezcla", lambda stem: True)
    res = reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies")
    assert res["mezcla"] is True
    assert json.loads((repo / "data/reconstruccion/vid.json").read_text())["mezcla"] is True
    monkeypatch.setattr(rv, "has_mezcla", lambda stem: False)
    assert "mezcla" not in reconstruct_video(repo, backup, video, ask=echo_model([]), replies=tmp_path / "replies")


def test_rules_lines_know_a_mixed_video(tmp_path, monkeypatch):
    import scripts.reconstruct_videos as rv
    repo, backup, video = _setup(tmp_path)
    seen = []
    monkeypatch.setattr(rv, "rules_lines", lambda w, mezcla=False: seen.append(mezcla) or [])

    def liar(w):
        return {"lines": [{"t": w.t0 + 1, "lang": "es", "text": "no estaba", "src": ["yt_es"], "fixes": []}]}
    for flag in (True, False):
        monkeypatch.setattr(rv, "has_mezcla", lambda stem, flag=flag: flag)
        seen.clear()
        reconstruct_video(repo, backup, video, ask=liar, replies=tmp_path / f"replies{flag}")
        assert seen and set(seen) == {flag}


def test_replies_cached_under_the_legacy_key_are_reused(tmp_path):
    """Cached before facts were filtered per window: found by the old key, never asked again."""
    import hashlib
    from scripts.reconstruct.windows import PROMPT_VERSION
    repo, backup, video = _setup(tmp_path)
    (repo / "data/approved/contributions.json").write_text(json.dumps([{
        "type": "fact", "status": "approved", "festival": "chubut", "year": 2025,
        "payload": {"field": "presentadores", "value": "Persona Inventada"}}]), encoding="utf-8")
    calls = []
    first = reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    cache = tmp_path / "replies/vid"
    # Move every reply to the key the old code used (the whole context, the unheard fact included).
    from scripts.reconstruct.sources import load_sources
    from scripts.reconstruct.windows import make_windows
    from scripts.reconstruct.context import video_context
    from scripts.reconstruct_videos import _duration
    stem = backup / "videos/x/clip_vid"
    lines = load_sources(stem, "vid", repo / "data/letras")
    ws = make_windows(lines, _duration(stem, lines), lambda a, b: video_context(repo, video, a, b))
    assert all("Persona Inventada" not in w.context.text and w.legacy != w.hash for w in ws)
    for w in ws:
        p = cache / f"{w.hash}.json"
        if p.exists():
            p.rename(cache / f"{w.legacy}.json")
    n = len(calls)
    again = reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    assert len(calls) == n and again["seg"] == first["seg"]
    assert all((cache / f"{w.hash}.json").exists() for w in ws if (cache / f"{w.legacy}.json").exists())


def test_migrate_cache_copies_legacy_replies_without_asking(tmp_path):
    from scripts.reconstruct.context import Context
    from scripts.reconstruct.sources import Line
    from scripts.reconstruct.windows import make_windows
    from scripts.reconstruct_videos import migrate_cache
    ctx = Context("Eisteddfod del Chubut 2025.\npresentadores: Persona Inventada", frozenset({"eisteddfod"}))
    ws = make_windows([Line(5.0, "buenas noches", "yt_es", "es")], 60, lambda a, b: ctx, glossary=[])
    cache = tmp_path / "c"
    cache.mkdir()
    (cache / f"{ws[0].legacy}.json").write_text('{"lines": []}', encoding="utf-8")
    assert migrate_cache(ws, cache) == 1
    assert (cache / f"{ws[0].hash}.json").read_text(encoding="utf-8") == '{"lines": []}'
    assert migrate_cache(ws, cache) == 0


def test_migration_from_an_older_facts_revision(tmp_path):
    """A reply cached under an older revision's whole-context key is reused when the filtered context is the same."""
    from scripts.reconstruct.context import Context
    from scripts.reconstruct.sources import Line
    from scripts.reconstruct.windows import make_windows
    from scripts.reconstruct_videos import migrate_from
    ls = [Line(5.0, "buenas noches", "yt_es", "es")]
    old = make_windows(ls, 60, lambda a, b: Context("Eisteddfod del Chubut 2030.\nvenue: Lugar Viejo", frozenset()), glossary=[])
    new = make_windows(ls, 60, lambda a, b: Context("Eisteddfod del Chubut 2030.\nvenue: Lugar Nuevo", frozenset()), glossary=[])
    assert old[0].hash == new[0].hash and old[0].legacy != new[0].legacy
    cache = tmp_path / "c"
    cache.mkdir()
    (cache / f"{old[0].legacy}.json").write_text('{"lines": []}', encoding="utf-8")
    assert migrate_from(old, new, cache) == 1
    assert (cache / f"{new[0].hash}.json").exists()


def test_an_unreadable_cache_file_is_asked_again(tmp_path):
    repo, backup, video = _setup(tmp_path)
    calls = []
    reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    n = len(calls)
    broken = sorted((tmp_path / "replies/vid").glob("*.json"))[0]
    broken.write_text('{"lines": [', encoding="utf-8")
    reconstruct_video(repo, backup, video, ask=echo_model(calls), replies=tmp_path / "replies")
    assert len(calls) == n + 1 and json.loads(broken.read_text(encoding="utf-8"))["lines"] is not None
