"""The one rule that places collaborators' approved transcript corrections on their lines and applies them.

Spec: docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md, "Anchoring and applying".
The export bakes it into public/transcripciones-video/; src/lib/video-corrections.ts is its twin in the
player. Both run the vectors in tests/fixtures/video-corrections/, so a change here is a change there.

No fuzzy similarity: a correction on the wrong public line is worse than one left unplaced and reported.
"""
from __future__ import annotations

import math
import unicodedata

CERCA = 5  # s around a change's time where its line may now start
EXACTA = 2  # s within which an equal line is the same line (and an add is already there)


def _word_char(c: str) -> bool:
    return unicodedata.category(c)[0] in "LNM"


def _palabras(s: str) -> list[tuple[int, int, str]]:
    """A line's words and where each sits in it, (start, end, folded): runs of letters, digits and marks."""
    out, i = [], 0
    while i < len(s):
        if not _word_char(s[i]):
            i += 1
            continue
        j = i
        while j < len(s) and _word_char(s[j]):
            j += 1
        w = "".join(c for c in unicodedata.normalize("NFD", s[i:j].lower()) if unicodedata.category(c)[0] != "M")
        if w:
            out.append((i, j, w))
        i = j
    return out


def fold_line(s: str) -> str:
    """Lower case without accents, circumflexes or punctuation, single spaces: "¡Gracias, Señor ŵ!" → "gracias senor w"."""
    return " ".join(w for _, _, w in _palabras(s))


def _ubicar(lines: list[dict], t: float, antes: str) -> tuple[int, tuple[int, int, int] | None] | None:
    """The line a change with `antes` targets, nearest in time first and never a lyric line: an equal line within
    2 s (run None), else `antes` as a run of whole words inside a line within 5 s (a rebuild joined fragments):
    run (a, b, fin) with [a, b) the run and fin where the next word starts."""
    cand = sorted((abs(l["t"] - t), i) for i, l in enumerate(lines)
                  if abs(l["t"] - t) <= CERCA and "letra" not in l["fu"])
    busca = _palabras(antes)
    folded = " ".join(w for _, _, w in busca)
    for d, i in cand:
        if d <= EXACTA and fold_line(lines[i]["text"]) == folded:
            return i, None
    if not busca:
        return None
    # The fragment's own opening and closing marks ("¡…!", "….") go with its run when the line has them around it.
    pre, post, n = antes[:busca[0][0]], antes[busca[-1][1]:], len(busca)
    for _, i in cand:
        text = lines[i]["text"]
        ws = _palabras(text)
        for k in range(len(ws) - n + 1):
            if any(ws[k + j][2] != busca[j][2] for j in range(n)):
                continue
            a, b = ws[k][0], ws[k + n - 1][1]
            if pre and a >= len(pre) and text[a - len(pre):a] == pre:
                a -= len(pre)
            if post and text[b:b + len(post)] == post:
                b += len(post)
            return i, (a, b, ws[k + n][0] if k + n < len(ws) else len(text))
    return None


def _colab(line: dict) -> None:
    if "colab" not in line["fu"]:
        line["fu"].append("colab")


def _real_time(t) -> bool:
    return isinstance(t, (int, float)) and not isinstance(t, bool) and math.isfinite(t)


def apply_corrections(t: dict, rows: list[dict]) -> tuple[dict, list[str], list[dict]]:
    """The transcript with `rows` (approved video_text contributions) applied in reviewed_at order, the ids of
    the rows that changed something (the file records them so the player never applies one twice), and the
    changes not applied as {"id", "cambio", "motivo": "sin_linea" | "idioma_en_linea_unida"}. A line whose text
    a correction wrote gets "colab" in its fuentes; once a correction sets a language, "idiomas" covers every
    line (the file's own where it had them, else "cy" where the Welsh model heard it, else the file's lang)."""
    seg, fuentes, idiomas = t["seg"], t.get("fuentes") or [], t.get("idiomas")
    if not (isinstance(idiomas, list) and len(idiomas) == len(seg)):
        idiomas = None
    lines = [{"t": s, "text": x, "fu": list((fuentes[i] if i < len(fuentes) else None) or []),
              "idioma": idiomas[i] if idiomas is not None else None} for i, (s, x) in enumerate(seg)]
    con_idiomas = idiomas is not None
    applied: list[str] = []
    sin_anclar: list[dict] = []
    for row in sorted(rows, key=lambda r: str(r.get("reviewed_at") or "")):
        payload = row.get("payload")
        cambios = payload.get("cambios") if isinstance(payload, dict) else None
        hizo = False
        for c in cambios if isinstance(cambios, list) else []:
            if not isinstance(c, dict) or not _real_time(c.get("t")):
                sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "sin_linea"})
                continue
            texto = c["texto"] if isinstance(c.get("texto"), str) and c["texto"].strip() else None
            idioma = c["idioma"] if c.get("idioma") in ("es", "cy") else None
            if not isinstance(c.get("antes"), str):
                # An add; the same text already within 2 s means it is there (an earlier export or row put it there).
                if texto is None:
                    sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "sin_linea"})
                elif not any(abs(l["t"] - c["t"]) <= EXACTA and fold_line(l["text"]) == fold_line(texto) for l in lines):
                    at = next((i for i, l in enumerate(lines) if l["t"] > c["t"]), len(lines))
                    lines.insert(at, {"t": c["t"], "text": texto, "fu": ["colab"], "idioma": idioma})
                    con_idiomas = con_idiomas or idioma is not None
                    hizo = True
                continue
            lugar = _ubicar(lines, c["t"], c["antes"])
            if lugar is None:
                sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "sin_linea"})
                continue
            i, run = lugar
            line = lines[i]
            if c.get("quitar") is True:
                resto = (line["text"][:run[0]] + line["text"][run[2]:]).strip() if run else ""
                if fold_line(resto):
                    line["text"] = resto
                    _colab(line)
                else:
                    del lines[i]
                hizo = True
                continue
            if texto is not None:
                line["text"] = line["text"][:run[0]] + texto + line["text"][run[1]:] if run else texto
                _colab(line)
                hizo = True
            if idioma and run:
                sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "idioma_en_linea_unida"})
            elif idioma:
                line["idioma"] = idioma
                con_idiomas = True
                hizo = True
        if hizo:
            applied.append(row["id"])
    out = {**t, "seg": [[l["t"], l["text"]] for l in lines], "fuentes": [l["fu"] for l in lines]}
    if con_idiomas:
        out["idiomas"] = [l["idioma"] if l["idioma"] is not None else ("cy" if "cy" in l["fu"] else t.get("lang"))
                          for l in lines]
    else:
        out.pop("idiomas", None)
    return out, applied, sin_anclar
