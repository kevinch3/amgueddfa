from scripts.reconstruct.context import Context
from scripts.reconstruct.sources import Line
from scripts.reconstruct.windows import make_windows, needs_model

CTX = Context("Eisteddfod del Chubut 2025.", frozenset({"eisteddfod"}))


def lines_every(step, until, text="hola a todos"):
    return [Line(float(t), f"{text} {t}", "yt_es", "es") for t in range(0, until, step)]


def test_windows_cover_the_video_with_overlap():
    ws = make_windows(lines_every(3, 200), 200, lambda a, b: CTX)
    assert len(ws) == 4
    assert ws[0].t0 == 0 and ws[-1].t1 == 200
    assert all(a.t1 == b.t0 for a, b in zip(ws, ws[1:]))
    for a, b in zip(ws, ws[1:]):
        shared = set(a.lines) & set(b.lines)
        assert shared and all(b.t0 - 5 <= l.t < a.t1 + 5 for l in shared)


def test_cuts_fall_in_pauses():
    ls = [l for l in lines_every(2, 130) if not 55 < l.t < 66]  # silence 54..66
    ws = make_windows(ls, 130, lambda a, b: CTX)
    assert 54 < ws[0].t1 < 66


def test_hash_changes_only_with_inputs():
    ls = lines_every(3, 200)
    a = make_windows(ls, 200, lambda x, y: CTX)
    assert [w.hash for w in a] == [w.hash for w in make_windows(ls, 200, lambda x, y: CTX)]
    ls2 = [l._replace(text="otra cosa") if l.t == 150 else l for l in ls]
    b = make_windows(ls2, 200, lambda x, y: CTX)
    changed = [i for i, (x, y) in enumerate(zip(a, b)) if x.hash != y.hash]
    assert changed == [i for i, w in enumerate(a) if any(l.t == 150 for l in w.lines)]


def test_music_only_window_needs_no_model():
    ws = make_windows([Line(1.0, "[música]", "yt_es", "es"), Line(9.0, "[aplausos]", "yt_es", "es")], 30, lambda a, b: CTX)
    assert [needs_model(w) for w in ws] == [False]
