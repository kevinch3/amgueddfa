# Asset intake: reference

## What each asset usually yields

| Asset | Usually yields | Goes to |
|---|---|---|
| Programa | competitions, jurados, named prizes and their sponsors, venue, dates | transcription; `competencia`, `venue`, `start_date`/`end_date`, `other` |
| Programa del día | its **credits block** ("Colaboradores"): `Locución:` = the session **presenters**, `Conduce:` per ceremony = ceremony conductors, Traductores; session times; jurors | the transcription leaves people out by design, so read the **source file** (`catdoc -w <file>.doc`): `presentadores` (all days in one fact), `other` |
| "Locutores" script (the hosts' running script) | presiders per session ("designación del presidente de la sesión"), the running order, verdicts read aloud | presiders → `other`. It never names the locutores themselves: take them from the sibling programa del día. Its text is never published |
| Resultados | winner per competition, silla, corona | Ganadores transcription (Chubut and Trevelin public; Juventud and Mimosa private); `ganador_silla`/`ganador_corona`/`other` |
| Bases, preliminares | themes, deadlines, prizes, sponsors | transcription; `other` |
| Stream banner | dates, venue, anniversary | `start_date`, `end_date`, `other` (a banner week may be wider than the competition days: ask) |
| Ceremony card ("Conduce:", "Lectura del veredicto:", "Otorgado por", "Realizado por") | ceremony conductor, verdict reader, sponsor, chair maker or donor, winner | `other`, `ganador_*` |
| Clip title ("2016 Comp. 22 Primer premio - X") | competition, prize, performer | `clip_comps` link; a winners list is a new item: ask how |
| Speech | hosts, presiders, ceremony conductors, winners | candidates; take the spelling from text |
| Press | dates, venue, winners, jurors, presiders, Bardic Circle officers | facts with `<Diario>, <date>: <url>` as fuente |
| Photo | its printed caption only | SOURCES caption; `no_text` |

**Fact fields** (`FACT_FIELDS`, `src/lib/contrib.ts`): `start_date`, `end_date`, `venue`, `presentadores`, `ganador_silla`, `ganador_corona`, `edicion_realizada`, `competencia`, `other`.
- There is no field for jurors, presiders, ceremony conductors, sponsors, chair makers or committees. They go in one `other` sentence that starts with the role ("Presidió la primera sesión: X.").
- A new field is a design change: ask (#30).
- `presentadores` for several sessions: one fact per edition, "Viernes: A y B; sábado: C y D."

## Roles: read the verb, then the context

| Wording | Role | Field |
|---|---|---|
| "la conducción a cargo de", "quienes conducen", "presentadores", "locutores", the closing thanks "a los conductores" | session **host** | `presentadores` |
| the same verbs next to *ceremonia, Círculo Bárdico, Gorsedd*; "Conduce:" on a Chair/Crown card | **ceremony conductor** (usually the Círculo Bárdico president) | `other` |
| "invitamos a presidir", "designación del presidente de la sesión", "presidió", "bajo la presidencia de", "Llywydd (y cyfarfod)" | session **presider**, an honoured guest in the front row | `other` |
| "Jurado", "Beirniad/Beirniaid", "lectura del veredicto" | juror, verdict reader | Jurados block; `other` |
| "Dirige:", "con dirección de", a choir's "arweinydd" | choir or ensemble director | transcription; `other` after asking |
| "Arweinydd" of the eisteddfod (old programas) | host | ask |
| "presidente/presidenta del Círculo Bárdico / Gorsedd", "Archdderwydd", "Presidente saliente" | Bardic Circle officer | `other` |

Bardic Circle presidents, confirmed in print and on screen (2026-11-26):
- Ivonne Owen, outgoing 2016;
- Benito Jones, 2016–2019;
- **Alwen Green** of Trevelin, elected Oct 2019, served 2020 to Oct 2023 ("Alwyn" in speech);
- **Marli Pugh** (de Villoria), from late 2023 to 2026; speech heard "Marley Piu", "Maggie Pugh".

## Cross-check sources

- **Video:** Tesseract `ocr.json` at the same t; the same card in another channel's recording of the same ceremony.
- **Documents:** the edition's programa or Ganadores transcription; approved facts.
- **Press:** El Chubut, Diario Jornada (blocks automated fetches: use a search snippet plus a second outlet), El Valle Online, Cholila Online, laimagenpatagonia.
- **History:** Osian Hughes, «Los poetas del Eisteddfod» (already used as a fuente).

## Filing in the archive (maintainer's own or harvested assets)

- **Path:** `../<Festival folder>/<Year | _general | _sin_fecha>/<Category folder>/<name>`. Use `Programa_del_dia/`, `Prensa/`, `Fotos/` and so on, as the README describes.
- **Source row:** add a row to `../SOURCES.tsv` with `path, source_url, retrieved, mime, notes, rights, caption`.
- **Item id:** `sha256sum <file> | cut -c1-12`.
- **Restricting:** add the id to `data/restricted_extra.txt` before building if it must be restricted.
- **Worktree links:** symlink `media`, `.restricted`, `.env` and `node_modules` from `../amgueddfa`, and list them in `.git/info/exclude`. Without them build_catalog, ocr, seed and export fail.

## Programa missing

Search in this order:
1. Ask the maintainer.
2. Wayback `wp-content/uploads/<year>/` of the festival sites.
3. The chubutcultural WordPress media API.
4. The festival's Facebook images, through Chrome.
5. Scribd.
6. The maintainer's Drive.

Memory `chubut-2017-programa-search` lists the dead ends.

Until then, clip links come from title codes only and the reconstruction runs without the programa's names. Note the gap in `docs/letras-pendientes.md`-style lists, not silently.

## Video order, with commands

1. **Harvest.** Discovery with `yt-dlp --flat-playlist --extractor-args "youtube:lang=es"`, then `fetch.sh` → `harvest.py review` (triage here: festival, kind, length) → `harvest.py write ../ meta*.jsonl`.
2. **List the video:** `python3 -m scripts.export_videos`.
3. **Backup:** `python3 scripts/backup/videos.py run --max-new N`, with the backup disk mounted. Read the captions state in INDEX.tsv: yes, none or missing.
4. **Caption gate:** `python3 -m scripts.export_video_transcripts`. It passes when it writes `public/transcripciones-video/<id>.json` from `youtube`/`subida` (es, ≥55% dictionary words, ≥40 words). For `missing`, refetch the captions first.
5. **KPC:**
   - Cut the audio: `ffmpeg -vn -c:a copy` → `kpc.local:/mnt/raid2/data/V1/amgueddfa-whisper/audio/<id>.m4a`.
   - Run **one** queued `gpu_turno`-style script, which stops immich ML and restores it on exit:
     - Bangor `run_cy` for every in-scope video;
     - Whisper turbo only for captions `none`;
     - `run_es` only where Whisper chose Welsh.
   - rsync the results back and run `import-cy`.
6. **Frames:** `python3 -m scripts.visual.frames <mp4> ../.visual/<id>` on the laptop.
7. **OCR:** `python3 -m scripts.visual.ocr_frames ../.visual/<id> 6` on the KPC CPU.
8. **Clips:** `python3 -m scripts.visual.clip_comps`, then check the review rows by eye. Then `video-lyrics`.
9. **Sessions and ceremonies:**
   - `kaggle_chunk.py prepare`, then a private dataset of a few `.tar` files, then `kaggle kernels push --accelerator NvidiaTeslaT4` (it may queue for hours). Colab's `go_chunk.sh` is the reliable route.
   - `python3 -m scripts.video_markers` for Chubut sessions over 3 h.
   - The mixed cy/es pass only for bilingual sessions (#168 is open).
10. **Clean up:** delete the Kaggle datasets and notebooks, and the Colab runtimes.

## Costs (measured)

| Work | Machine | Cost |
|---|---|---|
| Metadata | laptop | ~4 s per video, paced, never parallel |
| Backup | laptop + 2nd disk | ~0.21 GB per video-hour |
| Bangor Welsh | KPC GPU | ~0.27 s per s of audio (8 h session ≈ 2.2 GPU-h); 16 s per 150 s clip |
| Mixed pass | Colab T4 / KPC | ~0.29 / ~0.46 s per s |
| Frames, OCR | laptop, KPC CPU | ~20 s, ~30 s per video-hour |
| Vision model 7B 4-bit | Colab T4 (Kaggle T4 when its queue moves) | ~3.5 s per frame on a T4, about 10.8k frames per 84 sessions; never KPC (27 s per frame) |
| Reconstruction | laptop `claude -p` | ~USD 0.03 per window, ~60 windows per video-hour; plan from the dry-run count |

## What the extracted data feeds

- **Edition pages:** Hechos, transcriptions, and JSON-LD Events. An Event needs an approved date and venue.
- **Video search:**
  - on-screen text;
  - ceremony chapters, from vision runs of robes → dance → kneeling, checked against markers;
  - correct name spellings in the transcripts, via the glossary.
- **A people index across years:** presenters, presiders, Bardic Circle officers, jurors, winners. It gives one spelling per person and links every source moment.
- **A history of the prizes:** who sponsors the Chair and the Crown, and who makes or donates them.
- **A gaps report per edition:** dates, venue, presenters, winners, untranscribed programas. It drives what to ask contributors for.
- **Private consistency lists:**
  - video year against the on-screen year;
  - festival assignment;
  - banner dates against facts;
  - clip cards against title codes.
