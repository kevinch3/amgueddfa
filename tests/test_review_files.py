from scripts.review_files import parse_review, review_text

SEG = [[12.3, "Galwn yn awr ar yr unawdwyr"], [75.0, "A oes heddwch?"], [3725.0, "Heddwch!"]]
META = {"id": "AAAAAAAAAAA", "title": "Gorsedd y Wladfa 2018", "year": 2018, "kind": "ceremonia", "minutes": 43}


def test_round_trip_keeps_times_and_text():
    text = review_text(META, SEG)
    assert "https://www.youtube.com/watch?v=AAAAAAAAAAA&t=75s" in text
    r = parse_review(text)
    assert r["id"] == "AAAAAAAAAAA" and r["decision"] == ""
    assert r["seg"] == [[12.0, "Galwn yn awr ar yr unawdwyr"], [75.0, "A oes heddwch?"], [3725.0, "Heddwch!"]]


def test_reviewer_edits_are_read():
    text = review_text(META, SEG)
    text = text.replace("PENDERFYNIAD / DECISIÓN: ", "PENDERFYNIAD / DECISIÓN: iawn")
    text = text.replace("| Galwn yn awr ar yr unawdwyr", "| Galwn yn awr ar yr unawdwyr soprano")
    text = text.replace("| A oes heddwch?", "|")                 # emptied: dropped
    text += "\n1:10:00 | Diolch yn fawr\n"                       # added by hand, any position
    r = parse_review(text)
    assert r["decision"] == "iawn"
    assert r["seg"] == [[12.0, "Galwn yn awr ar yr unawdwyr soprano"], [3725.0, "Heddwch!"], [4200.0, "Diolch yn fawr"]]
