import json

from scripts.colab import unir_trozos as u


def seg(s, e, text="buenas tardes"):
    return {"s": s, "e": e, "text": text, "words": [[s, e, text, 0.9]]}


def test_times_shift_and_each_piece_keeps_its_own_stretch():
    p0 = [seg(10.0, 12.0), seg(98.0, 103.0)]           # the second ends inside the overlap: kept whole
    p1 = [seg(1.0, 3.0), seg(4.0, 6.0), seg(50.0, 52.0)]  # 101-103 repeats p0's last line; 104 and 150 are new
    got = u.join([p0, p1], step=100.0)
    assert [(x["s"], x["e"]) for x in got] == [(10.0, 12.0), (98.0, 103.0), (104.0, 106.0), (150.0, 152.0)]
    assert got[2]["words"][0][:2] == [104.0, 106.0]


def test_overlap_tail_of_a_piece_is_left_to_the_next():
    p0 = [seg(101.0, 104.0)]   # starts after the cut: piece 1 has it
    p1 = [seg(1.0, 4.0)]
    assert [x["s"] for x in u.join([p0, p1], step=100.0)] == [101.0]


def test_rows_shift_both_word_lists(tmp_path):
    row = {"s": 1.0, "e": 2.0, "cy": "x", "cy_words": [[1.0, 2.0, "x", 0.9]], "es": "", "es_words": []}
    assert u.join([[], [row]], step=100.0)[0]["cy_words"] == [[101.0, 102.0, "x", 0.9]]


def test_main_writes_three_files_and_refuses_gaps(tmp_path):
    for n in (0, 1):
        for kind, key in u.KINDS.items():
            (tmp_path / f"vidp{n}.{kind}.json").write_text(json.dumps({"id": f"vidp{n}", "until": None, key: []}))
    assert u.main(["vid", str(tmp_path), str(tmp_path / "out")]) == 0
    d = json.loads((tmp_path / "out" / "vid.words.json").read_text())
    assert (d["id"], d["trozos"]) == ("vid", 2)
    (tmp_path / "vidp1.words.json").rename(tmp_path / "vidp2.words.json")
    assert u.main(["vid", str(tmp_path), str(tmp_path / "o2")]) == 1
