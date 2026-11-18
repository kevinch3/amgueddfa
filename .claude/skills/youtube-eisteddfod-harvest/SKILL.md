---
name: youtube-eisteddfod-harvest
description: Use when searching YouTube for videos of Patagonian eisteddfodau (Chubut, Juventud, Mimosa, Trevelin, Dolavon, Camwy…) to add to the archive as thumbnail + link, when updating or re-running VIDEOS.tsv, or when a new channel or year of Eisteddfod videos turns up.
---

# YouTube Eisteddfod harvest

Videos are recorded as **thumbnail + link**, never downloaded. They live in the archive
(`eisteddfod_programas/`, parent of this repo) in a separate tree the catalog skips:

```
Videos/<Festival_folder>/<year|_sin_fecha>/yt_<slug>_<videoId>.jpg
VIDEOS.tsv   video_id url festival year year_source kind title channel channel_id
             upload_date duration doc_links thumb_path retrieved
```

`scripts/catalog/scan.py` ignores `Videos/` and `VIDEOS.tsv` (tested in
`tests/test_scan.py::test_videos_tree_is_not_scanned`). Never put thumbnails inside
`<Festival>/<Year>/…`: they would become public catalog items, and a festival folder the
catalog doesn't know (Dolavon, Camwy…) makes `build_catalog` fail.

## Rules

- The user's YouTube is signed in in Chrome: **read only**. No like, subscribe, comment,
  save, Watch Later. Close your tab when done.
- Chrome is for **discovery** (search, finding channels) and for videos that say
  "Inicia sesión" to yt-dlp. Bulk listing and metadata go through `yt-dlp` (logged out).
- Always pass `--extractor-args "youtube:lang=es"`: without it yt-dlp returns titles
  machine-translated to English ("TRELEW CONTINUES THE CHUBUT EISTEDDFOD WEEK").
- Programas, bases or resultados linked in descriptions (`doc_links` column: Drive, PDF,
  bit.ly) are documents: download them into the normal archive folders with a
  `SOURCES.tsv` row, as in the Facebook pass.

## Festival folders (decided 2026-11-18)

- **Main festivals** (on the site): `Eisteddfod_del_Chubut`, `Eisteddfod_de_la_Juventud`,
  `Eisteddfod_Mimosa`, `Eisteddfod_de_Trevelin`. Trevelin is **one event**: its
  Infantil/Juvenil sessions go in `Eisteddfod_de_Trevelin` (titles keep the word).
- **Otros festivales:** any other folder. Stored in the archive, not exported to the
  site until issue #29. Today: `Micro_Eisteddfod_de_Camwy` (there is no separate
  "Eisteddfod de Camwy") and `Eisteddfod_de_Dolavon` (the Mini Eisteddfod William Morris,
  held at the college in Dolavon). A place alone (Esquel) is not a festival.
- **Not archived:** eisteddfodau abroad ("Eisteddfod de Gales" with a Patagonian speaker).
- **`noticia`:** interviews and news about an eisteddfod (a poet on the radio telling
  how they won). Festival unknown → `_sin_clasificar` with the year.
- **Children:** Otros (mostly minors from one family's channel) and Trevelin's
  Infantil/Juvenil sessions stay off the site until #29; `scripts/export_videos.py`
  `held_back()` keeps the Trevelin ones out.

`harvest.py` (`FESTIVALS`, `EXPLICIT`, `ABROAD`) follows these rules; tests in
`tests/test_harvest_rules.py`.

## Pipeline

Work in the session scratchpad (`$W`); `S=` this skill's folder.

1. **Discover in Chrome.** One results page per query, harvested into `sessionStorage`
   (survives same-tab navigation). Queries that paid off: `eisteddfod trelew`,
   `eisteddfod chubut`, `eisteddfod gaiman juventud`, `eisteddfod ieuenctid gaiman`,
   `eisteddfod mimosa puerto madryn`, `eisteddfod trevelin`, `eisteddfod esquel`,
   `eisteddfod y wladfa`, `gorsedd y wladfa`, `silla del bardo eisteddfod`,
   `corona del poeta eisteddfod`, `eisteddfod patagonia documental`, `eisteddfod trelew 1995`.
   After each `navigate`, run (wait for `ytd-video-renderer` — it is absent right after load):

   ```js
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   for(let i=0;i<20&&!document.querySelector('ytd-video-renderer');i++)await sleep(500);
   for(let i=0;i<6;i++){scrollTo(0,document.documentElement.scrollHeight);await sleep(1500);}
   const db=JSON.parse(sessionStorage.getItem('h')||'{}');let n=0;
   document.querySelectorAll('ytd-video-renderer').forEach(e=>{const a=e.querySelector('a#video-title');
     const id=a?.href.match(/v=([\w-]{11})/)?.[1];if(!id||db[id])return;n++;
     const c=e.querySelector('ytd-channel-name a');db[id]=[a.title,c?.textContent.trim(),c?.getAttribute('href')];});
   sessionStorage.setItem('h',JSON.stringify(db));'new:'+n+' total:'+Object.keys(db).length
   ```

   Then summarise by channel (handle → hits) to pick channels to list in full.
   **The JS tool truncates output at ~1000 chars**: export only the IDs you still need
   (drop channels you will list in full, drop titles without eisteddfod terms) as one
   concatenated string, read it in `slice()` chunks of ~940 chars, `fold -w11` into a file.
   Skip `location.search` in outputs: the tool redacts results containing query strings.

2. **List channels in full** (fast, flat, no per-video requests):
   `yt-dlp --no-update --flat-playlist --extractor-args "youtube:lang=es" --print "%(id)s	%(title)s" https://www.youtube.com/@HANDLE/videos`
   — repeat for `/streams` (livestreams are a separate tab!). Note: `--print` writes
   `\t` literally unless you put a real tab in the template.

3. **Candidates** = all uploads of official channels + eisteddfod-titled videos of other
   channels + leftover search IDs, deduped, one ID per line.

   **Videos embedded on archived sites** (e.g. vistasdelvalle.com.ar's
   `eisteddfod-2009/videos.htm` in Wayback) often have titles without "eisteddfod".
   Old pages use Flash players: extract IDs with
   `youtube\.com/(?:v/|embed/|watch\?v=)([A-Za-z0-9_-]{11})` (decode the page as latin-1),
   and write a hints file `{"id": {"festival": "<folder>", "year": 2009, "found_via": "<wayback url>"}}`.
   Pass it as `harvest.py review|write --hints H.json …`: the page decides festival and
   fallback year (`year_source=pagina`) and the relevance filter is skipped.

4. **Metadata**: `bash $S/fetch.sh ids.txt meta.jsonl` in the background — one process,
   paced (~4 s/video, ~1 h per 900). Resumable: re-run to retry failures. Expected errors:
   deleted/private videos and "Inicia sesión" (sign-in / bot check) → retry later, then
   open what is left in Chrome and read title/date there.

5. **Review**: `python3 $S/harvest.py review meta*.jsonl > review.tsv`. Read every
   `_sin_clasificar` row and every `year_source=subida` row; fix patterns in
   `harvest.py` (FESTIVALS, CHANNEL_DEFAULT, NEWS_CHANNELS) rather than hand-editing.

6. **Write**: `python3 $S/harvest.py write ../ meta*.jsonl` (idempotent: re-running
   merges by video_id, moves thumbnails of reclassified videos). Then follow `doc_links`
   (in the 2026-11 run descriptions linked only to social media, never to programas).

7. **Publish on the site** (from `amgueddfa/`): `python3 -m scripts.export_videos` writes
   `src/data/videos.json` (only chubut/juventud/mimosa/trevelin, only dated videos; the
   other eisteddfodau stay in the archive until the site has pages for them). Edition
   pages render it through `src/components/VideoList.astro`; thumbnails come from
   `i.ytimg.com`, nothing is committed but the JSON. Run `npx vitest run` (the build test
   checks every video lands on an existing edition page), commit, push `main` → deploy.

## Known channels (2026-11)

| Handle | What | Size |
|---|---|---|
| `@eisteddfoddelchubut` | Official Chubut: competitions `[CH2012027]`, ceremonies, sessions; some Juventud `[JU…]`; old playlists "Ch 08 - Coros" etc. | ~1030 + 31 streams |
| `@comisioneisteddfoddelajuve4384` | Official Juventud, livestreams | ~27 |
| `@EisteddfodTrevelin` | Trevelin incl. Infantil (some need sign-in) | ~63 |
| `@kevinhughes26` ("Daniel") | Family uploads 2011–2015: Trevelin, Juventud, Mimosa, Dolavon, Micro Eisteddfod Camwy | ~1050, ~1/4 eisteddfod |
| `@patagonialand7wenhd777` | Chapters of Chubut/Mimosa 2018–2025 ("CAP. 10 EISTEDDFOD DEL CHUBUT 2.021") | ~330 |
| `@canal12chubut`, `@canal12ch`, `@DiarioJornadaChubut`, `@canal4etc` | News | search hits only |
| `@britishpathe`, `@BritishMovietone`, `@S4C` | Archive newsreels / Welsh TV | search hits only |

## Classification pitfalls

| Trap | Handling |
|---|---|
| Llangollen, Eisteddfod yr Urdd, National Eisteddfod of Wales | dropped unless a Patagonian place is named |
| "Mendoza" in a title | a surname / "Coro Club Mendoza Regatas" competing in Trelew — **not** a reason to drop |
| Official channel titles like `[CH2012045] Solo libre…` (no "eisteddfod", no place) | official channels keep every upload |
| "Eisteddfod de la Juventud 2019 - María" (no place) | festival name alone, or a `LOCAL_CHANNELS` uploader, is enough |
| "eisteddfod 09 …", "12-06-10", "31 10 09", `ECH2011`, `2012091 VEREDICTO…` | all parsed as years |
| News upload date | same week as the event: `year_source=noticia`, reliable |
| 3 parallel unpaced fetches | YouTube throttles after ~1300: false "no está disponible"; `fetch.sh` is paced, just re-run it |
| Years written "2 018", "2.025" | normalised before matching |
| `[CH2013024]`, `[JU2013001]`, playlist "Ch 08" | code gives festival and year |
| Upload year ≠ edition year | `year_source=subida` = weak; livestream date = `transmision` = reliable |
| "Eisteddfod Infantil/Juvenil Trevelin", "Micro Eisteddfod Camwy", Dolavon, Esquel | own folders, matched before the generic Trevelin/Chubut patterns |
| "Trelew presente en el Eisteddfod de Trevelin" | Trevelin pattern is checked before Trelew |
| Official channel title without festival name | `CHANNEL_DEFAULT` |

Kinds: `ceremonia` (silla, corona, gorsedd), `sesion` (stream, ≥1 h, "sesión", "parte 2/3"),
`noticia` (news channels, documental), `actuacion` (everything else).
