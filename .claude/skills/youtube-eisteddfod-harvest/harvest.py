"""Classify YouTube metadata into the archive's Videos/ tree and VIDEOS.tsv.

  python3 harvest.py review [--hints H.json] META.jsonl... > review.tsv   # classify only
  python3 harvest.py write  [--hints H.json] ARCHIVE META.jsonl...        # thumbnails + VIDEOS.tsv

META.jsonl lines come from fetch.sh (one compact yt-dlp JSON object per video).
H.json: {"videoId": {"festival": "<folder>", "year": 2009, "found_via": "<url>"}} for videos
embedded on a page about a known edition (e.g. an archived site's "videos" page): the
page decides festival and fallback year, and the eisteddfod/Patagonia filter is skipped.
"""
import csv
import datetime as dt
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

# Festival folder -> patterns (checked in order: the more specific festivals first).
# Folder names for the four core eisteddfodau match the archive; any other folder is one
# of the "Otros festivales" (stored under Videos/, not on the site yet: issue #29).
# Trevelin holds one event: its Infantil/Juvenil sessions are Eisteddfod_de_Trevelin.
# There is no separate Eisteddfod de Camwy: it is the Micro Eisteddfod. The Mini
# Eisteddfod William Morris is the Eisteddfod de Dolavon (held at the college).
FESTIVALS = [
    ("Eisteddfod_de_Trevelin", r"(infantil|juvenil|ni[ñn]os).{0,25}trevelin|trevelin.{0,25}(infantil|juvenil|ni[ñn]os)"),
    ("Eisteddfod_de_la_Juventud", r"juventud|ieuenctid|\[JU\d{4}|\bJU ?\d{2}\b"),
    ("Micro_Eisteddfod_de_Camwy", r"micro.?eisteddfod"),
    ("Micro_Eisteddfod_de_Camwy", r"eisteddfod (de )?camwy"),
    ("Eisteddfod_Mimosa", r"mimosa|madryn"),
    ("Eisteddfod_de_Trevelin", r"trevelin|cwm hyfryd|16 de octubre"),
    ("Eisteddfod_de_Dolavon", r"william morris"),
    ("Eisteddfod_de_Dolavon", r"dolavon"),
    ("Eisteddfod_del_Chubut", r"del chubut|eisteddfod chubut|y wladfa|\[?E?CH ?\d{4}|\bCh ?\d{2}\b|trelew|eisteddfod mayor"),
]
# The festival named outright ("Eisteddfod del Chubut 2022 … Coro Municipal Madryn").
# Checked before the channel default and before loose places (FESTIVALS), because a place
# in a title is often only where the performers come from.
EXPLICIT = [
    ("Eisteddfod_de_Trevelin", r"eisteddfod (infantil|juvenil|de (los )?ni[ñn]os)\W{0,3}(de )?trevelin"),
    ("Micro_Eisteddfod_de_Camwy", r"micro.?eisteddfod"),
    ("Micro_Eisteddfod_de_Camwy", r"eisteddfod (de )?camwy"),
    ("Eisteddfod_de_la_Juventud", r"eisteddfod (de la )?juventud|ieuenctid"),
    ("Eisteddfod_Mimosa", r"eisteddfod mimosa|mimosa porth madryn"),
    ("Eisteddfod_de_Trevelin", r"eisteddfod (mayor )?(de )?trevelin"),
    ("Eisteddfod_de_Dolavon", r"eisteddfod (de )?dolavon"),
    ("Eisteddfod_del_Chubut", r"eisteddfod (del )?chubut|eisteddfod y wladfa"),
]
# Channels whose uploads default to a festival when the text names none.
CHANNEL_DEFAULT = {
    "@eisteddfoddelchubut": "Eisteddfod_del_Chubut",
    "@comisioneisteddfoddelajuve4384": "Eisteddfod_de_la_Juventud",
    "@EisteddfodTrevelin": "Eisteddfod_de_Trevelin",
}
# Local uploaders: an eisteddfod-titled video from them is Patagonian even without a place name.
LOCAL_CHANNELS = {"@kevinhughes26", "@patagonialand7wenhd777", "@emiliopinciroli162",
                  "@Chubut-imagenes-patagonia", "@danzagalesahersiriol844", "@asociacionculturalgalesade6818"}
NEWS_CHANNELS = {"@canal12chubut", "@canal12ch", "@DiarioJornadaChubut", "@canal4etc",
                 "@CHUBUT7W", "@S4C", "@britishpathe", "@BritishMovietone", "@bbccymruwales"}
# Not Patagonian: drop unless the text also names a Patagonian place.
# ("Mendoza" is NOT here: it is a surname and a choir that competes in Trelew.)
WALES = r"llangollen|kernewek|cornish|gorsedh kernow|eisteddfod y dysgwyr|eisteddfod yr urdd|urdd gobaith|genedlaethol|national eisteddfod|eisteddfod of wales|eisteddfod cymru"
# An eisteddfod abroad named in the title: not archived, even with a Patagonian speaker
# ("Eisteddfod Gales de Carreg Las // Radio Nacional Esquel").
ABROAD = r"eisteddfod (de |en )?gales\b"   # not "Eisteddfod galesa en Trelew"
PATAGONIA = r"chubut|trelew|gaiman|trevelin|madryn|dolavon|esquel|rawson|wladfa|patagonia|camwy|[\[(](CH|JU)\d{4}"
EISTEDDFOD = r"eisteddfod|eistedfod|eisteddvod|gorsedd|silla del bardo|corona del poeta|cadair|coron"

CEREMONY = r"silla|corona|cadeir|cadair|coron|ceremonia|gorsedd|bardo|poeta"
SESSION = r"sesi[oó]n|en vivo|transmisi[oó]n|completo|parte \d|\d/\d|d[ií]a (viernes|s[aá]bado|domingo)|noche"
DOC_LINK = r"https?://(?:drive\.google\.com|docs\.google\.com|bit\.ly|goo\.gl|[^\s]+\.pdf)[^\s)\]]*"

YEAR = r"(?<![\d.,])(19[3-9]\d|20[0-3]\d)(?![\d])"
SPACED_YEAR = r"(?<!\d)([12])[ .](\d{3})(?!\d)"  # "2 018", "2.025"


def _norm(s):
    return re.sub(r"\s+", " ", s or "")


def find_year(text):
    m = (re.search(r"\[?E?(?:CH|JU) ?(\d{4})", text)          # [CH2012027] [CH200836] ECH2011 CH2013 -
         or re.search(r"^(20[0-3]\d)\d{3}\b", text))          # 2012091 VEREDICTOCOMP091
    if m:
        return int(m.group(1)), "codigo"
    m = re.search(r"\b(?:Ch|JU) ?(\d{2})\b", text)
    if m and re.search(r"\b(?:Ch|JU) ?\d{2} ?-", text):
        return 2000 + int(m.group(1)), "codigo"
    t = re.sub(SPACED_YEAR, lambda m: m.group(1) + m.group(2), text)
    years = [int(y) for y in re.findall(YEAR, t)]
    if years:
        return years[0], None
    m = re.search(r"\b\d{1,2}[-/ .]\d{1,2}[-/ .](\d{2})\b", t)       # 12-06-10, 31 10 09
    if m:
        return 2000 + int(m.group(1)), None
    m = re.search(r"eisteddfod '?([01]\d)\b", t, re.I)                # "eisteddfod 09 coro…"
    if m:
        return 2000 + int(m.group(1)), None
    return None, None


def classify(d, hint=None):
    title, desc = _norm(d.get("title")), _norm(d.get("description"))
    both = f"{title} {desc}"
    ch = d.get("uploader_id") or ""
    # A competition code names the eisteddfod itself; a place in the title may only be where
    # the performers come from ("[CH2008065] … - Parti Trevelin" is Chubut).
    code = re.search(r"\[?E?(CH|JU) ?\d{4}", title)
    first = lambda table, text: next((f for f, p in table if re.search(p, text, re.I)), None)
    festival = ({"CH": "Eisteddfod_del_Chubut", "JU": "Eisteddfod_de_la_Juventud"}[code.group(1).upper()] if code
                else first(EXPLICIT, title) or CHANNEL_DEFAULT.get(ch) or first(FESTIVALS, title))
    if re.search(ABROAD, title, re.I):
        return None
    if hint:
        festival = hint["festival"]
    elif ch not in CHANNEL_DEFAULT:                    # official channels: keep every upload
        if not re.search(EISTEDDFOD, both, re.I):
            return None
        place = re.search(PATAGONIA, both, re.I)
        # A Welsh/Cornish eisteddfod in the title wins over a Patagonia mention deep in the description.
        if re.search(WALES, title, re.I) and not re.search(PATAGONIA, title, re.I):
            return None
        if re.search(WALES, both, re.I) and not place:
            return None
        if not (place or festival or ch in LOCAL_CHANNELS):
            return None
    if festival is None:
        festival = first(EXPLICIT, desc) or first(FESTIVALS, desc) or "_sin_clasificar"
    year, how = find_year(title)
    how = how or ("titulo" if year else None)
    if year is None and hint and hint.get("year"):
        year, how = int(hint["year"]), "pagina"       # the page it was embedded on names the edition
    if year is None:
        year, how = find_year(desc)
        how = how or ("descripcion" if year else None)
    live = d.get("was_live") or d.get("live_status") in ("was_live", "post_live")
    if year is None and d.get("upload_date"):
        # A stream's date IS the event date; a plain upload often comes months later.
        # News is uploaded the same week as the event, so its date is as good as a stream's.
        year = int(d["upload_date"][:4])
        how = "transmision" if live else "noticia" if ch in NEWS_CHANNELS else "subida"
    dur = d.get("duration") or 0
    if ch in NEWS_CHANNELS or re.search(r"documental|informe|noticia|reportaje", title, re.I):
        kind = "noticia"
    elif re.search(CEREMONY, title, re.I):
        kind = "ceremonia"
    elif live or dur >= 3600 or re.search(SESSION, title, re.I):
        kind = "sesion"
    else:
        kind = "actuacion"
    docs = sorted(set(re.findall(DOC_LINK, d.get("description") or "")))
    return {
        "video_id": d["id"], "url": f"https://www.youtube.com/watch?v={d['id']}",
        "festival": festival, "year": year or "", "year_source": how or "",
        "kind": kind, "title": title, "channel": d.get("channel") or "",
        "channel_id": ch, "upload_date": d.get("upload_date") or "",
        "duration": int(dur), "doc_links": " ".join(docs),
        "found_via": (hint or {}).get("found_via", ""),
    }


FIELDS = ["video_id", "url", "festival", "year", "year_source", "kind", "title", "channel",
          "channel_id", "upload_date", "duration", "doc_links", "found_via", "thumb_path", "retrieved"]


def load(paths):
    seen = {}
    for p in paths:
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line.startswith("{"):
                d = json.loads(line)
                seen[d["id"]] = d
    return list(seen.values())


def slug(s, n=40):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\[[A-Z]{2}\d+\]", "", s)
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()[:n].rstrip("-") or "video"


def fetch_thumb(vid, dest):
    for name in ("maxresdefault", "sddefault", "hqdefault"):
        try:
            with urllib.request.urlopen(f"https://i.ytimg.com/vi/{vid}/{name}.jpg", timeout=20) as r:
                data = r.read()
            if len(data) > 2000:          # ytimg serves a tiny grey placeholder for missing sizes
                dest.write_bytes(data)
                return True
        except Exception:
            continue
    return False


def write(archive, rows):
    archive = Path(archive)
    tsv = archive / "VIDEOS.tsv"
    existing = {}
    if tsv.exists():
        with open(tsv, newline="", encoding="utf-8") as f:
            existing = {r["video_id"]: r for r in csv.DictReader(f, delimiter="\t")}
    today = dt.date.today().isoformat()
    for r in rows:
        old = existing.get(r["video_id"], {})
        year = str(r["year"]) if r["year"] else "_sin_fecha"
        rel = Path("Videos") / r["festival"] / year / f"yt_{slug(r['title'])}_{r['video_id']}.jpg"
        if old.get("thumb_path") and old["thumb_path"] != rel.as_posix():
            old_file = archive / old["thumb_path"]   # reclassified: move the thumbnail
            if old_file.exists():
                (archive / rel).parent.mkdir(parents=True, exist_ok=True)
                old_file.rename(archive / rel)
        dest = archive / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() and not fetch_thumb(r["video_id"], dest):
            print("no thumbnail:", r["video_id"], file=sys.stderr)
            rel = Path("")
        r["thumb_path"] = rel.as_posix() if rel.name else ""
        r["retrieved"] = old.get("retrieved") or today
        r["found_via"] = r.get("found_via") or old.get("found_via", "")
        existing[r["video_id"]] = r
    out = sorted(existing.values(), key=lambda r: (r["festival"], str(r["year"]), r["kind"], r["title"]))
    with open(tsv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS, delimiter="\t", extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(out)
    return len(out)


def main(argv):
    mode, args = argv[1], argv[2:]
    hints = {}
    if args[:1] == ["--hints"]:
        hints = json.load(open(args[1], encoding="utf-8"))
        args = args[2:]
    classify_all = lambda paths: [r for r in (classify(d, hints.get(d["id"])) for d in load(paths)) if r]
    if mode == "review":
        rows = classify_all(args)
        w = csv.DictWriter(sys.stdout, FIELDS[:-2], delimiter="\t", extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    elif mode == "write":
        print(write(args[0], classify_all(args[1:])), "rows in VIDEOS.tsv")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
