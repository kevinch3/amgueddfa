"""Every timed line a video has, from every source, for the reconstruction.

Sources (src): "subida" (subtitles the uploader wrote), "yt_es" (YouTube's
automatic Spanish captions), "whisper_es" (Whisper, Spanish, filtered like the
published one), "cy" (Welsh, only once the A/B review names a model), "letra"
(lyrics from data/letras, aligned by scripts/align_lyrics.py).
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import NamedTuple

from scripts.align_lyrics import LETRAS, align, parse_letra, spans_for
from scripts.backup.videos import MEZCLA_SUFFIXES
from scripts.export_video_transcripts import LOOP, MARKER, STOCK, clean_whisper_timed, glob_escape, is_english, line_language, parse_vtt_timed

# The Welsh model, as the suffix of its file next to the video (<stem>.<WELSH_SOURCE>.json,
# segments [{"s": start, "text": ...}]). Bangor University's techiaith/whisper-large-ft-cy-en,
# chosen by the maintainer on 2026-11-20 after the A/B review ("go full Bangor").
WELSH_SOURCE: str | None = "cy-techiaith"


# Welsh lines the model was less sure of than this are background (music, chatter), not speech:
# 2009 chair ceremony, the five lines over the opening music are 0.14-0.49; real speech is 0.67+.
MIN_CY_CONF = 0.6
SPANISH_NEAR = 3.0  # seconds: a Welsh line this close to a Spanish line is taken as the same (Spanish) speech
# Words of Spanish text (tags left out) within SPANISH_NEAR that make it Spanish speech. Fewer are YouTube's
# guesses over Welsh singing ("cvar", "div", "[Música]"): in the 59 videos with both sources they removed
# 118 of the 134 Welsh lines dropped; next to real speech the Welsh model writes the Spanish in Welsh
# spelling or even translates it ("Aquí ha sido un placer" -> "Dwi'n meddwl bod o'n pleser").
SPANISH_SPEECH_WORDS = 5
SAME_SPEECH = 10.0  # s: a Spanish recogniser's Welsh line this close to a Bangor line is the same speech
# Mixed-language videos (the three MEZCLA_SUFFIXES files beside the video): every Bangor line's language is
# decided (scripts/reconstruct/mezcla.py), and another Spanish source's line is the same speech when a decided
# line overlaps at least OVERLAP of its own length; a line without an end counts UNKNOWN_SPAN s long.
OVERLAP = 0.5
UNKNOWN_SPAN = 1.0
EPS = 0.01  # s: float noise when a line's start is matched to its Bangor segment


class Line(NamedTuple):
    t: float
    text: str
    src: str
    lang: str
    conf: float | None = None  # the model's own confidence (0-1), Welsh lines only
    e: float | None = None  # end of the cue or segment (Spanish sources), when known


def _vtts(stem: Path) -> dict[str, Path]:
    return {p.name[len(stem.name) + 1:-4]: p for p in stem.parent.glob(f"{glob_escape(stem.name)}.*.vtt")}


def has_mezcla(stem: Path) -> bool:
    """The mixed-language pass left all three of its files beside the video."""
    return all(stem.with_name(f"{stem.name}{x}").exists() for x in MEZCLA_SUFFIXES)


def _span(ln: Line) -> tuple[float, float]:
    return ln.t, ln.e if ln.e is not None and ln.e > ln.t else ln.t + UNKNOWN_SPAN


def _overlapped(ln: Line, decided: list[Line]) -> bool:
    """A decided line covers at least OVERLAP of this line's own length."""
    a, b = _span(ln)
    return any(min(b, e) - max(a, t) >= OVERLAP * (b - a) for t, e in map(_span, decided))


def _welsh_ok(conf: float | None, text: str) -> bool:
    return (conf is None or conf >= MIN_CY_CONF) and not is_english(text)


def _row_conf(r: dict, segments: list[dict], seg_conf: list[tuple]) -> float | None:
    """The confidence of the Bangor segment a row was cut from: the one holding its first word, else by time,
    half-open (segments touch: a row starting at one's end is the next one's)."""
    first = r["cy_words"][0] if r.get("cy_words") else None
    for g, (_, _, c) in zip(segments, seg_conf):
        if first is not None and first in (g.get("words") or []):
            return c
    for s, e, c in seg_conf:
        if s - EPS <= r["s"] < e:
            return c
    return next((c for s, e, c in reversed(seg_conf) if s - EPS <= r["s"] <= e + EPS), None)


def _decided(stem: Path) -> list[Line]:
    """The Bangor lines of a mixed-language video, each as Welsh or Spanish (design step 2), plus its segments
    without word times as plain Welsh lines; below MIN_CY_CONF or English, left out."""
    from scripts.reconstruct.mezcla import decide  # mezcla imports Line from here
    read = lambda x: json.loads(stem.with_name(f"{stem.name}{x}").read_text(encoding="utf-8"))
    segments = read(".cy-palabras.json")["segments"]
    seg_conf = [(float(g["s"]), float(g["e"]), math.exp(g["lp"]) if "lp" in g else None) for g in segments]
    rows, conf = [], {}
    for r in read(".es-lineas.json")["lines"]:
        c = _row_conf(r, segments, seg_conf)
        if not _welsh_ok(c, r["cy"]):
            continue
        rows.append(r)
        if c is not None:
            conf[r["s"]] = round(c, 2)  # keyed on the row's own start: decide looks it up exactly
    out = decide(rows, conf)
    for g, (s, e, c) in zip(segments, seg_conf):
        if not g.get("words") and g["text"] and _welsh_ok(c, g["text"]):
            out.append(Line(s, g["text"], "cy", "cy", round(c, 2) if c is not None else None, e))
    return out


def load_sources(stem: Path, video_id: str, letras: Path = LETRAS) -> list[Line]:
    """All timed lines of one backed-up video (its path without suffix), sorted by time."""
    out: list[Line] = []
    mezcla = has_mezcla(stem)
    vtts = _vtts(stem)
    try:
        info = json.loads(stem.with_name(f"{stem.name}.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    # Uploaded subtitles: Spanish only, like the export (no English text, not even the author's); Welsh once chosen.
    langs = {"es"} | ({"cy"} if WELSH_SOURCE else set())
    for k in (info.get("subtitles") or {}):
        if k != "live_chat" and k in vtts and k.split("-")[0] in langs:
            out += [Line(float(t), x, "subida", k.split("-")[0], None, float(e))
                    for t, e, x in parse_vtt_timed(vtts[k].read_text(encoding="utf-8"))]
    if "es-orig" in vtts:
        out += [Line(float(t), x, "yt_es", "es", None, float(e)) for t, e, x in parse_vtt_timed(vtts["es-orig"].read_text(encoding="utf-8"))]
    w = stem.with_name(f"{stem.name}.whisper.json")
    if w.exists():
        d = json.loads(w.read_text(encoding="utf-8"))
        if d.get("language") == "es":
            out += [Line(float(t), x, "whisper_es", "es", None, float(e)) for t, e, x in clean_whisper_timed(d.get("segments", []))]
    # The Spanish pass (#112, KPC run_es.py): for videos Whisper took for Welsh, every Bangor segment's
    # language, and Spanish Whisper's text for the Spanish ones. There the Bangor line is left out below.
    spanish_segments: set[float] = set()
    es = stem.with_name(f"{stem.name}.whisper-es.json")
    if mezcla:
        # Mixed-language pass: turbo's long-form Spanish, then the decided Bangor lines; the other Spanish
        # sources' lines (yt_es, whisper_es) stay only where no decided line covers OVERLAP of them (#112's pass
        # is superseded).
        turbo = json.loads(stem.with_name(f"{stem.name}.es-turbo.json").read_text(encoding="utf-8"))
        out += [Line(float(t), x, "whisper_es", "es", None, float(e))
                for t, e, x in clean_whisper_timed([[g["s"], g["e"], g["text"]] for g in turbo.get("segments", [])])]
        decided = _decided(stem)
        # The uploader's subtitles (subida) are never dropped: the most reliable source.
        out = [l for l in out if l.src == "subida" or not _overlapped(l, decided)] + decided
    elif es.exists():
        for seg in json.loads(es.read_text(encoding="utf-8"))["segments"]:
            if "text" in seg:
                spanish_segments.add(round(float(seg["s"]), 2))
                text = seg["text"].strip()
                if text and not STOCK.search(text) and not LOOP.search(text):
                    out.append(Line(float(seg["s"]), text, "whisper_es", "es", None,
                                    float(seg["e"]) if "e" in seg else None))
    if WELSH_SOURCE and not mezcla:
        cy = stem.with_name(f"{stem.name}.{WELSH_SOURCE}.json")
        if cy.exists():
            # Next to Spanish speech the Welsh model's line is that speech again (in Spanish, Welsh spelling or a
            # translation) and is left out. Its Spanish lines go next to any Spanish text; its Welsh ones only
            # next to SPANISH_SPEECH_WORDS words of it, so a YouTube scrap over a Welsh song keeps the song.
            # Spanish speech nearby; a Spanish source's line that reads as Welsh (Spanish Whisper writes Welsh
            # speech too, with "en" for "yn") is not Spanish speech.
            es_lines = [(l.t, len(l.text.split())) for l in out
                        if l.lang == "es" and not MARKER.match(l.text) and line_language(l.text, [l.src]) == "es"]

            def heard_as_spanish(t: float, text: str) -> bool:
                words = sum(n for x, n in es_lines if abs(t - x) <= SPANISH_NEAR)
                return words >= (1 if line_language(text, ["cy"]) == "es" else SPANISH_SPEECH_WORDS)

            out += [Line(float(s["s"]), s["text"], "cy", "cy", round(math.exp(s["lp"]), 2) if "lp" in s else None)
                    for s in json.loads(cy.read_text(encoding="utf-8"))["segments"]
                    if s["text"] and ("lp" not in s or math.exp(s["lp"]) >= MIN_CY_CONF) and not is_english(s["text"])
                    and round(float(s["s"]), 2) not in spanish_segments and not heard_as_spanish(float(s["s"]), s["text"])]
            # The other way round: Welsh speech a Spanish recogniser wrote ("en" for "yn") is left out where
            # Bangor has it too, within SAME_SPEECH s: the same speech, written far worse.
            bangor = [l.t for l in out if l.src == "cy"]
            out = [l for l in out if not (l.src in ("yt_es", "whisper_es") and line_language(l.text, [l.src]) == "cy"
                                          and any(abs(l.t - t) <= SAME_SPEECH for t in bangor))]
    heard_es = [[l.t, l.text] for l in sorted(out) if l.src in ("subida", "yt_es", "whisper_es")]
    heard_cy = [[l.t, l.text] for l in sorted(out) if l.src == "cy"]
    for sp in spans_for(video_id, letras):
        meta, stanzas = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        # A Welsh song is timed from what the Welsh model heard; anything else from the Spanish sources.
        heard = heard_cy if meta.get("idioma") == "cy" and heard_cy else heard_es
        out += [Line(float(t), x, "letra", meta.get("idioma", ""))
                for t, x in align(heard, stanzas, sp["desde"], sp["hasta"], sp.get("estrofas"), sp.get("repartir", False))]
    return sorted(out, key=lambda l: (l.t, l.src))
