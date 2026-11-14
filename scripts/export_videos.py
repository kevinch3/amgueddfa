"""Export the archive's VIDEOS.tsv (YouTube links) to src/data/videos.json for the site.

  python3 -m scripts.export_videos            # reads ../VIDEOS.tsv

Only the eisteddfodau the site has pages for, and only videos with a year. Thumbnails
are not committed: the site loads them from YouTube's image server.
"""
import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SLUGS = {
    "Eisteddfod_del_Chubut": "chubut",
    "Eisteddfod_de_la_Juventud": "juventud",
    "Eisteddfod_Mimosa": "mimosa",
    "Eisteddfod_de_Trevelin": "trevelin",
}
# Upload date alone is a weak guess for the edition year; the others come from the video itself.
INFERRED = {"subida"}


def export(tsv: Path, out: Path) -> int:
    with open(tsv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    videos = []
    for r in rows:
        slug = SLUGS.get(r["festival"])
        if not slug or not r["year"]:
            continue
        d = r.get("upload_date") or ""
        videos.append({
            "id": r["video_id"], "festival": slug, "year": int(r["year"]), "kind": r["kind"],
            "title": r["title"], "channel": r["channel"],
            "date": f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else "",
            "year_inferred": r["year_source"] in INFERRED,
        })
    videos.sort(key=lambda v: (v["festival"], v["year"], v["id"]))
    out.write_text(json.dumps({"videos": videos}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    return len(videos)


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / "VIDEOS.tsv"
    print(export(src, REPO / "src" / "data" / "videos.json"), "videos exported")
