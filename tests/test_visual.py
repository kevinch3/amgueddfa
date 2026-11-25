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
def test_reply_text_and_sentence():
    reply = "TEXT: BUENAS TARDES\nWHAT: People in blue robes kneel on the stage while a girl holds a bouquet."
    assert vlm.parse_reply(reply) == {"text": "BUENAS TARDES", "cues": {"robes", "kneel", "flowers"},
                                      "what": "People in blue robes kneel on the stage while a girl holds a bouquet."}


def test_cues_come_from_the_sentence_not_the_screen_text():
    got = vlm.parse_reply("TEXT: DANCE FESTIVAL\nWHAT: A choir sings on stage.")
    assert got["cues"] == set() and got["text"] == "DANCE FESTIVAL"


def test_unlabelled_reply_uses_its_last_line_as_the_sentence():
    # The 7B often drops the labels: "NONE\nyes\n...\nA group dances."
    got = vlm.parse_reply("NONE\nyes\nno\nA group of performers is dancing in a circle.")
    assert got == {"text": "", "cues": {"dance"}, "what": "A group of performers is dancing in a circle."}


def test_none_and_echoed_instructions():
    assert vlm.parse_reply("TEXT: NONE\nWHAT: A choir sings.")["text"] == ""
    assert vlm.parse_reply("TEXT: copy every word written in the image\nWHAT: x")["text"] == ""
    assert vlm.parse_reply("") == {"text": "", "cues": set(), "what": ""}


def test_cue_words():
    cues = lambda s: vlm.cues_in(s)
    assert cues("men in gowns walk") == {"robes"} and cues("a panel of judges writes") == {"judges"}
    assert cues("someone kneeling") == {"kneel"} and cues("the dancers bow") == {"dance"}
    assert cues("a robust performance") == set()  # whole words only


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


def test_cue_runs_follow_one_cue():
    cues = [(t, {"robes"} if 20 <= t <= 60 else set()) for t in range(0, 100, 5)]
    cues[8] = (40, set())  # one frame in the middle where the model missed the robes
    assert runs.cue_runs(cues, "robes") == [(20, 60)]


def test_precision():
    assert vlm.bits_for("auto", small_card=True, model_id=vlm.MODEL) == 4    # 7B on a 16 GB card: 4-bit (tested)
    assert vlm.bits_for("auto", small_card=False, model_id=vlm.MODEL) == 16  # an L4 or A100 holds it whole
    assert vlm.bits_for("auto", small_card=True, model_id="Qwen/Qwen2.5-VL-3B-Instruct") == 16
    assert vlm.bits_for("8", small_card=True, model_id=vlm.MODEL) == 8
    assert vlm.out_name(16, "auto") == "vlm.jsonl" and vlm.out_name(8, "8") == "vlm.8bit.jsonl"


def test_one_folder_or_a_list_of_folders(tmp_path):
    lst = tmp_path / "chunk1.txt"
    lst.write_text("vid_a\n\n  vid_b \n", encoding="utf-8")
    assert vlm.folders_from(str(lst)) == [tmp_path / "vid_a", tmp_path / "vid_b"]  # relative to the list's folder
    assert vlm.folders_from(str(tmp_path / "vid_c")) == [tmp_path / "vid_c"]
