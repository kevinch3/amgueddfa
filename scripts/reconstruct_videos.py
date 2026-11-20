"""Rebuild each video's text from all its sources (design: docs/superpowers/specs/
2026-11-20-reconstruccion-videos-design.md; procedure: the video-reconstruction skill).

  python3 -m scripts.reconstruct_videos --dry-run [--ids ID ...] [--limit N]
  python3 -m scripts.reconstruct_videos [--ids ID ...] [--limit N]

Per video: timed sources (YouTube, Whisper es, lyrics; Welsh once chosen) -> ~60 s windows
-> Claude (claude -p, Sonnet 5.5, the maintainer's subscription) -> checker -> rules
fallback for windows that fail -> data/reconstruccion/<id>.json (committed; the export
prefers it). Replies are cached privately in ../.reconstruccion/replies/<id>/<hash>.json,
so an unchanged window is never asked twice. Needs the backup disk mounted.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from scripts.align_lyrics import parse_letra, spans_for
from scripts.export_video_transcripts import DEFAULT_BACKUP, FESTIVALS
from scripts.reconstruct.checker import check_window
from scripts.reconstruct.context import video_context
from scripts.reconstruct.merge import merge, reply_lines, rules_lines
from scripts.reconstruct.model import MODEL, ModelError, ask as ask_claude
from scripts.reconstruct.sources import load_sources
from scripts.reconstruct.windows import make_windows, needs_model

REPO = Path(__file__).resolve().parent.parent
REPLIES = REPO.parent / ".reconstruccion" / "replies"
MAX_ERRORS_IN_A_ROW = 3


class TooManyErrors(Exception):
    """Claude failed this many windows in a row (usage limit, outage): stop instead of burning the run."""


def _backup_files(backup: Path) -> dict[str, str]:
    with (backup / "INDEX.tsv").open(newline="", encoding="utf-8") as f:
        return {r["id"]: r["file"] for r in csv.DictReader(f, delimiter="\t") if r.get("file")}


def _duration(stem: Path, lines: list) -> float:
    try:
        return float(json.loads(stem.with_name(f"{stem.name}.info.json").read_text(encoding="utf-8"))["duration"])
    except (OSError, ValueError, KeyError, TypeError):
        return max(l.t for l in lines) + 5


def in_scope(repo: Path, video: dict) -> bool:
    return video["festival"] in FESTIVALS and (repo / "public/transcripciones-video" / f"{video['id']}.json").exists()


def reconstruct_video(repo: Path, backup: Path, video: dict, ask=ask_claude, replies: Path = REPLIES,
                      state: dict | None = None, files: dict | None = None) -> dict | None:
    """Write data/reconstruccion/<id>.json for one video and return it; None when out of scope."""
    if not in_scope(repo, video):
        return None
    state = state if state is not None else {"streak": 0, "usd": 0.0, "asked": 0}
    files = files if files is not None else _backup_files(backup)
    if video["id"] not in files:
        return None
    stem = (backup / "videos" / files[video["id"]]).with_suffix("")
    letras = repo / "data" / "letras"
    lines = load_sources(stem, video["id"], letras)
    if not lines:
        return None
    windows = make_windows(lines, _duration(stem, lines), lambda a, b: video_context(repo, video, a, b))
    cache = replies / video["id"]
    counts = {"total": len(windows), "modelo": 0, "reglas": 0, "vacias": 0}
    per_window = []
    for w in windows:
        if not needs_model(w):
            counts["vacias"] += 1
            per_window.append(rules_lines(w))
            continue
        cached = cache / f"{w.hash}.json"
        reply = json.loads(cached.read_text(encoding="utf-8")) if cached.exists() else None
        if reply is None:
            try:
                reply = ask(w)
            except ModelError as e:
                state["streak"] += 1
                print(f"  {video['id']} {w.t0:g}s: {e}", file=sys.stderr)
                if state["streak"] >= MAX_ERRORS_IN_A_ROW:
                    raise TooManyErrors(str(e)) from e
                counts["reglas"] += 1
                per_window.append(rules_lines(w))
                continue
            state["streak"] = 0
            state["asked"] += 1
            state["usd"] += float(reply.get("_usd") or 0)
            cache.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(reply, ensure_ascii=False), encoding="utf-8")
        errors = check_window(w, reply)
        if errors:
            print(f"  {video['id']} {w.t0:g}s: rules ({errors[0]})", file=sys.stderr)
            counts["reglas"] += 1
            per_window.append(rules_lines(w))
        else:
            counts["modelo"] += 1
            per_window.append(reply_lines(reply))
    out_lines = merge(windows, per_window)
    letras_info = []
    for sp in spans_for(video["id"], letras):
        meta, _ = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        letras_info.append({"desde": sp["desde"], "hasta": sp["hasta"], "titulo": meta.get("titulo", ""),
                            "autor": meta.get("autor", ""), "idioma": meta.get("idioma", "")})
    result = {"src": "reconstruida", "lang": "es", "modelo": MODEL,
              "seg": [[l.t, l.text] for l in out_lines], "fuentes": [list(l.fuentes) for l in out_lines],
              **({"letras": letras_info} if letras_info else {}), "ventanas": counts}
    dest = repo / "data" / "reconstruccion" / f"{video['id']}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(result, ensure_ascii=False, indent=1) + "\n"
    if not dest.exists() or dest.read_text(encoding="utf-8") != body:
        dest.write_text(body, encoding="utf-8")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true", help="list the windows that would be asked, call nothing")
    ap.add_argument("--backup", default=str(DEFAULT_BACKUP))
    a = ap.parse_args()
    backup = Path(a.backup)
    if not (backup / "INDEX.tsv").exists():
        sys.exit(f"{backup}: no INDEX.tsv (backup disk not mounted?)")
    videos = [v for v in json.loads((REPO / "src/data/videos.json").read_text(encoding="utf-8"))["videos"] if in_scope(REPO, v)]
    if a.ids:
        videos = [v for v in videos if v["id"] in set(a.ids)]
    videos = videos[: a.limit] if a.limit else videos
    files = _backup_files(backup)
    if a.dry_run:
        total = 0
        for v in videos:
            if v["id"] not in files:
                continue
            stem = (backup / "videos" / files[v["id"]]).with_suffix("")
            lines = load_sources(stem, v["id"], REPO / "data" / "letras")
            if not lines:
                continue
            ws = make_windows(lines, _duration(stem, lines), lambda x, y: video_context(REPO, v, x, y))
            todo = [w for w in ws if needs_model(w) and not (REPLIES / v["id"] / f"{w.hash}.json").exists()]
            total += len(todo)
            print(f"{v['id']}  {v['title'][:60]}  windows {len(ws)}, to ask {len(todo)}")
        print(f"{len(videos)} video(s), {total} window(s) to ask")
        return 0
    state = {"streak": 0, "usd": 0.0, "asked": 0}
    sums = {"total": 0, "modelo": 0, "reglas": 0, "vacias": 0}
    done = 0
    try:
        for v in videos:
            res = reconstruct_video(REPO, backup, v, state=state, files=files)
            if res:
                done += 1
                for k in sums:
                    sums[k] += res["ventanas"][k]
                print(f"{v['id']}  {res['ventanas']}", flush=True)
    except TooManyErrors as e:
        print(f"stopped: {MAX_ERRORS_IN_A_ROW} model errors in a row ({e})", file=sys.stderr)
    print(f"{done} video(s); windows {sums}; asked {state['asked']}; "
          f"USD {state['usd']:.2f} equivalente API, cubierto por la suscripción")
    return 0


if __name__ == "__main__":
    sys.exit(main())
