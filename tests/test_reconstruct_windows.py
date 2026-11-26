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


def test_glossary_hint_only_in_windows_with_the_misheard_word(tmp_path):
    from scripts.reconstruct import context as ctxmod
    g = tmp_path / "glosario.md"
    g.write_text("# comment\ndewenllys → Tehuelches\n", encoding="utf-8")
    ls = [Line(10.0, "un o'r Dewenllys ac yn", "cy", "cy"), Line(100.0, "Diolch yn fawr", "cy", "cy")]
    ws = make_windows(ls, 130, lambda a, b: CTX, glossary=ctxmod.load_glossary(g))
    assert "dewenllys → Tehuelches" in ws[0].context.text and "tehuelches" in ws[0].context.words
    assert "Tehuelches" not in ws[1].context.text and ws[1].context == CTX


def test_hash_ignores_line_ends_and_matches_the_five_field_form():
    # Line gained an end ("e"): hashing whole tuples would change every cached window. The model never sees e.
    import hashlib
    import json

    from scripts.reconstruct.windows import PROMPT_VERSION
    ls = lines_every(3, 200)
    for w in make_windows(ls, 200, lambda x, y: CTX):
        key = json.dumps([w.t0, w.t1, [[l.t, l.text, l.src, l.lang, l.conf] for l in w.lines], w.context.text,
                          PROMPT_VERSION], ensure_ascii=False, sort_keys=True)
        assert w.hash == hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    with_ends = [l._replace(e=l.t + 2.0) for l in ls]
    assert [w.hash for w in make_windows(with_ends, 200, lambda x, y: CTX)] == \
        [w.hash for w in make_windows(ls, 200, lambda x, y: CTX)]


def test_an_alternative_changes_only_its_own_window():
    ls = lines_every(3, 200)
    plain = make_windows(ls, 200, lambda x, y: CTX)
    alt = make_windows(ls + [Line(100.5, "hola a todos 99", "whisper_es", "es", None, None, 99.0)], 200, lambda x, y: CTX)
    changed = [a.t0 for a, b in zip(plain, alt) if a.hash != b.hash]
    assert changed and all(w.t0 - 5 <= 100.5 < w.t1 + 5 for w in alt if w.t0 in changed)
    assert len(changed) < len(plain)


# Facts enter a window only when something heard there sounds like them (re-asks stay local).
FULL = Context("Eisteddfod del Chubut 2024.\npresentadores: Gabriel Restucha\nvenue: Salón San David, Trelew",
               frozenset({"eisteddfod", "chubut", "gabriel", "restucha", "salon", "san", "david", "trelew"}))


def test_a_fact_enters_only_windows_that_hear_it():
    ls = [Line(5.0, "buenas noches a todos", "yt_es", "es"), Line(70.0, "dejo la conducción a gabriel res tucha", "yt_es", "es")]
    ws = make_windows(ls, 120, lambda a, b: FULL, glossary=[])
    assert "Restucha" not in ws[0].context.text and "restucha" not in ws[0].context.words
    assert "presentadores: Gabriel Restucha" in ws[1].context.text and "restucha" in ws[1].context.words
    assert all("Eisteddfod del Chubut 2024." in w.context.text for w in ws)


def test_a_new_fact_rehashes_only_the_windows_that_hear_it():
    ls = [Line(5.0, "buenas noches a todos", "yt_es", "es"), Line(70.0, "la profesora marley piu del circulo", "yt_es", "es")]
    before = make_windows(ls, 120, lambda a, b: FULL, glossary=[])
    more = FULL._replace(text=FULL.text + "\nganador_corona: Marli Pugh")
    after = make_windows(ls, 120, lambda a, b: more, glossary=[])
    assert before[0].hash == after[0].hash
    assert before[1].hash != after[1].hash


def test_legacy_hash_is_the_old_whole_context_hash():
    """Replies cached before facts were filtered stay usable: their key is the old formula."""
    import hashlib, json
    from scripts.reconstruct.windows import PROMPT_VERSION
    ls = [Line(5.0, "buenas noches a todos", "yt_es", "es")]
    (w,) = make_windows(ls, 60, lambda a, b: FULL, glossary=[])
    seen = [[l.t, l.text, l.src, l.lang, l.conf] for l in w.lines]
    old = hashlib.sha256(json.dumps([0.0, 60.0, seen, FULL.text, PROMPT_VERSION], ensure_ascii=False,
                                    sort_keys=True).encode("utf-8")).hexdigest()[:16]
    assert w.legacy == old and w.hash != old
