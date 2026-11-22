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
from scripts.export_video_transcripts import LOOP, MARKER, STOCK, clean_whisper, glob_escape, is_english, line_language, parse_vtt

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


class Line(NamedTuple):
    t: float
    text: str
    src: str
    lang: str
    conf: float | None = None  # the model's own confidence (0-1), Welsh lines only


def _vtts(stem: Path) -> dict[str, Path]:
    return {p.name[len(stem.name) + 1:-4]: p for p in stem.parent.glob(f"{glob_escape(stem.name)}.*.vtt")}


def load_sources(stem: Path, video_id: str, letras: Path = LETRAS) -> list[Line]:
    """All timed lines of one backed-up video (its path without suffix), sorted by time."""
    out: list[Line] = []
    vtts = _vtts(stem)
    try:
        info = json.loads(stem.with_name(f"{stem.name}.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    # Uploaded subtitles: Spanish only, like the export (no English text, not even the author's); Welsh once chosen.
    langs = {"es"} | ({"cy"} if WELSH_SOURCE else set())
    for k in (info.get("subtitles") or {}):
        if k != "live_chat" and k in vtts and k.split("-")[0] in langs:
            out += [Line(float(t), x, "subida", k.split("-")[0]) for t, x in parse_vtt(vtts[k].read_text(encoding="utf-8"))]
    if "es-orig" in vtts:
        out += [Line(float(t), x, "yt_es", "es") for t, x in parse_vtt(vtts["es-orig"].read_text(encoding="utf-8"))]
    w = stem.with_name(f"{stem.name}.whisper.json")
    if w.exists():
        d = json.loads(w.read_text(encoding="utf-8"))
        if d.get("language") == "es":
            out += [Line(float(t), x, "whisper_es", "es") for t, x in clean_whisper(d.get("segments", []))]
    # The Spanish pass (#112, KPC run_es.py): for videos Whisper took for Welsh, every Bangor segment's
    # language, and Spanish Whisper's text for the Spanish ones. There the Bangor line is left out below.
    spanish_segments: set[float] = set()
    es = stem.with_name(f"{stem.name}.whisper-es.json")
    if es.exists():
        for seg in json.loads(es.read_text(encoding="utf-8"))["segments"]:
            if "text" in seg:
                spanish_segments.add(round(float(seg["s"]), 2))
                text = seg["text"].strip()
                if text and not STOCK.search(text) and not LOOP.search(text):
                    out.append(Line(float(seg["s"]), text, "whisper_es", "es"))
    if WELSH_SOURCE:
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
    heard_es = [[l.t, l.text] for l in sorted(out) if l.src in ("subida", "yt_es", "whisper_es")]
    heard_cy = [[l.t, l.text] for l in sorted(out) if l.src == "cy"]
    for sp in spans_for(video_id, letras):
        meta, stanzas = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        # A Welsh song is timed from what the Welsh model heard; anything else from the Spanish sources.
        heard = heard_cy if meta.get("idioma") == "cy" and heard_cy else heard_es
        out += [Line(float(t), x, "letra", meta.get("idioma", "")) for t, x in align(heard, stanzas, sp["desde"], sp["hasta"])]
    return sorted(out, key=lambda l: (l.t, l.src))
