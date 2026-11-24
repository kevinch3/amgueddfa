from scripts.reconstruct.mezcla import CLEAR, JOIN_GAP, MIN_RUN, decide


def words(text, start, p, step=0.5):
    return [[round(start + i * step, 2), round(start + i * step + 0.4, 2), w, p] for i, w in enumerate(text.split())]


def row(cy_words, es_words):
    mean = lambda ws: round(sum(w[3] for w in ws) / len(ws), 3) if ws else 0.0
    return {"s": cy_words[0][0], "e": cy_words[-1][1], "cy": " ".join(w[2] for w in cy_words), "cy_p": mean(cy_words),
            "cy_words": cy_words, "es": " ".join(w[2] for w in es_words), "es_p": mean(es_words), "es_words": es_words}


def test_constants():
    assert (CLEAR, MIN_RUN, JOIN_GAP) == (0.10, 3, 1.0)


def test_clear_welsh_line_is_bangor_whole():
    r = row(words("diolch yn fawr iawn", 10.0, 0.90), words("dios jen four", 10.0, 0.50))
    out = decide([r], {10.0: 0.8})
    assert len(out) == 1
    ln = out[0]
    assert (ln.src, ln.lang, ln.text, ln.t, ln.e, ln.conf) == ("cy", "cy", "diolch yn fawr iawn", r["s"], r["e"], 0.8)


def test_clear_spanish_line_is_turbo_whole():
    r = row(words("bwenas tardes a todos", 5.0, 0.78), words("buenas tardes a todos", 5.1, 0.92))
    out = decide([r], {5.0: 0.7})
    assert len(out) == 1
    ln = out[0]
    assert (ln.src, ln.lang, ln.text, ln.conf) == ("whisper_es", "es", "buenas tardes a todos", None)
    assert (ln.t, ln.e) == (5.1, r["es_words"][-1][1])


def test_close_line_splits_word_by_word():
    cy = words("diolch yn fawr iawn", 0.0, 0.95) + words("bwenas tardes a todos ystod", 2.0, 0.4)
    es = words("dios jen four ian", 0.0, 0.4) + words("buenas tardes a todos hoy", 2.05, 0.95)
    r = row(cy, es)
    assert abs(r["cy_p"] - r["es_p"]) < CLEAR
    out = decide([r], {0.0: 0.9})
    assert [(ln.src, ln.lang) for ln in out] == [("cy", "cy"), ("whisper_es", "es")]
    assert out[0].text == "diolch yn fawr iawn"
    assert (out[0].t, out[0].e, out[0].conf) == (0.0, cy[3][1], 0.9)
    assert out[1].text == "buenas tardes a todos hoy"
    assert (out[1].t, out[1].e, out[1].conf) == (2.05, es[-1][1], None)


def test_short_run_takes_neighbours_language():
    labels = "cy cy cy es es cy cy cy".split()
    cy = [[i * 0.5, i * 0.5 + 0.4, f"gair{i}", 0.9 if lab == "cy" else 0.3] for i, lab in enumerate(labels)]
    es = [[i * 0.5, i * 0.5 + 0.4, f"palabra{i}", 0.3 if lab == "cy" else 0.9] for i, lab in enumerate(labels)]
    r = row(cy, es)
    r["cy_p"] = r["es_p"] = 0.6
    out = decide([r], {0.0: 0.9})
    assert len(out) == 1
    assert (out[0].src, out[0].text) == ("cy", " ".join(w[2] for w in cy))


def test_stock_phrase_cannot_win():
    r = row(words("diolch yn fawr i chi", 3.0, 0.70), words("gracias por ver el video", 3.0, 0.95))
    out = decide([r], {3.0: 0.8})
    assert [(ln.src, ln.text) for ln in out] == [("cy", "diolch yn fawr i chi")]


def test_loop_cannot_win():
    r = row(words("diolch yn fawr i chi", 3.0, 0.70), words("hola hola hola hola", 3.0, 0.95))
    out = decide([r], {3.0: 0.8})
    assert [(ln.src, ln.text) for ln in out] == [("cy", "diolch yn fawr i chi")]


def test_empty_turbo_is_welsh():
    r = row(words("diolch yn fawr", 1.0, 0.5), [])
    out = decide([r], {1.0: 0.7})
    assert [(ln.src, ln.lang, ln.text) for ln in out] == [("cy", "cy", "diolch yn fawr")]


def test_es_run_without_turbo_words_is_welsh():
    cy = words("diolch yn fawr iawn", 0.0, 0.95) + words("bore da i bawb", 2.0, 0.4)
    # one long turbo word over the whole second run, but starting just before it
    es = words("dios jen four ian", 0.0, 0.4) + [[1.95, 4.0, "buenas", 0.95]]
    r = row(cy, es)
    r["cy_p"] = r["es_p"] = 0.6
    out = decide([r], {0.0: 0.9})
    assert [(ln.src, ln.text) for ln in out] == [("cy", "diolch yn fawr iawn bore da i bawb")]


def test_repeat_at_cut_is_joined():
    a = row(words("estod gair", 0.0, 0.5), words("ahora el número", 0.0, 0.95))
    b = row(words("nymero dau", 1.8, 0.5), words("número doce", 2.0, 0.95))
    out = decide([a, b], {0.0: 0.7, 1.8: 0.7})
    assert len(out) == 1
    ln = out[0]
    assert (ln.src, ln.text, ln.t, ln.e) == ("whisper_es", "ahora el número doce", 0.0, b["es_words"][-1][1])


def test_no_join_without_repeat_or_when_far():
    a = row(words("estod gair", 0.0, 0.5), words("ahora el número", 0.0, 0.95))
    b = row(words("nymero dau", 1.8, 0.5), words("doce y trece", 2.0, 0.95))
    assert len(decide([a, b], {})) == 2
    c = row(words("nymero dau", 5.0, 0.5), words("número doce", 5.0, 0.95))
    assert len(decide([a, c], {})) == 2


def test_sorted_by_t():
    a = row(words("diolch yn fawr", 9.0, 0.9), [])
    b = row(words("bore da", 1.0, 0.9), [])
    assert [ln.t for ln in decide([a, b], {})] == [1.0, 9.0]
