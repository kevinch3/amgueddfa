"""Competition and ceremony markers for long session videos (issue #26).

  python3 -m scripts.video_markers [BACKUP_ROOT]

For each long Chubut session (over 3 h) on the site, reads its transcription from the
private backup (YouTube's automatic one, else Whisper's) and finds where each
competition of that year's programa starts ("continuamos con la competencia número 64")
and where the chair, crown and medal ceremonies are. Upcoming calls ("que se vayan
preparando para la competencia…") and verdicts ("veredicto de la competencia…") are
skipped: verdicts wait for the privacy periods of #29.

A start is "high" when words of that competition's programa title are heard within
90 s of the call; a ceremony is "high" when "ceremonia" and its kind are said together.
User decision 2026-11-20: high markers are published (public/marcadores-video/<id>.json,
shown in the player as automatic chapters); every candidate is kept privately, with
its context, in ../.marcadores/<id>.json for review.
"""
from __future__ import annotations

import csv
import glob
import json
import re
import sys
import unicodedata
from pathlib import Path

from scripts.export_video_transcripts import DEFAULT_BACKUP, REPO, parse_vtt

OUT = REPO / "public" / "marcadores-video"
PRIVATE = REPO.parent / ".marcadores"
MIN_SECONDS = 3 * 3600
WINDOW = 90.0

CALL = re.compile(r"(?:competencia|competici[oó]n|cystadleuaeth)\s+(?:n[uú]mero|nro\.?|n[º°]|rhif)?\s*(\d{1,3})\b", re.I)
SKIP_BEFORE = re.compile(r"(preparando|prepar[aá]ndose|preparen|pr[oó]xima|veredicto|bredicto|resultados?|premios?|ganador|leer|leo)\W*(?:\w+\W+){0,6}$", re.I)
# Words after a call that mean a verdict or a call for later, not a start.
SKIP_AFTER = re.compile(r"veredicto|bredicto|jurado|premio|ganador|particip[oó]|hab[ií]an participado|que vayan|preparando|preparen", re.I)
# Disciplines judged off stage: their numbers are only ever heard in verdicts.
OFF_STAGE = re.compile(r"literatura|llenyddiaeth|prosa|poes[ií]a|barddoniaeth|traducci[oó]n|cyfieithu|artesan|gwaith llaw|artes visuales|celf|fotograf|cocina|coginio|dise[ñn]o|destrezas", re.I)
CEREMONY = {
    "corona": re.compile(r"ceremonia\W+(?:\w+\W+){0,4}(corona|coronaci[oó]n|coron)\b", re.I),
    "sillon": re.compile(r"ceremonia\W+(?:\w+\W+){0,4}(sill[oó]n|silla|cadair)\b", re.I),
    "medalla": re.compile(r"ceremonia\W+(?:\w+\W+){0,4}(medalla)\b", re.I),
    "gorsedd": re.compile(r"ceremonia\W+(?:\w+\W+){0,4}(gorsedd|gorse)\b", re.I),
}
CEREMONY_LABEL = {"corona": "Ceremonia de la Corona", "sillon": "Ceremonia del Sillón Bárdico",
                  "medalla": "Ceremonia de la Medalla de Plata", "gorsedd": "Ceremonia de la Gorsedd"}
STOP = set("para con por los las del una uno que sus este esta elección eleccion libre obra canción cancion "
           "hasta años anos voz solo a de la el y en o al hunanddewisiad agored".split())


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def programa_titles(md: str) -> dict[str, str]:
    """Competition number → its line in a programa transcription (without the final dot)."""
    out = {}
    for line in md.splitlines():
        m = re.match(r"^(\d{1,3})\.\s+(.*)$", line.strip())
        if m:
            out.setdefault(m.group(1), m.group(2).rstrip("."))
    return out


def programa_stage(md: str) -> set[str]:
    """Numbers of the competitions performed on stage (outside off-stage disciplines like literature or crafts)."""
    out, heading = set(), ""
    for line in md.splitlines():
        line = line.strip()
        if line.startswith("## "):
            heading = line[3:]
            continue
        m = re.match(r"^(\d{1,3})\.\s", line)
        if m and not OFF_STAGE.search(heading):
            out.add(m.group(1))
    return out


def keywords(title: str) -> set[str]:
    return {w for w in re.findall(r"\w{4,}", fold(re.sub(r"«[^»]*»", lambda m: m.group(0), title))) if w not in STOP}


def detect(cues: list[tuple[float, str]], titles: dict[str, str], stage_only: set[str] | None = None) -> list[dict]:
    """Markers {t, n, kind ("comp"|"ceremonia"), label, high, context} in time order, first start per competition."""
    out, seen = [], set()
    for i, (t, text) in enumerate(cues):
        for m in CALL.finditer(text):
            n = m.group(1).lstrip("0") or "0"
            if n in seen or n not in titles or (stage_only is not None and n not in stage_only):
                continue
            nxt = cues[i + 1][1] if i + 1 < len(cues) and cues[i + 1][0] - t <= 15 else ""
            after = (text[m.end():] + " " + nxt)[:160]
            if SKIP_BEFORE.search(text[: m.start()]) or SKIP_AFTER.search(after):
                continue
            near = " ".join(x for tt, x in cues[i:] if tt - t <= WINDOW)
            high = bool(keywords(titles[n]) & set(re.findall(r"\w{4,}", fold(near))))
            seen.add(n)
            out.append({"t": t, "n": n, "kind": "comp", "label": titles[n], "high": high, "context": near[:200]})
        for kind, rx in CEREMONY.items():
            if kind not in seen and rx.search(text):
                seen.add(kind)
                out.append({"t": t, "n": kind, "kind": "ceremonia", "label": CEREMONY_LABEL[kind], "high": True, "context": text[:200]})
    return sorted(out, key=lambda x: x["t"])


def cues_for(stem: Path) -> list[tuple[float, str]]:
    vtts = sorted(glob.glob(glob.escape(str(stem)) + ".*-orig.vtt"))
    if vtts:
        return [(float(t), s) for t, s in parse_vtt(Path(vtts[0]).read_text(encoding="utf-8"))]
    w = Path(f"{stem}.whisper.json")
    if w.exists():
        return [(float(s[0]), s[2]) for s in json.loads(w.read_text(encoding="utf-8"))["segments"]]
    return []


# A year that ran on an earlier programa with amendments: Chubut 2021 used the printed 2020
# programa, adapted. The archive's 2020 programa is the virtual "Eisteddfod Adre" (unnumbered),
# not that one, so 2021 has no base yet: add {2021: 2020} once the printed 2020 programa is in.
BASE_YEAR: dict[int, int] = {}


def merge_programa(own: list[str], base: list[str] | None = None) -> tuple[dict[str, str], set[str]]:
    """Titles and on-stage numbers from a year's transcriptions over its base year's; "(Suspendida)" removes one."""
    titles: dict[str, str] = {}
    stage: set[str] = set()
    for md in base or []:
        for n, t in programa_titles(md).items():
            titles.setdefault(n, t)
        stage |= programa_stage(md)
    mine: dict[str, str] = {}
    for md in own:
        for n, t in programa_titles(md).items():
            mine.setdefault(n, t)
        stage |= programa_stage(md)
    for n, t in mine.items():
        if "(Suspendida)" in t:
            titles.pop(n, None)
            stage.discard(n)
        else:
            titles[n] = t
    return titles, stage & set(titles)


def programa_for(year: int, catalog: list[dict]) -> tuple[dict[str, str], set[str]]:
    """The year's programa (and programa del día) transcriptions, over its base year's when it has one."""
    def texts(y: int) -> list[str]:
        out = []
        for cat in ("programa", "programa-del-dia"):
            for i in catalog:
                if i["festival"] == "chubut" and i.get("year") == y and i["category"] == cat:
                    p = REPO / "src" / "data" / "transcripciones" / f"{i['id']}.md"
                    if p.exists() and (t := p.read_text(encoding="utf-8")) not in out:
                        out.append(t)
        return out
    base = BASE_YEAR.get(year)
    return merge_programa(texts(year), texts(base) if base else None)


def main(backup: Path) -> None:
    root = REPO.parent
    rows = {r["video_id"]: r for r in csv.DictReader((root / "VIDEOS.tsv").open(encoding="utf-8"), delimiter="\t")}
    site = {v["id"]: v for v in json.loads((REPO / "src/data/videos.json").read_text(encoding="utf-8"))["videos"]}
    idx = {r["id"]: r for r in csv.DictReader((backup / "INDEX.tsv").open(encoding="utf-8"), delimiter="\t")}
    cat = json.loads((REPO / "src/data/catalog.json").read_text(encoding="utf-8"))
    catalog = cat["items"] if isinstance(cat, dict) else cat
    OUT.mkdir(parents=True, exist_ok=True)
    PRIVATE.mkdir(parents=True, exist_ok=True)
    for vid, v in sorted(site.items()):
        r = rows.get(vid)
        if v["festival"] != "chubut" or not r or not r["duration"] or int(r["duration"]) <= MIN_SECONDS or vid not in idx:
            continue
        titles, stage = programa_for(v["year"], catalog)
        cues = cues_for((backup / "videos" / idx[vid]["file"]).with_suffix(""))
        marks = detect(cues, titles, stage) if cues else []
        (PRIVATE / f"{vid}.json").write_text(json.dumps({"id": vid, "year": v["year"], "markers": marks}, ensure_ascii=False, indent=1), encoding="utf-8")
        pub = [[round(m["t"]), m["n"], m["label"], m["kind"]] for m in marks if m["high"]]
        p = OUT / f"{vid}.json"
        if pub:
            p.write_text(json.dumps({"auto": True, "markers": pub}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        elif p.exists():
            p.unlink()
        print(f"{v['year']} {vid}: {len(marks)} found, {len(pub)} published, programa {len(titles)} competitions")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BACKUP)
