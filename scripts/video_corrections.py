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
PALABRAS = 3  # words `antes` needs to be looked for anywhere but on an equal line within 2 s


def _word_char(c: str) -> bool:
    return unicodedata.category(c)[0] in "LNM"


# Spaces are spelled out (not isspace, not strip) so that the TypeScript twin treats exactly the same characters as spaces.
def _espacio(c: str) -> bool:
    return c in "\t\n\v\f\r" or unicodedata.category(c) == "Zs"


def _abre(c: str) -> bool:
    return c in "¡¿" or unicodedata.category(c) in ("Ps", "Pi")


def _cierra(c: str) -> bool:
    return c in ".,;:!?…" or unicodedata.category(c) in ("Pe", "Pf")


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


def _donde(ws: list[str], busca: list[str]) -> int:
    """Where the words `busca` first run in `ws`, or -1."""
    n = len(busca)
    return next((k for k in range(len(ws) - n + 1) if ws[k:k + n] == busca), -1)


def _en_letra(lines: list[dict], t: float) -> bool:
    """Whether `t` falls on sung text: a lyric line is the nearest line within 2 s (or as near as the nearest), or `t`
    lies between two consecutive lyric lines. What a change there was made on was most likely replaced by the lyrics."""
    cerca, letra = math.inf, False
    for l in lines:
        d = abs(l["t"] - t)
        if d > EXACTA or d > cerca:
            continue
        es = "letra" in l["fu"]
        letra = es if d < cerca else (letra or es)
        cerca = d
    if letra:
        return True
    return any("letra" in x["fu"] and "letra" in y["fu"] and min(x["t"], y["t"]) <= t <= max(x["t"], y["t"])
               for x, y in zip(lines, lines[1:]))


def _ubicar(lines: list[dict], huellas: list[tuple], t: float, antes: str):
    """The line a change with `antes` targets, nearest in time first and never a lyric line: (i, None) for an equal
    line within 2 s, else (i, (a, b, qa, qb)) for `antes` as a run of whole words inside a line within 5 s (a rebuild
    joined fragments): a texto replaces [a, b) (the words with `antes`' own marks), a quitar removes [qa, qb) (the words
    with the marks glued to them and the space after). "tomada" when the nearest match is text an earlier change
    already took (huellas: (t, words)): the change repeats an approved one, and trying the next candidate would land it
    on a twin line or inside that change's new text. At equal distance the taken text counts first. None: no line.
    Only an equal line within 2 s is sure: the rest is looked for only when `antes` has three words or more (one or
    two, like "Gracias." or "¡Bravo!", stand in many lines nearby) and `t` is not on sung text (see _en_letra);
    otherwise the change found no line, whatever stands nearby."""
    cand = sorted([(abs(h_t - t), 0, i) for i, (h_t, _) in enumerate(huellas) if abs(h_t - t) <= CERCA]
                  + [(abs(l["t"] - t), 1, i) for i, l in enumerate(lines)
                     if abs(l["t"] - t) <= CERCA and "letra" not in l["fu"]])
    busca = _palabras(antes)
    bw = [w for _, _, w in busca]
    folded = " ".join(bw)
    for d, k, i in cand:
        if d > EXACTA:
            break
        if k == 0 and " ".join(huellas[i][1]) == folded:
            return "tomada"
        if k == 1 and fold_line(lines[i]["text"]) == folded:
            return i, None
    if len(busca) < PALABRAS or _en_letra(lines, t):
        return None
    # The fragment's own opening and closing marks ("¡…!", "….") go with a texto's run when the line has them around it.
    pre, post = antes[:busca[0][0]], antes[busca[-1][1]:]
    for _, k, i in cand:
        if k == 0:
            if _donde(huellas[i][1], bw) >= 0:
                return "tomada"
            continue
        text = lines[i]["text"]
        ws = _palabras(text)
        at = _donde([w for _, _, w in ws], bw)
        if at < 0:
            continue
        wa, wb = ws[at][0], ws[at + len(bw) - 1][1]
        a, b = wa, wb
        if pre and a >= len(pre) and text[a - len(pre):a] == pre:
            a -= len(pre)
        if post and text[b:b + len(post)] == post:
            b += len(post)
        # A removed run takes the marks glued before it except a closing one (the end of the fragment before it),
        # the marks glued after it except an opening ¡ ¿ ( « “ (the next fragment's), and the space after it.
        qa, qb = wa, wb
        while qa > 0 and not (_espacio(text[qa - 1]) or _word_char(text[qa - 1]) or _cierra(text[qa - 1])):
            qa -= 1
        while qb < len(text) and not (_espacio(text[qb]) or _word_char(text[qb]) or _abre(text[qb])):
            qb += 1
        while qb < len(text) and _espacio(text[qb]):
            qb += 1
        return i, (a, b, qa, qb)
    return None


def _colab(line: dict) -> None:
    if "colab" not in line["fu"]:
        line["fu"].append("colab")


def _real_time(t) -> bool:
    return isinstance(t, (int, float)) and not isinstance(t, bool) and math.isfinite(t)


def apply_corrections(t: dict, rows: list[dict], idiomas_corregidos: list[int] | None = None) -> tuple[dict, list[str], list[dict]]:
    """The transcript with `rows` (approved video_text contributions) applied in reviewed_at order, the ids of
    the rows that changed something (the file records them so the player never applies one twice), and the
    changes not applied as {"id", "cambio", "motivo": "sin_linea" | "idioma_en_linea_unida"}. A line whose text
    a correction wrote gets "colab" in its fuentes; once a correction sets a language, "idiomas" covers every
    line (the file's own where it had them, else "cy" where the Welsh model heard it, else the file's lang).
    A change whose text an earlier change already took (two collaborators fixed the same original line) is not placed."""
    seg, fuentes, idiomas = t["seg"], t.get("fuentes") or [], t.get("idiomas")
    if not (isinstance(idiomas, list) and len(idiomas) == len(seg)):
        idiomas = None
    lines = [{"t": s, "text": x, "fu": list((fuentes[i] if i < len(fuentes) else None) or []),
              "idioma": idiomas[i] if idiomas is not None else None} for i, (s, x) in enumerate(seg)]
    huellas: list[tuple] = []  # (t, words) an applied change took from a line, at the change's time
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
            texto = c["texto"] if isinstance(c.get("texto"), str) and not all(map(_espacio, c["texto"])) else None
            idioma = c["idioma"] if c.get("idioma") in ("es", "cy") else None
            if not isinstance(c.get("antes"), str):
                # An add; the same text already within 2 s means it is there (an earlier export or row put it there).
                # Text an earlier change took from there is not put back: it repeats an approved add, and is reported.
                ya = texto is not None and any(abs(l["t"] - c["t"]) <= EXACTA and fold_line(l["text"]) == fold_line(texto)
                                               for l in lines)
                tomada = texto is not None and any(abs(h_t - c["t"]) <= EXACTA and " ".join(w) == fold_line(texto)
                                                   for h_t, w in huellas)
                if texto is None or (tomada and not ya):
                    sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "sin_linea"})
                elif not ya:
                    at = next((i for i, l in enumerate(lines) if l["t"] > c["t"]), len(lines))
                    lines.insert(at, {"t": c["t"], "text": texto, "fu": ["colab"], "idioma": idioma, "corr": idioma is not None})
                    con_idiomas = con_idiomas or idioma is not None
                    hizo = True
                continue
            lugar = _ubicar(lines, huellas, c["t"], c["antes"])
            if lugar is None or lugar == "tomada":
                sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "sin_linea"})
                continue
            i, run = lugar
            line = lines[i]
            huella = (c["t"], [w for _, _, w in _palabras(c["antes"])])
            if c.get("quitar") is True:
                resto = ""
                if run and run[3] == len(line["text"]):
                    resto = line["text"][:run[2]]
                    while resto and _espacio(resto[-1]):
                        resto = resto[:-1]
                elif run:
                    resto = line["text"][:run[2]] + line["text"][run[3]:]
                if fold_line(resto):
                    line["text"] = resto
                    _colab(line)
                else:
                    del lines[i]
                huellas.append(huella)
                hizo = True
                continue
            if texto is not None:
                line["text"] = line["text"][:run[0]] + texto + line["text"][run[1]:] if run else texto
                _colab(line)
                if fold_line(texto) != " ".join(huella[1]):
                    huellas.append(huella)
                hizo = True
            if idioma and run:
                sin_anclar.append({"id": row["id"], "cambio": c, "motivo": "idioma_en_linea_unida"})
            elif idioma:
                line["idioma"] = idioma
                line["corr"] = True
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
    # Python-only side channel for the export (not in the shared rule's contract, the return is unchanged):
    # the optional list gets the indices of the lines whose language a correction set, even when it equals the default.
    if idiomas_corregidos is not None:
        idiomas_corregidos.extend(i for i, l in enumerate(lines) if l.get("corr"))
    return out, applied, sin_anclar
