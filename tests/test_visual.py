from PIL import Image, ImageDraw

from scripts.visual import frames, ocr_frames, runs, vlm


def _img(shade, box=None):
    im = Image.new("RGB", (640, 360), (shade, shade, shade))
    if box:
        ImageDraw.Draw(im).rectangle(box, fill=(255, 255, 255))
    return im


# Picking frames
def test_pick_keeps_the_first_frame_and_drops_unchanged_ones():
    shots = [(0, _img(40)), (5, _img(41)), (10, _img(40)), (15, _img(200)), (20, _img(201))]
    assert frames.pick(shots) == [0, 15]


def test_pick_compares_with_the_last_kept_frame_so_a_slow_drift_is_caught():
    # Each step changes the picture a little; together they pass the threshold.
    shots = [(t, _img(40 + 4 * i)) for i, t in enumerate(range(0, 50, 5))]
    kept = frames.pick(shots)
    assert kept[0] == 0 and len(kept) >= 2 and kept == sorted(kept)
    assert frames.DIFF == 8.0 and frames.STEP == 5


def test_a_scene_cut_is_a_large_difference():
    assert frames.difference(_img(40), _img(220)) >= frames.CUT
    assert frames.difference(_img(40), _img(41)) < frames.DIFF


# Real words in OCR text
def test_texture_noise_is_not_text():
    assert ocr_frames.real_words("A y | — Y $ 4 ES e") == []
    assert not ocr_frames.has_text("A y | — Y $ 4 ES e")


def test_three_real_words_make_text():
    assert ocr_frames.has_text("buenas tardes a todos los presentes")
    assert not ocr_frames.has_text("buenas tardes")
    assert ocr_frames.real_words("Diolch, yn fawr iawn: croeso") == ["Diolch,", "fawr", "iawn:", "croeso"]


def test_tsv_keeps_confident_words_only():
    head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"
    rows = [head, "5\t1\t1\t1\t1\t1\t0\t0\t9\t9\t91.5\tbuenas", "5\t1\t1\t1\t1\t2\t0\t0\t9\t9\t30.0\txq",
            "5\t1\t1\t1\t1\t3\t0\t0\t9\t9\t88.5\ttardes", "4\t1\t1\t1\t1\t0\t0\t0\t9\t9\t-1\t"]
    assert ocr_frames.parse_tsv("\n".join(rows)) == ("buenas tardes", 90.0)
    assert ocr_frames.parse_tsv(head) == ("", None)


# The vision model's reply
def test_three_line_reply():
    reply = "TEXT: BUENAS TARDES\nSCENE: Ceremony\nWHAT: People in robes walk across the stage."
    assert vlm.parse_reply(reply) == {"text": "BUENAS TARDES", "scene": "ceremony",
                                      "what": "People in robes walk across the stage."}


def test_short_reply_and_none():
    assert vlm.parse_reply("NONE | performance | A choir sings on stage.") == {
        "text": "", "scene": "performance", "what": "A choir sings on stage."}


def test_unknown_scene_and_echoed_instructions_are_dropped():
    got = vlm.parse_reply("TEXT: copy every word written in the image\nSCENE: pick one word: ceremony, jury\nWHAT: x")
    assert got["text"] == "" and got["scene"] is None
    assert vlm.parse_reply("something else entirely")["scene"] is None


def test_prompt_names_no_festival_and_forbids_identifying_people():
    assert "eisteddfod" not in vlm.PROMPT.lower()
    assert "never name or guess who a person is" in vlm.PROMPT.lower()


def test_frames_for_the_model():
    kept = list(range(0, 100, 5))
    ocr_hits = {50}
    cuts = {85}
    got = vlm.select(kept, ocr_hits, cuts, every=4)
    assert got == sorted(set(kept[::4]) | {45, 50, 55} | {85})


# Scene runs
def test_one_frame_flicker_never_makes_a_run():
    labels = [(t, "performance") for t in range(0, 50, 5)]
    labels[4] = (20, "ceremony")
    assert runs.scene_runs(labels) == [("performance", 0, 45)]


def test_a_sustained_ceremony_is_a_run():
    labels = ([(t, "performance") for t in range(0, 30, 5)] + [(t, "ceremony") for t in range(30, 80, 5)]
              + [(t, "performance") for t in range(80, 110, 5)])
    labels[11] = (55, "performance")  # one flicker in the middle of the ceremony
    assert runs.scene_runs(labels) == [("performance", 0, 25), ("ceremony", 30, 75), ("performance", 80, 105)]


def test_unlabelled_frames_are_skipped():
    assert runs.scene_runs([(0, None), (5, None)]) == []
