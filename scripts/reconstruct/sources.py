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
from scripts.export_video_transcripts import clean_whisper, glob_escape, parse_vtt

# The Welsh model, as the suffix of its file next to the video (<stem>.<WELSH_SOURCE>.json,
# segments [{"s": start, "text": ...}]). Bangor University's techiaith/whisper-large-ft-cy-en,
# chosen by the maintainer on 2026-11-20 after the A/B review ("go full Bangor").
WELSH_SOURCE: str | None = "cy-techiaith"


SPANISH_NEAR = 3.0  # seconds: a Welsh line this close to a Spanish line is taken as the same (Spanish) speech


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
    if WELSH_SOURCE:
        cy = stem.with_name(f"{stem.name}.{WELSH_SOURCE}.json")
        if cy.exists():
            # The Welsh model writes Welsh even over Spanish speech: where a Spanish source
            # has a line nearby, its line is not Welsh speech and is left out.
            es_times = [l.t for l in out if l.lang == "es"]
            out += [Line(float(s["s"]), s["text"], "cy", "cy", round(math.exp(s["lp"]), 2) if "lp" in s else None)
                    for s in json.loads(cy.read_text(encoding="utf-8"))["segments"]
                    if s["text"] and not any(abs(float(s["s"]) - t) <= SPANISH_NEAR for t in es_times)]
    heard_es = [[l.t, l.text] for l in sorted(out) if l.src in ("subida", "yt_es", "whisper_es")]
    heard_cy = [[l.t, l.text] for l in sorted(out) if l.src == "cy"]
    for sp in spans_for(video_id, letras):
        meta, stanzas = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        # A Welsh song is timed from what the Welsh model heard; anything else from the Spanish sources.
        heard = heard_cy if meta.get("idioma") == "cy" and heard_cy else heard_es
        out += [Line(float(t), x, "letra", meta.get("idioma", "")) for t, x in align(heard, stanzas, sp["desde"], sp["hasta"])]
    return sorted(out, key=lambda l: (l.t, l.src))
