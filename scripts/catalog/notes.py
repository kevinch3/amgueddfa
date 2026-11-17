import re

_FB = re.compile(r"^FB page [^;]*;\s*post text:\s*(.*)$", re.S)
_CUT = re.compile(
    r"(\s+\d+)*\s+\d*\s*Comments?\b|No comments yet|Comment as|\s\|\s*links:"
)
MAX_LEN = 300


def _truncate(s: str) -> str:
    if len(s) <= MAX_LEN:
        return s
    cut = s[: MAX_LEN - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip() + "…"


def clean_note(raw: str, src_path: str, caption: str = "") -> str:
    """Public note: the source's own caption (SOURCES.tsv "caption" column),
    else the cleaned caption of a Facebook post.

    Every other note in SOURCES.tsv is an internal (English) working note and
    is never published.
    """
    if caption.strip():
        return _truncate(" ".join(caption.split()))
    m = _FB.match((raw or "").strip())
    if not m:
        return ""
    s = m.group(1)
    if " · " in s:
        s = s.split(" · ", 1)[1]
    m2 = _CUT.search(" " + s)
    if m2:
        s = (" " + s)[: m2.start()]
    return _truncate(s.strip())
