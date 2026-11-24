#!/usr/bin/env python3
"""Private backup of every listed video, at medium quality (360p).

Never published. It lets a video be restored, or at least watched by an admin,
if it disappears from YouTube. Runs once a month (systemd user timer,
see docs/backup.md); stdlib only, plus the yt-dlp program.

The backup root holds:

    README.md          what this is and how to restore (a copy of docs/backup.md)
    INDEX.tsv          one row per video: where its file is and its state
    removed.tsv        videos deleted on request; never downloaded again
    lists/             extra lists (VIDEOS.tsv from the archive)
    videos/<Festival>/<year>/<year>_<code>_<title>_<id>.mp4  (+ .info.json, .vtt)
    logs/YYYY-MM.log, status.json

Commands:
    videos.py run      [--root R] [--max-new N] [--check]   download what is new
    videos.py find     QUERY                                id, code or words
    videos.py remove   ID --reason TEXT                     delete on request
    videos.py index                                         rebuild INDEX.tsv only
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_ROOT = Path(os.environ.get('AMG_BACKUP_ROOT', '/run/media/kevinch3/4eff8b2b-61f1-4df2-bb61-5f9ba0faa94d/amgueddfa-backup'))
SITE_LIST = 'https://raw.githubusercontent.com/kevinch3/amgueddfa-eisteddfod/main/src/data/videos.json'
# monthly.sh points these at a private, self-updated yt-dlp and deno (YouTube needs a JS runtime).
YTDLP = os.environ.get('YTDLP', 'yt-dlp')
JS_RUNTIME = ['--js-runtimes', os.environ['YTDLP_JS']] if os.environ.get('YTDLP_JS') else []
# 360p H.264 + AAC in one mp4: plays everywhere; ~0.3 GB per hour.
FORMAT = 'bv*[height<=360][vcodec^=avc1]+ba[ext=m4a]/b[height<=360]/bv*[height<=480]+ba/b'

# Site slugs → the archive's folder names (VIDEOS.tsv already uses the folder names).
FOLDERS = {
    'chubut': 'Eisteddfod_del_Chubut',
    'juventud': 'Eisteddfod_de_la_Juventud',
    'mimosa': 'Eisteddfod_Mimosa',
    'trevelin': 'Eisteddfod_de_Trevelin',
}
CODE = re.compile(r'\[([A-Z]{2}\d{7})\]')
INDEX_COLS = ['id', 'festival', 'year', 'kind', 'code', 'title', 'channel', 'file', 'bytes', 'duration', 'captions',
              'status', 'checked']
# Captions: YouTube's automatic transcription in the language it detected (es-orig, but
# also e.g. uk-orig when it mishears Welsh singing), its Spanish version, and subtitles
# someone uploaded. Short songs often have none at all ('none': a job for Whisper later).
SUB_LANGS = '.*-orig,es'
CAPTION_STATES = ('yes', 'whisper', 'no_speech', 'none', 'missing')
MAX_FAILS_IN_A_ROW = 5
STATUSES = ('ok', 'missing', 'gone_kept', 'gone_lost', 'error', 'removed')


@dataclass
class Video:
    id: str
    festival: str  # archive folder name
    year: int | None
    kind: str = ''
    title: str = ''
    channel: str = ''
    sources: set[str] = field(default_factory=set)


# --- pure helpers (tested in tests/test_backup_videos.py) --------------------

def slug(text: str, limit: int = 40) -> str:
    """ASCII, lowercase, dashes: 'Corona: Griselda Jones' → 'corona-griselda-jones'."""
    text = CODE.sub('', text)
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    text = re.sub(r'[^a-zA-Z0-9]+', '-', text).strip('-').lower()
    return text[:limit].rstrip('-') or 'video'


def code_of(title: str) -> str:
    """The competition code in a title ('[CH2012006] …' → 'CH2012006'), or ''."""
    m = CODE.search(title)
    return m.group(1) if m else ''


def rel_path(v: Video) -> Path:
    """Where a video lives under videos/: sorted by festival, year, then code."""
    year = str(v.year) if v.year else 'sin_fecha'
    tag = code_of(v.title) or (v.kind or 'video')
    return Path(v.festival) / year / f'{year}_{tag}_{slug(v.title)}_{v.id}.mp4'


def merge(*lists: list[Video]) -> dict[str, Video]:
    """One entry per video id; the first list wins, later ones fill blanks."""
    out: dict[str, Video] = {}
    for lst in lists:
        for v in lst:
            have = out.get(v.id)
            if not have:
                out[v.id] = v
                continue
            have.sources |= v.sources
            have.year = have.year or v.year
            for f in ('kind', 'title', 'channel'):
                if not getattr(have, f):
                    setattr(have, f, getattr(v, f))
    return out


def from_site(data: dict) -> list[Video]:
    out = []
    for x in data.get('videos', []):
        out.append(Video(x['id'], FOLDERS.get(x.get('festival', ''), x.get('festival') or 'otros'), x.get('year'),
                         x.get('kind', ''), x.get('title', ''), x.get('channel', ''), {'site'}))
    return out


def from_tsv(path: Path) -> list[Video]:
    out = []
    with path.open(newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            vid = (r.get('video_id') or r.get('id') or '').strip()
            if not vid:
                continue
            y = (r.get('year') or '').strip()
            out.append(Video(vid, (r.get('festival') or 'otros').strip(), int(y) if y.isdigit() else None,
                             r.get('kind', ''), r.get('title', ''), r.get('channel', ''), {path.name}))
    return out


def may_download(v: Video, allowed: set[str] | None) -> bool:
    """Only channels with permission (channels.txt) are downloaded; without the file, all are."""
    return allowed is None or v.channel in allowed


def next_status(has_file: bool, upstream: bool | None, removed: bool, failed: bool = False, prev: str = '') -> str:
    """A video's state after a run.

    upstream: True = on YouTube, False = gone, None = not checked this run (the
    last verdict about YouTube then stands). failed: a download was tried and
    did not produce a file.
    """
    if removed:
        return 'removed'
    gone = upstream is False or (upstream is None and prev in ('gone_kept', 'gone_lost'))
    if has_file:
        return 'gone_kept' if gone else 'ok'
    if gone:
        return 'gone_lost'
    return 'error' if failed else 'missing'


# --- I/O --------------------------------------------------------------------

def now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class Log:
    def __init__(self, root: Path):
        (root / 'logs').mkdir(parents=True, exist_ok=True)
        self.f = (root / 'logs' / f'{datetime.now():%Y-%m}.log').open('a', encoding='utf-8')

    def __call__(self, msg: str) -> None:
        line = f'{now()} {msg}'
        print(line, flush=True)
        self.f.write(line + '\n')
        self.f.flush()


def read_channels(root: Path) -> set[str] | None:
    """channels.txt: one YouTube channel name per line (# comments). None = every channel
    (no file, or a line with just '*')."""
    p = root / 'channels.txt'
    if not p.exists():
        return None
    names = {s for line in p.read_text(encoding='utf-8').splitlines() if (s := line.split('#', 1)[0].strip())}
    return None if '*' in names else names


def caption_state(dest: Path) -> str:
    """'yes' = YouTube's transcription is saved; 'whisper' = none on YouTube, one
    generated by Whisper is saved (not checked); 'no_speech' = Whisper found no words
    (instrumental, dance); 'none' = YouTube has no transcription and Whisper has not
    run; 'missing' = YouTube has one, not saved yet."""
    vtts = list(dest.parent.glob(glob_escape(dest.stem) + '.*.vtt'))
    if any(not v.name.endswith('-whisper.vtt') for v in vtts):
        return 'yes'
    if vtts:
        return 'whisper'
    if dest.with_suffix('.whisper.json').exists():
        return 'no_speech'
    try:
        d = json.loads(dest.with_suffix('.info.json').read_text())
    except (OSError, ValueError):
        return 'missing'
    return 'missing' if caption_langs(d) else 'none'


def caption_langs(info: dict) -> list[str]:
    """The transcriptions YouTube has for a video, as yt-dlp language codes: subtitles
    someone uploaded (any language, e.g. es-419, en-GB) and the automatic one in the
    detected language (es-orig, uk-orig…). The chat replay of a live stream
    ('live_chat') is not a transcription."""
    uploaded = [k for k in (info.get('subtitles') or {}) if k != 'live_chat']
    auto = [k for k in (info.get('automatic_captions') or {}) if k.endswith('-orig')]
    return uploaded + auto


def glob_escape(name: str) -> str:
    return re.sub(r'([\[\]*?])', r'[\1]', name)


def read_removed(root: Path) -> dict[str, str]:
    p = root / 'removed.tsv'
    if not p.exists():
        return {}
    with p.open(encoding='utf-8') as f:
        return {r['id']: r.get('reason', '') for r in csv.DictReader(f, delimiter='\t')}


def read_index(root: Path) -> dict[str, dict]:
    p = root / 'INDEX.tsv'
    if not p.exists():
        return {}
    with p.open(encoding='utf-8') as f:
        return {r['id']: r for r in csv.DictReader(f, delimiter='\t')}


def write_index(root: Path, rows: list[dict]) -> None:
    # Years are ints from this run and strings from INDEX.tsv: compare them as text.
    rows.sort(key=lambda r: (r['festival'], str(r['year'] or '9999'), r['code'] or '~', r['id']))
    tmp = root / 'INDEX.tsv.tmp'
    with tmp.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, INDEX_COLS, delimiter='\t', extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    tmp.replace(root / 'INDEX.tsv')


def load_lists(root: Path, log: Log) -> dict[str, Video]:
    lists: list[list[Video]] = []
    (root / 'lists').mkdir(parents=True, exist_ok=True)
    for p in sorted((root / 'lists').glob('*.tsv')):
        lists.append(from_tsv(p))
    try:
        with urllib.request.urlopen(SITE_LIST, timeout=30) as r:
            site = from_site(json.load(r))
        (root / 'lists' / 'site-videos.json').write_text(json.dumps({'videos': [v.__dict__ | {'sources': sorted(v.sources)} for v in site]}, ensure_ascii=False))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        log(f'site list unreachable ({e}); using the last copy')
        cached = root / 'lists' / 'site-videos.json'
        site = from_site(json.loads(cached.read_text())) if cached.exists() else []
    return merge(*lists, site)


def on_youtube(vid: str) -> bool | None:
    """Cheap availability check (oEmbed): False only when YouTube says the video is gone."""
    url = f'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={vid}'
    try:
        with urllib.request.urlopen(url, timeout=20):
            return True
    except urllib.error.HTTPError as e:
        return False if e.code in (400, 401, 403, 404) else None
    except (urllib.error.URLError, TimeoutError):
        return None


def download(v: Video, dest: Path, log: Log) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    stem = str(dest.with_suffix(''))
    cmd = [YTDLP, '--no-update', '--no-progress', '--quiet', '--no-warnings', *JS_RUNTIME,
           '-f', FORMAT, '--merge-output-format', 'mp4',
           # Captions are a bonus (for markers later): YouTube rate-limits them (429), so pause
           # between them and never lose the video over one (--ignore-errors). Welsh auto
           # captions are only a machine translation of the Spanish ones: not worth a request.
           '--write-info-json', '--write-auto-subs', '--write-subs', '--sub-langs', SUB_LANGS, '--sub-format', 'vtt',
           '--sleep-subtitles', '3', '--ignore-errors',
           '--sleep-requests', '1', '--sleep-interval', '5', '--max-sleep-interval', '15',
           # One name for the video and its .info.json / .<lang>.vtt companions.
           '-o', f'{stem}.%(ext)s',
           f'https://www.youtube.com/watch?v={v.id}']
    r = subprocess.run(cmd, capture_output=True, text=True)
    # YouTube now and then refuses the signed stream URL (HTTP 403) of a video that is
    # fine: a fresh request gets new URLs and works (seen 2026-11-18, 8 of ~190).
    # yt-dlp does not retry a 403 itself, so try once more after a pause.
    if (r.returncode != 0 or not dest.exists()) and '403' in (r.stderr or ''):
        time.sleep(30)
        r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not dest.exists():
        log(f'error {v.id}: {(r.stderr or r.stdout).strip().splitlines()[-1:] or "no file"}')
        global LAST_SIGNIN
        LAST_SIGNIN = needs_signin(r.stderr or '')
        return False
    return True


LAST_SIGNIN = False


def needs_signin(stderr: str) -> bool:
    """A video gated behind a sign-in (YouTube: "Please sign in"), not a broken yt-dlp.

    Such videos go to lists/signin.txt for a run with the user's own cookies; they
    must not count towards the "failed in a row" stop.
    """
    return 'Please sign in' in stderr


def fetch_captions(v: Video, dest: Path) -> bool:
    """Captions only, for a saved video whose captions were not saved (YouTube's 429)."""
    try:
        langs = caption_langs(json.loads(dest.with_suffix('.info.json').read_text()))
    except (OSError, ValueError):
        langs = []
    cmd = [YTDLP, '--no-update', '--no-progress', '--quiet', '--no-warnings', *JS_RUNTIME,
           '--skip-download', '--write-auto-subs', '--write-subs',
           '--sub-langs', ','.join(re.escape(x) for x in langs) or SUB_LANGS,
           '--sub-format', 'vtt', '--sleep-subtitles', '5', '--sleep-requests', '1',
           '-o', f"{dest.with_suffix('')}.%(ext)s", f'https://www.youtube.com/watch?v={v.id}']
    subprocess.run(cmd, capture_output=True, text=True)
    return caption_state(dest) == 'yes'


def info_duration(dest: Path) -> str:
    p = dest.with_suffix('.info.json')
    try:
        return str(int(json.loads(p.read_text()).get('duration') or 0))
    except (OSError, ValueError):
        return ''


# --- commands ---------------------------------------------------------------

def cmd_run(root: Path, max_new: int | None, check: bool) -> int:
    log = Log(root)
    if not shutil.which(YTDLP):
        log(f'{YTDLP} not found')
        return 2
    videos = load_lists(root, log)
    allowed = read_channels(root)
    if allowed is not None:
        log(f'channels.txt: downloading only from {sorted(allowed)}')
    removed = read_removed(root)
    old = read_index(root)
    log(f'start: {len(videos)} videos listed, {len(removed)} removed on request, check={check}')
    rows, new, failed, streak, stopped = [], 0, 0, 0, False
    subs_streak, subs_stopped = 0, False
    for v in sorted(videos.values(), key=lambda v: (v.festival, v.year or 9999, v.id)):
        prev = old.get(v.id, {})
        dest = root / 'videos' / (prev.get('file') or rel_path(v))
        is_removed = v.id in removed
        has = dest.exists() and not is_removed
        upstream: bool | None = None
        tried_and_failed = False
        if not is_removed and not has and not stopped and may_download(v, allowed) and (max_new is None or new < max_new):
            upstream = on_youtube(v.id)
            if upstream is not False:
                new += 1
                has = download(v, dest, log)
                tried_and_failed = not has
                failed += tried_and_failed
                streak = (streak if LAST_SIGNIN else streak + 1) if tried_and_failed else 0
                if streak >= MAX_FAILS_IN_A_ROW:
                    # Every download failing means yt-dlp is out of date or YouTube is
                    # blocking us: stop instead of hammering it; tomorrow's run retries.
                    stopped = True
                    log(f'{streak} downloads failed in a row: stopping (yt-dlp probably out of date)')
                if has:
                    upstream = True
                    log(f'saved {dest.relative_to(root)}')
        elif check and has:
            upstream = on_youtube(v.id)
            time.sleep(0.5)
        caps = caption_state(dest) if has else ''
        if caps == 'missing' and not subs_stopped:
            if fetch_captions(v, dest):
                caps = 'yes'
                subs_streak = 0
                log(f'captions {v.id}')
            else:
                subs_streak += 1
                if subs_streak >= MAX_FAILS_IN_A_ROW:
                    # YouTube rate-limits caption requests (429): leave the rest for the next run.
                    subs_stopped = True
                    log(f'{subs_streak} caption fetches failed in a row: no more captions this run')
        rows.append({
            'id': v.id, 'festival': v.festival, 'year': v.year or '', 'kind': v.kind, 'code': code_of(v.title),
            'title': v.title, 'channel': v.channel, 'file': str(dest.relative_to(root / 'videos')) if has else '',
            'bytes': dest.stat().st_size if has else '', 'duration': info_duration(dest) if has else '', 'captions': caps,
            'status': next_status(has, upstream, is_removed, tried_and_failed, prev.get('status', '')),
            'checked': now() if upstream is not None else prev.get('checked', ''),
        })
        if tried_and_failed is False and has and new and new % 25 == 0:
            # Save progress during the long first run; rows not reached yet keep their old line.
            seen = {x['id'] for x in rows}
            write_index(root, rows + [r for k, r in old.items() if k not in seen])
    write_index(root, rows)
    counts = {s: sum(r['status'] == s for r in rows) for s in STATUSES}
    counts |= {f'captions_{s}': sum(r['captions'] == s for r in rows) for s in CAPTION_STATES}
    size = sum(int(r['bytes'] or 0) for r in rows)
    status = {'finished': now(), 'listed': len(rows), 'downloaded_this_run': new - failed, 'failed_this_run': failed,
              'stopped_early': stopped, 'bytes': size, 'counts': counts}
    (root / 'status.json').write_text(json.dumps(status, indent=2))
    log(f'done: {json.dumps(status)}')
    if counts['gone_kept']:
        log(f"{counts['gone_kept']} video(s) are gone from YouTube but kept here: see INDEX.tsv status=gone_kept")
    return 1 if stopped or (failed and failed == new) else 0


def cmd_find(root: Path, query: str) -> int:
    q = query.lower()
    hits = [r for r in read_index(root).values()
            if q == r['id'].lower() or q == r['code'].lower() or all(w in r['title'].lower() for w in q.split())]
    for r in hits:
        path = root / 'videos' / r['file'] if r['file'] else '(no file)'
        print(f"{r['status']:10} {r['festival']}/{r['year'] or '-'} {r['code'] or '-':10} {r['id']}  {r['title']}\n           {path}")
    return 0 if hits else 1


def cmd_remove(root: Path, vid: str, reason: str) -> int:
    idx = read_index(root)
    row = idx.get(vid)
    if row and row['file']:
        stem = (root / 'videos' / row['file']).with_suffix('')
        for p in stem.parent.glob(glob_escape(stem.name) + '.*'):
            p.unlink()
        kept = root / 'versiones' / stem.parent.relative_to(root / 'videos')
        for p in kept.glob(glob_escape(stem.name) + '.*'):
            p.unlink()
    p = root / 'removed.tsv'
    new_file = not p.exists()
    with p.open('a', newline='', encoding='utf-8') as f:
        w = csv.writer(f, delimiter='\t')
        if new_file:
            w.writerow(['id', 'date', 'reason'])
        w.writerow([vid, now()[:10], reason])
    if row:
        row.update(file='', bytes='', duration='', status='removed')
        write_index(root, list(idx.values()))
    print(f'removed {vid}: files deleted, listed in removed.tsv (never downloaded again)')
    return 0


def keep_earlier(root: Path, src: Path, dest: Path) -> None:
    """Copy src over dest, first moving a different dest to versiones/ (same folders as videos/), its name
    stamped with when that version arrived (its mtime, UTC): a rerun never loses the earlier transcription.
    An identical file is left as it is."""
    if dest.exists():
        if dest.read_bytes() == src.read_bytes():
            return
        stamp = datetime.fromtimestamp(dest.stat().st_mtime, timezone.utc).strftime('%Y-%m-%dT%H%M')
        folder = root / 'versiones' / dest.parent.relative_to(root / 'videos')
        folder.mkdir(parents=True, exist_ok=True)
        base, ext = dest.name[: -len(dest.suffix)], dest.suffix
        old, n = folder / f'{base}.{stamp}{ext}', 2
        while old.exists():
            old, n = folder / f'{base}.{stamp}-{n}{ext}', n + 1
        shutil.move(str(dest), old)
    shutil.copyfile(src, dest)


# What `import-mezcla` leaves beside each video (the mixed-language pass, Colab or KPC); the
# reconstruction reads these (scripts/reconstruct/sources.py imports this tuple).
MEZCLA_SUFFIXES = ('.cy-palabras.json', '.es-lineas.json', '.es-turbo.json')
_MEZCLA_SOURCES = ('.words.json', '.es-lines.json', '.es-words.json')


def _import_beside(root: Path, src: Path, suffix: str) -> int:
    """Copy src/<id>.json next to the backed-up video <id> as <stem><suffix>; how many."""
    idx = read_index(root)
    n = 0
    for j in sorted(src.glob('*.json')):
        row = idx.get(j.stem)
        if not row or not row.get('file'):
            continue
        dest = root / 'videos' / row['file']
        keep_earlier(root, j, dest.with_suffix(suffix))
        n += 1
    return n


def cmd_import_cy(root: Path, src: Path) -> int:
    """Copy Bangor's Welsh transcriptions (src/<id>.json, KPC out-cy/) next to their videos
    as <stem>.cy-techiaith.json; the reconstruction reads them (WELSH_SOURCE)."""
    print(f'imported {_import_beside(root, src, ".cy-techiaith.json")} Welsh (techiaith) results')
    return 0


def cmd_import_mezcla(root: Path, src: Path) -> int:
    """Copy the mixed-language pass (src/<id>.words.json, .es-lines.json, .es-words.json) next to
    each video as <stem>.cy-palabras.json, .es-lineas.json, .es-turbo.json. An id imports only when
    all three exist: the reconstruction needs them together."""
    idx = read_index(root)
    n = 0
    for words in sorted(src.glob('*.words.json')):
        vid = words.name[: -len('.words.json')]
        row = idx.get(vid)
        if not row or not row.get('file'):
            continue
        parts = [src / f'{vid}{s}' for s in _MEZCLA_SOURCES]
        if not all(p.exists() for p in parts):
            continue
        dest = root / 'videos' / row['file']
        for part, suffix in zip(parts, MEZCLA_SUFFIXES):
            keep_earlier(root, part, dest.with_suffix(suffix))
        n += 1
    print(f'imported {n} mixed-language results')
    return 0


def cmd_import_es(root: Path, src: Path) -> int:
    """Copy the Spanish pass (src/<id>.json, KPC out-es/, issue #112) next to their videos as
    <stem>.whisper-es.json; the reconstruction reads them as Spanish Whisper."""
    print(f'imported {_import_beside(root, src, ".whisper-es.json")} Spanish-pass results')
    return 0


def cmd_import_whisper(root: Path, src: Path) -> int:
    """Copy Whisper results (src/<id>.json and src/<id>.vtt, from KPC) next to their
    videos as <stem>.whisper.json and <stem>.<lang>-whisper.vtt, then refresh INDEX."""
    idx = read_index(root)
    n = 0
    for j in sorted(src.glob('*.json')):
        row = idx.get(j.stem)
        if not row or not row['file']:
            continue
        dest = root / 'videos' / row['file']
        data = json.loads(j.read_text(encoding='utf-8'))
        keep_earlier(root, j, dest.with_suffix('.whisper.json'))
        vtt = j.with_suffix('.vtt')
        if vtt.exists():
            keep_earlier(root, vtt, dest.with_suffix(f".{data.get('language', 'und')}-whisper.vtt"))
        row['captions'] = caption_state(dest)
        n += 1
    write_index(root, list(idx.values()))
    print(f'imported {n} Whisper results')
    return 0


def cmd_index(root: Path) -> int:
    idx = read_index(root)
    for r in idx.values():
        if r['file'] and not (root / 'videos' / r['file']).exists():
            r.update(file='', bytes='', status='missing')
    write_index(root, list(idx.values()))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('--max-new', type=int)
    r.add_argument('--check', action='store_true', help='also check that saved videos are still on YouTube')
    f = sub.add_parser('find')
    f.add_argument('query')
    d = sub.add_parser('remove')
    d.add_argument('id')
    d.add_argument('--reason', required=True)
    sub.add_parser('index')
    w = sub.add_parser('import-whisper', help='copy Whisper results next to their videos')
    w.add_argument('src', type=Path)
    c = sub.add_parser('import-cy', help="copy Bangor's Welsh transcriptions next to their videos")
    c.add_argument('src', type=Path)
    e = sub.add_parser('import-es', help='copy the Spanish pass (#112) next to their videos')
    e.add_argument('src', type=Path)
    m = sub.add_parser('import-mezcla', help='copy the mixed-language pass next to their videos')
    m.add_argument('src', type=Path)
    a = ap.parse_args(argv)
    if not a.root.parent.is_dir():
        # An external disk that is not plugged in: never create the tree somewhere else.
        print(f'{a.root.parent} is not there (disk not mounted?)', file=sys.stderr)
        return 3
    a.root.mkdir(exist_ok=True)
    if a.cmd == 'run':
        return cmd_run(a.root, a.max_new, a.check)
    if a.cmd == 'find':
        return cmd_find(a.root, a.query)
    if a.cmd == 'remove':
        return cmd_remove(a.root, a.id, a.reason)
    if a.cmd == 'import-whisper':
        return cmd_import_whisper(a.root, a.src)
    if a.cmd == 'import-cy':
        return cmd_import_cy(a.root, a.src)
    if a.cmd == 'import-es':
        return cmd_import_es(a.root, a.src)
    if a.cmd == 'import-mezcla':
        return cmd_import_mezcla(a.root, a.src)
    return cmd_index(a.root)


if __name__ == '__main__':
    sys.exit(main())
