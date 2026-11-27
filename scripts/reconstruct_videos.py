"""Rebuild each video's text from all its sources (design: docs/superpowers/specs/
2026-11-20-reconstruccion-videos-design.md; procedure: the video-reconstruction skill).

  python3 -m scripts.reconstruct_videos --dry-run [--ids ID ...] [--limit N]
  python3 -m scripts.reconstruct_videos [--ids ID ...] [--limit N] [--jobs N]

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
import os
import subprocess
import threading
import time
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from scripts.align_lyrics import lyric_info, parse_letra, spans_for
from scripts.export_video_transcripts import DEFAULT_BACKUP, FESTIVALS, fix_eisteddfod, spanish_words
from scripts.reconstruct.checker import check_window
from scripts.reconstruct.context import tokens, video_context
from scripts.reconstruct.merge import merge, reply_lines, rules_lines
from scripts.reconstruct.model import MODEL, ModelError, ask as ask_claude
from scripts.reconstruct.sources import WELSH_SOURCE, has_mezcla, load_sources
from scripts.reconstruct.windows import make_windows, needs_model

REPO = Path(__file__).resolve().parent.parent
REPLIES = REPO.parent / ".reconstruccion" / "replies"
MAX_ERRORS_IN_A_ROW = 3


class TooManyErrors(Exception):
    """Claude failed this many windows in a row (usage limit, outage): stop instead of burning the run."""


def _backup_files(backup: Path) -> dict[str, str]:
    with (backup / "INDEX.tsv").open(newline="", encoding="utf-8") as f:
        return {r["id"]: r["file"] for r in csv.DictReader(f, delimiter="\t") if r.get("file")}


def _fallback(w, fix_text: Callable[[str], str], mezcla: bool = False) -> list:
    """Rules lines, with the same spelling fixes the export gives automatic text ("Stedbot" -> "Eisteddfod")."""
    return [l if "letra" in l.fuentes else l._replace(text=fix_text(l.text)) for l in rules_lines(w, mezcla=mezcla)]


def _duration(stem: Path, lines: list) -> float:
    try:
        return float(json.loads(stem.with_name(f"{stem.name}.info.json").read_text(encoding="utf-8"))["duration"])
    except (OSError, ValueError, KeyError, TypeError):
        return max(l.t for l in lines) + 5


def _ask_all(ask, ws: list, jobs: int) -> list:
    """Each window's reply, or the ModelError it raised; up to `jobs` windows asked at once."""
    def one(w):
        try:
            return ask(w)
        except ModelError as e:
            return e
    if jobs <= 1 or len(ws) <= 1:
        return [one(w) for w in ws]
    with ThreadPoolExecutor(min(jobs, len(ws))) as ex:
        return list(ex.map(one, ws))


def in_scope(repo: Path, video: dict, stem: Path | None = None) -> bool:
    """Chubut and Trevelin only (#29), with a published transcript, a Welsh one to build from, or a lyric
    the maintainer placed in it (a choir clip with no automatic text still shows its lyrics, #129)."""
    if video["festival"] not in FESTIVALS:
        return False
    if (repo / "public/transcripciones-video" / f"{video['id']}.json").exists():
        return True
    if spans_for(video["id"], repo / "data" / "letras"):
        return True
    return bool(stem and WELSH_SOURCE and stem.with_name(f"{stem.name}.{WELSH_SOURCE}.json").exists())


def _write(path: Path, data: bytes) -> None:
    """Whole or nothing: another process (--jobs, a second run) never reads half a reply."""
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _readable(path: Path) -> bool:
    """Whether a cache file holds a reply. One that does not parse (and is not being written right now) is
    removed, so the window is asked again instead of crashing the run."""
    try:
        json.loads(path.read_text(encoding="utf-8"))
        return True
    except OSError:
        return False
    except ValueError:
        try:
            if time.time() - path.stat().st_mtime > 10:
                path.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def _safe_copy(w, path: Path) -> bool:
    """A reply cached under another key may be reused under w.hash only if its fixes need no name the window's
    context leaves out: w.hash ignores those facts, so correcting one later would strand the reply on rules."""
    try:
        reply = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    dropped = w.full_words - w.context.words
    return not any(t in dropped for line in reply.get("lines", []) for fx in line.get("fixes", [])
                   for t in tokens(fx.get("to", "")))


def cached_reply(cache: Path, w) -> Path | None:
    """The cached reply for a window: under its key, or under the key used before facts were filtered
    per window (copied to the new key on first use, so later fact changes never strand it)."""
    path = cache / f"{w.hash}.json"
    if path.exists() and _readable(path):
        return path
    old = cache / f"{w.legacy}.json" if w.legacy else None
    if old is not None and old != path and old.exists() and _readable(old) and _safe_copy(w, old):
        _write(path, old.read_bytes())
        return path
    return None


def would_reuse(cache: Path, w) -> bool:
    """What a run would find cached for this window (the dry-run count), without copying anything."""
    path, old = cache / f"{w.hash}.json", cache / f"{w.legacy}.json" if w.legacy else None
    if path.exists():
        return True
    return old is not None and old.exists() and _safe_copy(w, old)


def migrate_from(old: list, new: list, cache: Path) -> int:
    """Replies cached under an older facts revision's whole-context key, copied to the current key where the
    window's filtered context (what the model sees) is the same. The number copied."""
    n = 0
    for o, w in zip(old, new):
        if (o.t0, o.t1) == (w.t0, w.t1) and o.hash == w.hash and needs_model(w) and o.legacy \
                and not (cache / f"{w.hash}.json").exists() and (cache / f"{o.legacy}.json").exists() \
                and _readable(cache / f"{o.legacy}.json") and _safe_copy(w, cache / f"{o.legacy}.json"):
            _write(cache / f"{w.hash}.json", (cache / f"{o.legacy}.json").read_bytes())
            n += 1
    return n


def migrate_cache(windows: list, cache: Path) -> int:
    """Copy replies cached under the legacy key to the current one; the number copied (no model call).
    Run once over the archive after the keys changed, before any new fact changes the legacy keys too."""
    n = 0
    for w in windows:
        if not (needs_model(w) and w.legacy and w.legacy != w.hash):
            continue
        new = cache / f"{w.hash}.json"
        if new.exists() and not _safe_copy(w, new):
            new.unlink()  # copied by an earlier migration before copies were checked: ask it again
        elif not new.exists() and (cache / f"{w.legacy}.json").exists() and cached_reply(cache, w):
            n += 1
    return n


FACTS = "data/approved/contributions.json"


def _facts_revisions(n: int = 60) -> list[list]:
    """The approved facts as the last n commits of the snapshot had them (the export bot commits often)."""
    out = []
    shas = subprocess.run(["git", "-C", str(REPO), "log", f"-n{n}", "--format=%H", "--", FACTS],
                          capture_output=True, text=True).stdout.split()
    for sha in shas:
        cp = subprocess.run(["git", "-C", str(REPO), "show", f"{sha}:{FACTS}"], capture_output=True, text=True)
        if cp.returncode == 0:
            try:
                out.append(json.loads(cp.stdout))
            except ValueError:
                pass
    return out


def _edition_versions(revs: list[list], video: dict) -> list[list]:
    """The distinct fact lists an edition had across revisions, other than today's."""
    from scripts.reconstruct.context import FACT_FIELDS
    sig = lambda facts: tuple(sorted((c["payload"]["field"], c["payload"]["value"]) for c in facts
                                     if c.get("type") == "fact" and c.get("festival") == video["festival"]
                                     and str(c.get("year")) == str(video["year"]) and (c.get("payload") or {}).get("field") in FACT_FIELDS
                                     and c.get("status", "approved") == "approved"))
    now = sig(json.loads((REPO / FACTS).read_text(encoding="utf-8")))
    seen, out = {now}, []
    for facts in revs:
        k = sig(facts)
        if k not in seen:
            seen.add(k)
            out.append(facts)
    return out


def reconstruct_video(repo: Path, backup: Path, video: dict, ask=ask_claude, replies: Path = REPLIES,
                      state: dict | None = None, files: dict | None = None,
                      fix_text: Callable[[str], str] = lambda s: s, jobs: int = 1) -> dict | None:
    """Write data/reconstruccion/<id>.json for one video and return it; None when out of scope.
    jobs > 1 asks that many uncached windows at once (the replies are the same; only the wait is shorter)."""
    if video["festival"] not in FESTIVALS:
        return None
    state = state if state is not None else {"streak": 0, "usd": 0.0, "asked": 0}
    files = files if files is not None else _backup_files(backup)
    if video["id"] not in files:
        return None
    stem = (backup / "videos" / files[video["id"]]).with_suffix("")
    if not in_scope(repo, video, stem):
        return None
    letras = repo / "data" / "letras"
    mezcla = has_mezcla(stem)
    lines = load_sources(stem, video["id"], letras)
    if not lines:
        return None
    windows = make_windows(lines, _duration(stem, lines), lambda a, b: video_context(repo, video, a, b))
    cache = replies / video["id"]
    counts = {"total": len(windows), "modelo": 0, "reglas": 0, "vacias": 0}
    per_window = []
    fresh: dict = {}  # hash -> reply or ModelError, asked but not yet used

    def ask_from(i: int) -> None:
        """Ask the next `jobs` uncached windows from windows[i] on; cache each reply as it comes."""
        batch, seen = [], set()
        for x in windows[i:]:
            if len(batch) == jobs:
                break
            if needs_model(x) and x.hash not in seen and x.hash not in fresh and not cached_reply(cache, x):
                seen.add(x.hash)
                batch.append(x)
        for x, r in zip(batch, _ask_all(ask, batch, jobs)):
            fresh[x.hash] = r
            if not isinstance(r, ModelError):
                state["asked"] += 1
                state["usd"] += float(r.get("_usd") or 0)
                cache.mkdir(parents=True, exist_ok=True)
                _write(cache / f"{x.hash}.json", json.dumps(r, ensure_ascii=False).encode("utf-8"))

    for i, w in enumerate(windows):
        if not needs_model(w):
            counts["vacias"] += 1
            per_window.append([])  # music or applause only: nothing to publish
            continue
        reply = fresh.pop(w.hash, None)
        asked_now = reply is not None  # only a reply asked in this run ends a run of model errors
        cached = cached_reply(cache, w) if reply is None else None
        if cached is not None:
            reply = json.loads(cached.read_text(encoding="utf-8"))
        if reply is None:
            ask_from(i)
            reply, asked_now = fresh.pop(w.hash), True
        if isinstance(reply, ModelError):
            state["streak"] += 1
            print(f"  {video['id']} {w.t0:g}s: {reply}", file=sys.stderr)
            if state["streak"] >= MAX_ERRORS_IN_A_ROW:
                raise TooManyErrors(str(reply)) from reply
            counts["reglas"] += 1
            per_window.append(_fallback(w, fix_text, mezcla))
            continue
        if asked_now:
            state["streak"] = 0
        errors = check_window(w, reply)
        if errors:
            print(f"  {video['id']} {w.t0:g}s: rules ({errors[0]})", file=sys.stderr)
            counts["reglas"] += 1
            per_window.append(_fallback(w, fix_text, mezcla))
        else:
            counts["modelo"] += 1
            per_window.append(reply_lines(reply))
    out_lines = merge(windows, per_window)
    letras_info = []
    for sp in spans_for(video["id"], letras):
        meta, _ = parse_letra((letras / f"{sp['letra']}.md").read_text(encoding="utf-8"))
        letras_info.append(lyric_info(sp, meta))
    spoken = Counter(l.lang for l in lines if l.src != "letra")
    result = {"src": "reconstruida", "lang": spoken.most_common(1)[0][0] if spoken else "es", "modelo": MODEL,
              "seg": [[l.t, l.text] for l in out_lines], "fuentes": [list(l.fuentes) for l in out_lines],
              **({"mezcla": True} if mezcla else {}),
              **({"letras": letras_info} if letras_info else {}), "ventanas": counts}
    dest = repo / "data" / "reconstruccion" / f"{video['id']}.json"
    if not out_lines:
        # Nothing survived: write no reconstruction, so the export keeps today's transcript
        # and the run summary lists the video for a person to look at.
        dest.unlink(missing_ok=True)
        return result
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(result, ensure_ascii=False, indent=1) + "\n"
    if not dest.exists() or dest.read_text(encoding="utf-8") != body:
        dest.write_text(body, encoding="utf-8")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--ids-file", help="file with video ids (whitespace-separated); ids may start with '-'")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--jobs", type=int, default=1, help="windows asked at once (claude -p calls in parallel)")
    ap.add_argument("--dry-run", action="store_true", help="list the windows that would be asked, call nothing")
    ap.add_argument("--migrate-cache", action="store_true",
                    help="copy replies cached under the pre-2026-11-26 keys to the per-window keys, call nothing")
    ap.add_argument("--backup", default=str(DEFAULT_BACKUP))
    a = ap.parse_args()
    backup = Path(a.backup)
    if not (backup / "INDEX.tsv").exists():
        sys.exit(f"{backup}: no INDEX.tsv (backup disk not mounted?)")
    files = _backup_files(backup)
    stem_of = lambda v: (backup / "videos" / files[v["id"]]).with_suffix("") if v["id"] in files else None
    videos = [v for v in json.loads((REPO / "src/data/videos.json").read_text(encoding="utf-8"))["videos"]
              if in_scope(REPO, v, stem_of(v))]
    wanted = set(a.ids or []) | (set(Path(a.ids_file).read_text().split()) if a.ids_file else set())
    if wanted:
        videos = [v for v in videos if v["id"] in wanted]
    videos = videos[: a.limit] if a.limit else videos
    if a.migrate_cache:
        revs = _facts_revisions()
        copied = 0
        for v in videos:
            if v["id"] not in files:
                continue
            stem = (backup / "videos" / files[v["id"]]).with_suffix("")
            lines = load_sources(stem, v["id"], REPO / "data" / "letras")
            if not lines:
                continue
            dur = _duration(stem, lines)
            now = make_windows(lines, dur, lambda x, y: video_context(REPO, v, x, y))
            copied += migrate_cache(now, REPLIES / v["id"])
            for facts in _edition_versions(revs, v):  # replies cached while the edition had other facts
                old = make_windows(lines, dur, lambda x, y, f=facts: video_context(REPO, v, x, y, facts=f))
                copied += migrate_from(old, now, REPLIES / v["id"])
        print(f"{len(videos)} video(s), {copied} cached repl(ies) copied to their per-window keys")
        return 0
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
            todo = [w for w in ws if needs_model(w) and not would_reuse(REPLIES / v["id"], w)]
            total += len(todo)
            print(f"{v['id']}  {v['title'][:60]}  windows {len(ws)}, to ask {len(todo)}")
        print(f"{len(videos)} video(s), {total} window(s) to ask")
        return 0
    words = spanish_words()
    fix = lambda text: fix_eisteddfod(text, words)
    state = {"streak": 0, "usd": 0.0, "asked": 0}
    empty: list[str] = []
    sums = {"total": 0, "modelo": 0, "reglas": 0, "vacias": 0}
    done = 0
    try:
        for v in videos:
            res = reconstruct_video(REPO, backup, v, state=state, files=files, fix_text=fix, jobs=a.jobs)
            if res and not res["seg"]:
                empty.append(v["id"])
            if res:
                done += 1
                for k in sums:
                    sums[k] += res["ventanas"][k]
                print(f"{v['id']}  {res['ventanas']}", flush=True)
    except TooManyErrors as e:
        print(f"stopped: {MAX_ERRORS_IN_A_ROW} model errors in a row ({e})", file=sys.stderr)
    print(f"{done} video(s); windows {sums}; asked {state['asked']}; "
          f"USD {state['usd']:.2f} equivalente API, cubierto por la suscripción")
    if empty:
        print(f"sin texto (no file written, today's transcript stays): {' '.join(empty)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
