"""Offline review of Welsh Whisper transcriptions (issue #32).

  python3 -m scripts.review_files prepare [N]     # first N of the worklist (default 24)

Writes one plain-text file per video for a Welsh-speaking reviewer to
../.transcripciones/revision-cy/<date>/ (private: the archive, never the repo),
plus a README and a zip to send. Each line is "m:ss | text" followed by a link
that opens the video at that moment. parse_review() reads a returned file back.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
import zipfile
from pathlib import Path

from scripts.export_video_transcripts import DEFAULT_BACKUP, REPO, clean_whisper

WORKLIST = REPO / "docs" / "research" / "2026-11-19-welsh-whisper-review.tsv"
OUT = REPO.parent / ".transcripciones" / "revision-cy"
DECISION = "PENDERFYNIAD / DECISIÓN: "
LINE = re.compile(r"^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*\|(.*)$")


def fmt(s: float) -> str:
    s = int(s)
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def review_text(meta: dict, seg: list) -> str:
    url = f"https://www.youtube.com/watch?v={meta['id']}"
    head = [
        f"FIDEO / VIDEO: {meta['id']}",
        f"Teitl / Título: {meta['title']}",
        f"{meta['year']} · {meta['kind']} · {meta['minutes']} min · {url}",
        "",
        DECISION,
        "  (iawn = cywir ar ôl golygu / corregida · geiriau = geiriau hysbys / letra conocida: «…» ·",
        "   dim = dim trawsgrifiad / sin transcripción)",
        "Adolygydd / Revisor: ",
        "",
        "----",
    ]
    body = [f"{fmt(t)} | {text}\n        {url}&t={int(t)}s" for t, text in seg]
    return "\n".join(head + body) + "\n"


def parse_review(text: str) -> dict:
    """A returned file: video id, the reviewer's decision, and the kept lines as [[seconds, text]] by time."""
    vid = re.search(r"^FIDEO / VIDEO:\s*(\S+)", text, re.M)
    dec = re.search(r"^" + re.escape(DECISION.strip()) + r"[ \t]*(.*)$", text, re.M)
    who = re.search(r"^Adolygydd / Revisor:[ \t]*(.*)$", text, re.M)
    seg = []
    for raw in text.splitlines():
        m = LINE.match(raw)
        if not m:
            continue
        h, mi, s, words = m.groups()
        words = words.strip()
        if words:
            seg.append([float(int(h or 0) * 3600 + int(mi) * 60 + int(s)), words])
    seg.sort(key=lambda x: x[0])
    return {"id": vid.group(1) if vid else "", "decision": (dec.group(1).strip() if dec else ""),
            "reviewer": (who.group(1).strip() if who else ""), "seg": seg}


README = """ADOLYGU TRAWSGRIFIADAU CYMRAEG · REVISAR TRANSCRIPCIONES EN GALÉS
Amgueddfa Eisteddfod y Wladfa (amgueddfa.org) · {n} fideo / videos · {date}

Cymraeg
Peiriant (Whisper) a ysgrifennodd y testun hwn wrth wrando ar y fideo. Mae'n aml yn anghywir.
Ar gyfer pob ffeil:
1. Agorwch y ddolen o dan bob llinell: mae'r fideo'n dechrau ar yr eiliad honno.
2. Cywirwch y testun AR ÔL y "|". Peidiwch â newid yr amser o'i flaen.
3. Llinell heb eiriau go iawn: dilëwch y testun ar ôl "|" (gadewch yr amser).
4. Geiriau ar goll: ychwanegwch linell newydd, "m:ss | testun", unrhyw le.
5. Rhannau na ellir eu deall: [aneglur]. Sbaeneg: gadewch hi fel y mae.
6. Llenwch PENDERFYNIAD: iawn · geiriau «teitl» (cân neu emyn hysbys) · dim.
7. Ysgrifennwch eich enw wrth Adolygydd (bydd yn ymddangos ar y wefan).

Castellano
Este texto lo escribió una máquina (Whisper) escuchando el video. Suele estar mal.
En cada archivo:
1. Abrí el enlace debajo de cada línea: el video empieza en ese momento.
2. Corregí el texto DESPUÉS de "|". No cambies la hora de adelante.
3. Línea sin palabras reales: borrá el texto después de "|" (dejá la hora).
4. Faltan palabras: agregá una línea nueva "m:ss | texto", en cualquier lugar.
5. Partes que no se entienden: [aneglur]. Lo que está en castellano: dejalo como está.
6. Completá DECISIÓN: iawn (corregida) · geiriau «título» (canción o himno conocido) · dim (sin transcripción).
7. Poné tu nombre en Revisor (aparece en el sitio).

Ffeiliau / Archivos (pwysicaf yn gyntaf / los más importantes primero):
{files}
"""


def prepare(n: int = 24, backup: Path = DEFAULT_BACKUP) -> Path:
    rows = list(csv.DictReader(WORKLIST.open(encoding="utf-8"), delimiter="\t"))[:n]
    with (backup / "INDEX.tsv").open(newline="", encoding="utf-8") as f:
        files = {r["id"]: r["file"] for r in csv.DictReader(f, delimiter="\t")}
    date = dt.date.today().isoformat()
    out = OUT / date
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for i, r in enumerate(rows, 1):
        w = (backup / "videos" / files[r["id"]]).with_suffix(".whisper.json")
        seg = clean_whisper(json.loads(w.read_text(encoding="utf-8"))["segments"])
        meta = {"id": r["id"], "title": r["title"], "year": r["year"], "kind": r["kind"], "minutes": r["min"]}
        name = f"{i:02d}_{r['year']}_{r['kind']}_{r['id']}.txt"
        (out / name).write_text(review_text(meta, seg), encoding="utf-8")
        names.append(f"  {name}  ({r['min']} min) {r['title'][:70]}")
    (out / "README.txt").write_text(README.format(n=len(rows), date=date, files="\n".join(names)), encoding="utf-8")
    z = OUT / f"adolygu-cymraeg-{date}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out.iterdir()):
            zf.write(p, f"adolygu-cymraeg/{p.name}")
    return z


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "prepare":
        sys.exit(__doc__)
    print(prepare(int(sys.argv[2]) if len(sys.argv) > 2 else 24))
