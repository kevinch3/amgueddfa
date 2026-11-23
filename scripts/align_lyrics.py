"""Known lyrics in place of YouTube's guesses while a piece is sung.

A choir's words come out of automatic captions as near-nonsense ("tan foras, tan
bellas"), but the programa says which piece is sung. Given the text
(data/letras/<slug>.md) and the span of the video where it is sung
(data/letras/videos.json), the lyric lines replace the automatic ones in that
span, each at the time of the automatic line its words were matched to; lines
nobody matched are spread between their neighbours by syllables. Times are
approximate and the player says so.

A line is anchored to the heard words only on real evidence (see LONG and RARE). The lyric
runs from its first anchored line to its last: lines before and after those are placed at
the pace the anchored ones were sung, inside the span and clear of speech heard there (see
SPEECH_GAP); squeezed in when they run a little past it, and spread over singing still heard
beyond the paced lines (see SQUEEZE and TAIL_GAP). A performance cut short, or a text longer
than what was sung, leaves its last lines out (preview() warns) instead of spreading them over
the applause and the announcer.

Choirs repeat stanzas: a stanza is taken as sung again (up to 3 times in all), right after
itself or later (a refrain after the next verse, a da capo), only when the extra pass matches
at least half its lines to words heard outside speech. A span can give the order instead
("estrofas": [1, 3, "1:3-4"], stanza numbers from 1, or lines 3 to 4 of stanza 1): for a
stanza left out, part of one sung again, or an order the heard words cannot show. A span with
"repartir": true spreads its lines evenly by syllables and leaves the heard words aside, for a
language no recogniser hears (the words it "hears" are coincidences; maintainer, 2026-11-23).

Used by export_video_transcripts and the reconstruction (a re-export keeps the
result). Lyrics are supplied by the maintainer, who confirms their rights.
"""
from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LETRAS = REPO / "data" / "letras"

MATCH = 0.6     # word similarity that counts as the same word heard
GAP = -0.2      # a heard word left unmatched
SKIP = -0.05    # a lyric word nobody heard (singing is often missed whole)
MISS = -0.5     # a mismatched pair
MAX_REPEAT = 3  # times a stanza may be sung
# A stanza sung again later than right after itself (see _order) must raise the alignment score by RETURN_GAIN
# per line of it. In the 143 spans measured in 2026-11, the 16 such passes the measurement hears gained 1.98 to
# 9.4 a line; 7 it does not hear (jury remarks, codas, a refrain once too often) 0.32 to 1.33. One more gained
# 2.1: newyddion-braf in Oev0xyrE5bY, where a refrain the text lacks is sung and taken for stanza 2.
RETURN_GAIN = 1.5

# Evidence that a line was heard where its words matched: 2 matched words, one of them of LONG+ letters
# at LONG_SIM; one word of RARE+ letters at RARE_SIM; or more than half of a line of shorter words.
# Anchors kept in the 81 spans measured in 2026-11 (letras-fin-medidas), on the measured singing / outside
# it: the old aligner (any word, speech included) 827 / 68; any word, speech left out, 817 / 15; any 2
# words, 697 / 10; 2 words with a long one, 614 / 5; that plus the rare word (this rule), 634 / 6. An anchor
# outside the singing is what carried lines onto the jury. The rare word keeps a line heard in one segment
# with the next (a 2-word line, one of them long): without it, 4 lines of the 'ok' spans were lost, with it 1.
LONG, LONG_SIM = 4, 0.8
RARE, RARE_SIM = 5, 0.85
# Lines outside the anchored ones go at the pace of the nearest anchors that span PACE_SYL syllables or
# more; with fewer, PACE (s per syllable, the median of 63 spans in 2026-11).
PACE, PACE_SYL = 0.75, 20
# Speech in a span: a heard line with 2+ words of LONG+ letters, fewer than half of them like a word of the
# text, next to another such line within SPEECH_GAP s. In those 85 spans it marked 502 of the 700 speech
# lines and 6 of the 1,222 sung ones (Whisper's fluent guesses over singing come alone).
SPEECH_GAP = 10.0
# ... unless SUNG_WORDS or more of its long words are like words of the text: that is the text sung, however
# much else the line holds (the Welsh model's 30 s segments glue the nonsense refrains into long words, and
# hen-ferchetan in eviefVEVksk lost its first two lines as 'speech', 2026-11).
SUNG_WORDS = 3
# A heard line of ALONE or more long words, none like a word of the text, and no more than ALONE_MAX words, is
# speech even alone ('Difícil tarea para el jurado de música, ¿no?' after coplas-para-la-tejedora in hVtD63KLlsw,
# 'PIMP, 55 Conjunto Masculino' after zamba-del-carnaval in -t5r4pwKx50, 2026-11). Longer ones are the Welsh
# model's fluent guesses over a hymn (15-20 words in its 30 s segments). With this rule and the one in _speech
# for a line between speech, on 146 of the spans measured in 2026-11 as they were before measuring, 225 of the
# 280 heard lines outside the measured singing are speech, and 32 of the 1,682 inside it (182 and 33 without).
ALONE, ALONE_MAX = 3, 12
LINE_DUR = 4.0  # s a heard line is taken to last, at most (until the next one)
# Lines after the last anchored one, at its pace, that run past the end of the span (or the speech after it)
# by little are squeezed into what is left: SQUEEZE is the least share of their paced time they may get (up to
# 1.7 times faster than the anchored lines; ave-maria-valva's closing lines, 2026-11). Further past is a
# performance cut short, or a text longer than what was sung: the lines that do not fit are left out. The same
# before the first anchored line.
SQUEEZE = 0.6
# Singing still heard (a heard line, not speech) more than TAIL_GAP s after where the paced last line starts, or
# before where the first does: the lines are spread up to it, the last (first) line on it, much as the old
# aligner did (9 measured spans ended 30-115 s early without).
TAIL_GAP = 8.0
# Nothing heard on the evidence an anchor needs, but MIN_WEAK lines or more matched on single words, in order:
# those place the lyric (ta-na-solbici in MIW7333GiIY and _75BiKuifoQ, sebben-crudele in vdriCRAMgdk, 2026-11:
# a Spanish recogniser hearing Slovenian or Italian). Fewer: the lines are spread evenly over the span.
MIN_WEAK = 2
# A whole line in brackets or parentheses of up to HEADING_WORDS words heads a stanza ('(Estribillo)'): not sung.
HEADING_WORDS = 3


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z]+", _fold(re.sub(r"\[[^\]]*\]", " ", s)))


def _syllables(line: str) -> int:
    return max(1, len(re.findall(r"[aeiouy]+", _fold(line))))


@lru_cache(maxsize=None)
def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def parse_letra(text: str) -> tuple[dict, list[list[str]]]:
    """Front matter (key: value lines) and the stanzas (blank-line separated) of a lyric file."""
    meta: dict = {}
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        text = text[m.end():]
    stanzas = [[l.strip() for l in block.splitlines() if l.strip() and not _heading(l.strip())]
               for block in re.split(r"\n\s*\n", text.strip())]
    return meta, [s for s in stanzas if s]


def _heading(line: str) -> bool:
    """A stanza heading such as '(Estribillo)' or '[Coro]' (see HEADING_WORDS)."""
    m = re.fullmatch(r"\((.*)\)|\[(.*)\]", line)
    return bool(m) and 0 < len((m.group(1) or m.group(2) or "").split()) <= HEADING_WORDS


def _dp(lyric: list[tuple[str, int]], heard: list[tuple[str, float, int]]) -> tuple[float, dict[int, list]]:
    """Global alignment of lyric words to heard words; score and, per lyric line, its matches
    [(lyric word, index in `heard`, similarity)]."""
    n, m = len(lyric), len(heard)
    sim = [[_sim(a, h[0]) for h in heard] for a, _ in lyric]
    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    P = [[""] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0], P[i][0] = D[i - 1][0] + SKIP, "u"
    for j in range(1, m + 1):
        D[0][j], P[0][j] = D[0][j - 1] + GAP, "l"
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sim[i - 1][j - 1]
            D[i][j], P[i][j] = max((D[i - 1][j - 1] + (s if s >= MATCH else MISS), "d"),
                                   (D[i - 1][j] + SKIP, "u"), (D[i][j - 1] + GAP, "l"))
    i, j, matches = n, m, {}
    while i and j:
        if P[i][j] == "d":
            if sim[i - 1][j - 1] >= MATCH:
                matches.setdefault(lyric[i - 1][1], []).append((lyric[i - 1][0], j - 1, sim[i - 1][j - 1]))
            i, j = i - 1, j - 1
        elif P[i][j] == "u":
            i -= 1
        else:
            j -= 1
    return D[n][m], matches


def _evidence(matched: list, words: list[str]) -> bool:
    """Whether a line's matched words show it was heard there (see LONG and RARE)."""
    if any(len(w) >= RARE and s >= RARE_SIM for w, _, s in matched):
        return True
    if len(matched) >= min(2, len(words)) and any(len(w) >= LONG and s >= LONG_SIM for w, _, s in matched):
        return True
    return not any(len(w) >= LONG for w in words) and 2 * len(matched) > len(words)


def _speech(inside: list[tuple[float, str]], stanzas: list[list[str]]) -> set[int]:
    """Indices of the heard lines that are speech, not the text sung (see SPEECH_GAP)."""
    vocab = {w for st in stanzas for line in st for w in _words(line)}

    def like(x: str) -> tuple[int, int, int]:
        words = _words(x)
        long_ = [w for w in words if len(w) >= LONG]
        return len(words), len(long_), sum(any(_sim(w, v) >= LONG_SIM for v in vocab) for w in long_)

    counts = [like(x) for _, x in inside]
    f = {i for i, (_, n, k) in enumerate(counts) if n >= 2 and 2 * k < n and k < SUNG_WORDS}
    alone = {i for i in f if counts[i][1] >= ALONE and not counts[i][2] and counts[i][0] <= ALONE_MAX}
    sp = alone | {i for i in f if any(j in f and abs(inside[j][0] - inside[i][0]) <= SPEECH_GAP for j in (i - 1, i + 1))}
    # A line with speech within SPEECH_GAP s on both sides is the same speech, words of the text or not (the
    # announcer's 'que estén listos para la misma' after gurisito in 0X83qrUotz0 anchored the lyric, 2026-11).
    times = sorted(inside[i][0] for i in sp)
    return sp | {i for i, (t, _) in enumerate(inside)
                 if any(0 < t - u <= SPEECH_GAP for u in times) and any(0 < u - t <= SPEECH_GAP for u in times)}


def _kept(anchors: dict[int, float], same: frozenset | set = frozenset()) -> dict[int, float]:
    """Anchors whose times increase with the line order (a later line heard earlier is dropped); a line in
    `same` counts too when heard in the same segment as the line before."""
    keep, last = {}, float("-inf")
    for k in sorted(anchors):
        if anchors[k] > last or k in same and anchors[k] == last:
            keep[k], last = anchors[k], anchors[k]
    return keep


def _spread(lines: list[str], pts: list[tuple[int, float]], out: list) -> None:
    """Lines between consecutive (index, time) points spread by syllables; index -1 is before the first line."""
    for (ia, ta), (ib, tb) in zip(pts, pts[1:]):
        if ia >= 0:
            out[ia] = ta
        span = ([ia] if ia >= 0 else []) + list(range(ia + 1, ib))
        total = sum(_syllables(lines[k]) for k in span) or 1
        acc = _syllables(lines[ia]) if ia >= 0 else 0
        for k in range(ia + 1, ib):
            out[k] = round(ta + (tb - ta) * acc / total, 1)
            acc += _syllables(lines[k])


def _lines(stanzas: list[list[str]], seq: list) -> tuple[list[str], list[tuple[int, int]]]:
    """The lines sung in the order `seq` (0-based stanza indices, or (index, first line, end line) for part of
    one), and each line's (stanza, line) number."""
    lines, where = [], []
    for item in seq:
        si, a, b = item if isinstance(item, tuple) else (item, 0, len(stanzas[item]))
        lines += stanzas[si][a:b]
        where += [(si + 1, li + 1) for li in range(a, b)]
    return lines, where


def _pass(stanzas: list[list[str]], seq: list, heard: list):
    """The alignment with the stanzas sung in the order `seq` (see _lines): score, number of lines matched
    (kept), the lines, each line's (stanza, line) number, the anchors (evidence), the other lines' earliest
    match, and the lines matched counted as for a stanza sung again later."""
    lines, where = _lines(stanzas, seq)
    score, matches = _dp([(w, k) for k, l in enumerate(lines) for w in _words(l)], heard)
    anchors, weak = {}, {}
    for k, mt in matches.items():
        if _evidence(mt, _words(lines[k])):
            anchors[k] = min(heard[j][1] for _, j, _ in mt)
        else:
            weak[k] = min(heard[j][1] for _, j, _ in mt)
    # A repeat is judged on every line matched outside speech: a stanza heard again shows as a run of lines,
    # each on weaker evidence than an anchor needs (rosa-amarela's second pass, 2026-11: 3 of 4 lines matched,
    # none on 2 words). For a stanza sung again later (see _order), a line heard clearly counts even in the same
    # segment as the line before, as the Welsh model's 30 s segments hold several (pam-fod-eira-yn-wyn in
    # eNmj-1_HlIk, 2026-11: its refrain, sung three times, was heard 3 lines to a segment). Counted that way
    # for a stanza sung twice in a row, it invented repeats in about a dozen of the 143 spans.
    matched = {**weak, **anchors}
    return score, len(_kept(matched)), lines, where, anchors, weak, len(_kept(matched, set(anchors)))


def _order(stanzas: list[list[str]], heard: list):
    """The order the stanzas were sung in (0-based) and its _pass: each stanza once, then, one at a time, the
    stanza sung again that raises the score most, where the extra pass matches at least half its lines: right
    after itself (a stanza repeated) or later (a refrain after the next verse: nada in -272dzknxa8; a da capo).
    Later, one more line must anchor and the score must rise by RETURN_GAIN per line of the stanza: short words
    heard in the jury's remarks are not a refrain ('¿No fue la jurado?' after zamba-del-carnaval in -t5r4pwKx50),
    nor half a stanza in a coda."""
    seq = list(range(len(stanzas)))
    cur = _pass(stanzas, seq, heard)
    while True:
        best, seen = None, set()
        for i, st in enumerate(stanzas):
            if seq.count(i) >= MAX_REPEAT:
                continue
            for q in range(seq.index(i) + 1, len(seq) + 1):
                trial = seq[:q] + [i] + seq[q:]
                if tuple(trial) in seen:
                    continue
                seen.add(tuple(trial))
                r = _pass(stanzas, trial, heard)
                later = i not in seq[q - 1:q + 1]  # not next to itself
                gain = r[6] - cur[6] if later else r[1] - cur[1]
                if (r[0] > cur[0] and gain >= (len(st) + 1) // 2
                        and (not later or len(_kept(r[4])) > len(_kept(cur[4])) and r[0] - cur[0] >= RETURN_GAIN * len(st))
                        and (best is None or r[0] > best[1][0])):
                    best = (trial, r)
        if best is None:
            return seq, cur
        seq, cur = best


def _given(estrofas: list, stanzas: list[list[str]]) -> list:
    """A span's "estrofas" in the order sung, as _pass takes them: stanza numbers from 1, or "n:a-b" for lines a
    to b of stanza n."""
    out = []
    for e in estrofas:
        m = re.fullmatch(r"(\d+):(\d+)-(\d+)", e) if isinstance(e, str) else None
        n, a, b = (int(m[1]), int(m[2]), int(m[3])) if m else (e, 1, None)
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= len(stanzas) or (
                b is not None and not 1 <= a <= b <= len(stanzas[n - 1])):
            raise ValueError(f"estrofas {estrofas}: {e!r} is not a stanza (1 to {len(stanzas)}) or 'n:a-b' lines of one")
        out.append(n - 1 if b is None else (n - 1, a - 1, b))
    return out


def _numbers(seq: list) -> list:
    """`seq` (see _lines) as a span's "estrofas" writes it."""
    return [f"{e[0] + 1}:{e[1] + 1}-{e[2]}" if isinstance(e, tuple) else e + 1 for e in seq]


def _align(seg: list, stanzas: list[list[str]], desde: float, hasta: float,
           estrofas: list | None = None, repartir: bool = False) -> tuple[list[list], dict]:
    """align() and how it went: {"anchored": n, "weak": placed on single words only, "repartido": spread evenly
    as the span asked, "estrofas": the order sung, "start": [(stanza, line), ...] not placed at the start,
    "end": [...] at the end}."""
    info: dict = {"anchored": 0, "weak": False, "repartido": repartir, "estrofas": [], "start": [], "end": []}
    inside = [(float(t), x) for t, x in seg if desde <= t < hasta and _words(x)]
    if not stanzas:
        return [], info
    if repartir:  # the span says no recogniser hears this text: its words "heard" are coincidences
        seq = _given(estrofas, stanzas) if estrofas else list(range(len(stanzas)))
        info["estrofas"] = _numbers(seq)
        lines, _ = _lines(stanzas, seq)
        out: list = [None] * len(lines)
        _spread(lines, [(-1, float(desde)), (len(lines), float(hasta))], out)
        return [[t, l] for t, l in zip(out, lines)], info
    speech = _speech(inside, stanzas)
    heard = [(w, t, i) for i, (t, x) in enumerate(inside) if i not in speech for w in _words(x)]  # speech is never matched
    if estrofas:
        seq = _given(estrofas, stanzas)
        cur = _pass(stanzas, seq, heard)
    else:
        seq, cur = _order(stanzas, heard)
    info["estrofas"] = _numbers(seq)
    _, _, lines, where, anchors, weak, _ = cur
    out = [None] * len(lines)
    kept = _kept(anchors)
    if kept:
        # A long heard segment (the Welsh model's are up to 30 s) can hold the first lines with the first
        # anchored one, at the segment's time. Lines before that anchor matched in the same segment, even on
        # weak evidence, were heard there: the lyric starts on the earliest of them, and the anchored line
        # is spread after it (cwm-rhondda in K3uYyZGC68o, 2026-11: lines 1-2 were left out).
        first = min(kept)
        shared = [k for k in range(first) if weak.get(k) == kept[first]]
        if shared:
            kept[min(shared)] = kept.pop(first)
            kept = dict(sorted(kept.items()))
    elif len(_kept(weak)) >= MIN_WEAK:
        kept, weak, info["weak"] = _kept(weak), {}, True
    info["anchored"] = len(kept)
    if not kept:  # nothing heard well enough: the span is all there is
        _spread(lines, [(-1, float(desde)), (len(lines), float(hasta))], out)
        return [[t, l] for t, l in zip(out, lines)], info

    # From the first anchored line to the last: anchors, and a line matched on weaker evidence keeps
    # its time when it falls between its anchored neighbours; the rest are spread by syllables.
    ks = sorted(kept)
    first, last = ks[0], ks[-1]
    pts = dict(kept)
    for a, b in zip(ks, ks[1:]):
        lo = kept[a]
        for k in range(a + 1, b):
            if k in weak and lo < weak[k] < kept[b]:
                pts[k] = lo = weak[k]
    _spread(lines, sorted(pts.items()), out)
    for k, t in pts.items():
        out[k] = t

    syl = [_syllables(l) for l in lines]

    sung = [t for i, (t, _) in enumerate(inside) if i not in speech]  # heard lines that are not speech
    # Lines placed on single words give no pace to tell a performance cut short by: squeeze, never leave out
    # (sebben-crudele in vdriCRAMgdk, 2026-11: its second stanza was dropped).
    squeeze = 0.0 if info["weak"] else SQUEEZE

    def pace(edge: int, others) -> float:
        for k in others:
            a, b = min(edge, k), max(edge, k)
            if sum(syl[a:b]) >= PACE_SYL:
                return abs(kept[edge] - kept[k]) / sum(syl[a:b])
        return PACE

    # After the last anchored line: at its pace while each line starts before hasta and before the next
    # speech; squeezed into what is left when they run a little past (SQUEEZE), spread over the singing still
    # heard well after the paced lines (TAIL_GAP).
    stop = min([float(hasta)] + [t for i, (t, _) in enumerate(inside) if i in speech and t > kept[last]])
    if last < len(lines) - 1:
        p, t0 = pace(last, reversed(ks[:-1])), kept[last]
        paced = [t0 + p * sum(syl[last:k]) for k in range(last + 1, len(lines))]  # start of each line
        later = [t for t in sung if t0 < t < stop]
        # The last line still has to be sung before the end: a sound heard right at it (the 'Diolch yn fawr'
        # after hiraeth in -xFt_5ZLcLk, 2026-11) takes the last line no later than its paced length before.
        reach = min(max(later), stop - p * syl[-1]) if later else None
        if paced[-1] >= stop:
            if stop - t0 >= squeeze * p * sum(syl[last:]):
                _spread(lines, [(last, t0), (len(lines), stop)], out)
            else:
                fit = sum(1 for t in paced if t < stop)
                for j in range(fit):
                    out[last + 1 + j] = round(paced[j], 1)
                info["end"] = where[last + 1 + fit:]
        elif reach is not None and reach > paced[-1] + TAIL_GAP:  # the last line on the last singing heard
            _spread(lines, [(last, t0), (len(lines) - 1, reach), (len(lines), reach + LINE_DUR)], out)
        else:
            for j, t in enumerate(paced):
                out[last + 1 + j] = round(t, 1)

    # Before the first: at its pace while each line still ends after desde and after the speech before it
    # (a line cut by that boundary starts on it); squeezed and spread as after the last.
    floor = float(desde)
    before = [t for i, (t, _) in enumerate(inside) if i in speech and t < kept[first]]
    if before:
        t0 = max(before)
        t1 = min([t for t, _ in inside if t > t0] + [kept[first]])
        floor = max(floor, t0 + min(LINE_DUR, t1 - t0))
    if first > 0:
        p, t1 = pace(first, ks[1:]), kept[first]
        paced = [t1 - p * sum(syl[k:first]) for k in range(first)]  # start of each line
        earlier = [t for t in sung if floor <= t < t1]
        if paced[0] < floor and t1 > floor and t1 - floor >= squeeze * p * sum(syl[:first]):
            _spread(lines, [(-1, floor), (first, t1)], out)
        elif paced[0] < floor:
            for k in range(first - 1, -1, -1):
                if paced[k] + p * syl[k] <= floor:
                    info["start"] = where[:k + 1]
                    break
                out[k] = round(max(paced[k], floor), 1)
                if paced[k] < floor:
                    info["start"] = where[:k]
                    break
        elif earlier and min(earlier) < paced[0] - TAIL_GAP:
            _spread(lines, [(-1, min(earlier)), (first, t1)], out)
        else:
            for k in range(first):
                out[k] = round(paced[k], 1)
    return [[t, l] for t, l in zip(out, lines) if t is not None], info


def align(seg: list, stanzas: list[list[str]], desde: float, hasta: float,
          estrofas: list | None = None, repartir: bool = False) -> list[list]:
    """Lyric lines as [[time, line], ...] for the part of `seg` in [desde, hasta); `estrofas`, the order sung
    when the span gives it (stanza numbers from 1, or "n:a-b" for lines a to b of stanza n); `repartir`, the
    lines spread evenly over the span by syllables, the heard words left aside, when the span asks it."""
    return _align(seg, stanzas, desde, hasta, estrofas, repartir)[0]


def apply(t: dict, spans: list[dict], letras: Path = LETRAS) -> dict:
    """The transcript with each span's automatic lines replaced by its aligned lyric; `letras` lists the spans."""
    if not spans:
        return t
    seg = [list(s) for s in t["seg"]]
    info = []
    for sp in spans:
        meta, stanzas = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        lyric = align(seg, stanzas, sp["desde"], sp["hasta"], sp.get("estrofas"), sp.get("repartir", False))
        seg = [s for s in seg if not sp["desde"] <= s[0] < sp["hasta"]] + lyric
        info.append(lyric_info(sp, meta))
    return {**t, "seg": sorted(seg, key=lambda s: s[0]), "letras": info}


def lyric_info(sp: dict, meta: dict) -> dict:
    """What the player shows of a lyric sung in a span: its time, title and author, and the rights
    and source that credit the text."""
    return {"desde": sp["desde"], "hasta": sp["hasta"], **{k: meta.get(k, "") for k in ("titulo", "autor", "idioma")},
            **{k: meta[k] for k in ("derechos", "fuente") if meta.get(k)}}


def credit(info: list[dict], spans: list[dict], letras: Path = LETRAS) -> list[dict]:
    """`info` (a reconstruction's lyrics) with each one's rights and source from its file, matched by span."""
    by_span = {(sp["desde"], sp["hasta"]): sp["letra"] for sp in spans}
    out = []
    for l in info:
        slug = by_span.get((l["desde"], l["hasta"]))
        meta = parse_letra((letras / f"{slug}.md").read_text(encoding="utf-8"))[0] if slug else {}
        out.append({**l, **{k: meta.get(k, "") for k in ("derechos", "fuente") if meta.get(k)}})
    return out


def spans_for(video_id: str, letras: Path = LETRAS) -> list[dict]:
    p = letras / "videos.json"
    return json.loads(p.read_text(encoding="utf-8")).get(video_id, []) if p.exists() else []


def preview(seg: list, stanzas: list[list[str]], desde: float, hasta: float,
            estrofas: list | None = None, repartir: bool = False) -> tuple[list[list], list[str]]:
    """The aligned lines and warnings worth a look before publishing."""
    out, info = _align(seg, stanzas, desde, hasta, estrofas, repartir)
    warn = []
    for (a, la), (b, _) in zip(out, out[1:]):
        if b - a < 1.0:
            warn.append(f"{a:.1f}s «{la}»: next line under 1 s later (too many repeats, or the span is too short?)")
    if repartir:
        return out, warn
    if out and out[0][0] - desde > 30:
        warn.append(f"first line {out[0][0] - desde:.0f} s after 'desde': the span may start too early")
    heard = any(_words(x) for t, x in seg if desde <= t < hasta)
    if not heard:
        warn.append("no heard words in the span: wrong video or times")
    elif not info["anchored"]:
        warn.append("no line heard clearly enough to anchor it: the lines are spread evenly over the span, "
                    "so 'desde' and 'hasta' must mark the singing exactly")
    elif info["weak"]:
        warn.append(f"no line heard on two words or a long one: {info['anchored']} lines are placed on single words "
                    "heard, and the rest between them; check the timing by ear")
    if info["end"]:
        (s, l), n = info["end"][0], len(info["end"])
        warn.append(f"{n} lines not placed at the end, from stanza {s} line {l} on: the text is longer than what "
                    f"was sung here (a performance cut short, a shorter version), or 'hasta' is before the end of the singing")
    if info["start"]:
        (s, l), n = info["start"][-1], len(info["start"])
        warn.append(f"{n} lines not placed at the start, up to stanza {s} line {l}: sung before the recording or "
                    f"before 'desde', or speech is heard right before the first line heard")
    return out, warn


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Preview an alignment before adding it to data/letras/videos.json.")
    ap.add_argument("video")
    ap.add_argument("letra", help="slug in data/letras/ (without .md)")
    ap.add_argument("desde", type=float)
    ap.add_argument("hasta", type=float)
    ap.add_argument("--estrofas", help="the order sung, as the span's \"estrofas\": stanza numbers from 1, n:a-b for lines a to b of stanza n (e.g. 1,2,1:3-4)")
    ap.add_argument("--repartir", action="store_true", help="spread the lines evenly over the span, as the span's \"repartir\": true")
    a = ap.parse_args()
    order = [int(n) if n.isdigit() else n for n in a.estrofas.split(",")] if a.estrofas else None
    even = a.repartir
    # The reconstruction keeps the fragment timing; the published text joins fragments into sentences (#97),
    # which would pile verses onto one line's time. Preview against the reconstruction when there is one.
    rec = REPO / "data" / "reconstruccion" / f"{a.video}.json"
    tr = json.loads((rec if rec.exists() else REPO / "public" / "transcripciones-video" / f"{a.video}.json").read_text(encoding="utf-8"))
    if tr.get("letras"):
        print("note: this file already carries aligned lyrics; preview the raw text by re-exporting without the span")
    _, st = parse_letra((LETRAS / f"{a.letra}.md").read_text(encoding="utf-8"))
    lines, warnings = preview(tr["seg"], st, a.desde, a.hasta, order, even)
    sung = _align(tr["seg"], st, a.desde, a.hasta, order, even)[1]["estrofas"]
    if sung != list(range(1, len(st) + 1)):
        print("stanzas sung:", " ".join(map(str, sung)), "" if order else "(found from the heard words; give \"estrofas\" in the span if wrong)")
    for t, l in lines:
        print(f"{int(t) // 60}:{int(t) % 60:02d}  {l}")
    for w in warnings:
        print("WARN", w)
