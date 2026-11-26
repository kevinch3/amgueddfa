---
name: asset-intake
description: Use when the maintainer hands over a new programa del día, programa, resultados list, newspaper clipping, ceremony card, photo, scan, a new video or a batch of assets, or asks what can be extracted from them (presenters, jurors, dates, venues, winners, sponsors, Bardic Circle officers).
---

# Asset intake: get every fact out of a new asset, cheapest path first

A router. For each kind of asset it gives the order of steps and which skill runs each step; open those
skills for the commands. Every intake ends the same way: **candidate facts → closed questions → load only
what the maintainer approves.** Details (yields per asset, roles vocabulary, costs, filing) are in
[reference.md](reference.md).

| Step | Skill |
|---|---|
| YouTube discovery, metadata, VIDEOS.tsv, `export_videos` | `youtube-eisteddfod-harvest` |
| Transcribing programas, programas del día, resultados, bases, press | `programa-transcription` |
| Facts, item corrections, uploads on someone's behalf, the DB helper | `app-data-update` |
| Frames, OCR, vision model, clip → competition links, Kaggle/Colab | `video-visual` |
| Lyrics of sung pieces | `video-lyrics` |
| Video text, glossary of mishearings | `video-reconstruction` |

For a batch, the saved workflow `.claude/workflows/asset-intake.js` fans out the reading and returns
candidate rows, cross-checks, closed questions and a draft batch file. It never writes anything. Run it with
`args: {items: [{kind: "document"|"video", id: "<catalog id or YouTube id>"}], note: "<what the maintainer said>"}`.

## Rules that don't bend

- **Publishing happens earlier than `git push`.** These are production writes, each needing the maintainer's OK after a dry-run:
  - a fact or memory load, or `seed_transcriptions.mjs` (live at once through `public_contributions`);
  - `build_catalog` **without** `--no-upload` (it `rclone sync`s to R2, media.amgueddfa.org);
  - any reconstruction over 50 windows;
  - merging a PR (it deploys).
- **Scope:** Chubut and Trevelin get everything.
  - Juventud and Mimosa videos get harvest, backup and a site listing only: no transcript, reconstruction, lyrics or OCR/VLM.
  - Trevelin `Infantil`/`Juvenil` stay off the site.
  - Any results, names or photos of minors are a #29 question for the maintainer, never your call.
- **Names come from text, never from faces.** A heard name is a candidate; its spelling comes from a card, a printed source or the maintainer.
- **No lyrics, prayers, anthems, recited or scripted text in public text.** That covers code, tests, commits, issues and transcriptions of locutores' scripts. Extract the names and roles only.
- **Raw outputs stay private:** `../.visual/` (frames, `ocr.json`, `vlm*.jsonl`, candidate lists), the scratchpad, `.restricted/`.
  - `scripts/ocr.py` writes `src/data/ocr/<id>.json`, which is **public**.
  - For a page listing people (programa del día, press, resultados), run `tesseract <img> - -l cym+spa+eng` into the scratchpad instead.
- **Ask in closed questions** (yes/no, or pick one), four at most per round. Every row needs an answer; confidence only orders the questions.
- **Never dismiss a finding:** each bug or gap gets an issue, a comment, or a stated reason.
  - The repo is public. Issues never quote lyrics, never name minors, and carry nothing from the legal report without asking.

## 1. Triage (minutes, no compute)

1. **Whose asset?**
   - The maintainer's own or harvested: archive filing (reference.md § Filing).
   - A contributor's: they upload on `/contribuir`, or you upload on their behalf (`app-data-update` § upload; approve in `/admin`, never SQL).
   - Already uploaded by the admin through `/contribuir`: it was auto-approved with no page images. Run `python3 -m scripts.sync_uploads --dry-run` to see where it lands.
2. **Which festival and edition?** The edition year is not the publication date of a clipping or a video's upload. A 1980s–2007 "Corona" may be the Juventud's. If you are unsure, ask.
3. **Minors?** A sheet listing competitors, or a photo of children: ask whether to restrict it. Put the id in `data/restricted_extra.txt` **before** any `build_catalog` run.
4. **What does the edition already hold?**
   - `src/data/transcripciones/`, `src/data/ganadores/`, `data/approved/contributions.json`.
   - The snapshot lags the DB by hours (#171), so ask to run the `app-data-update` approved-facts query before trusting either.
   - Is the edition's numbered **programa** transcribed? Clip links, chapters and the reconstruction's word list all need it. If it's missing, use reference.md § Programa missing.

## 2. Extract, per asset type

**What to look for first:**
1. presenters;
2. presiders;
3. ceremony conductors and Bardic Circle officers;
4. jurors;
5. prize sponsors, makers and donors;
6. dates and venue;
7. winners missing from the Ganadores lists.

Prayer leaders, anthem directors, accompanists and opening acts are low priority. List them once in a collapsed row; don't ask about each.
Read **sibling items** of the same edition too: a locutores script points to the programa del día, whose credits block names the hosts.

**Programa, programa del día, resultados, bases, preliminares**
1. File it. Build with `python3 -m scripts.build_catalog --only <id> --no-upload`, then a full `--no-upload` run.
2. Get the text.
   - `.doc`/`.docx`/web: `_html_text(src, keep_breaks=True)` from `scripts/catalog/derive.py`.
   - A PDF with a text layer: `pdftotext -layout`.
   - A scan: private tesseract (rule above). Use `ocr.py --dry-run --ids <id>` only for public pages without people lists.
   - Resultados: read the pages in `.restricted/<id>/` directly.
3. Transcribe with `programa-transcription`.
   - Locutores, presiders and committee stay **out** of the transcription. They are fact candidates.
   - Jurors go in the Jurados block; session times go in the headings.
4. Seeding:
   - list the new ids by diffing against the snapshot;
   - ask;
   - run `node --env-file=.env scripts/seed_transcriptions.mjs`;
   - only then `export_approved.mjs`, which would otherwise delete the new `.md`.
5. A programa del día reruns only `clip_comps` and `video_markers` (free). A **programa** also changes the reconstruction's word list, which is paid (§ 4).

**Press clipping, ceremony card, photo**
- File it in `Prensa/` or `Fotos/` with its caption, rights and outlet.
- Press with a recent date: ask whether to give a full transcription or facts plus a short Notas summary (copyright).
- Facts come from the article text, never a search summary.
- A photo: read only its printed text; a photo with none gets `no_text` (`admin_correct_item`).

**Video** (order matters; reference.md § Video order has the commands)
1. Harvest.
2. `export_videos`, without which `clip_comps` and `video_markers` skip it.
3. Backup.
4. Caption gate.
5. Speech on KPC: one queued script; Bangor Welsh for every in-scope video, Whisper turbo only where captions are none.
6. Frames, then OCR.
7. Clips: `clip_comps` (Chubut only, #169), then lyrics. **Skip** the vision model.
8. Sessions and ceremonies:
   - the vision model on **Colab**, or on Kaggle when its GPU queue moves;
   - `video_markers` for Chubut sessions over 3 h.
9. Mine facts.
   - **Screen:** the vision model's TEXT lines, confirmed by Tesseract at the same t.
   - **Speech:** the role phrases in reference.md § Roles.

## 3. Candidates → questions → load

1. **Candidate table**, one row each:

   | Edition | Field | Value | Role (verb) | Source with link and time | Second source | Confidence |
   |---|---|---|---|---|---|---|

   - **alta:** two independent texts agree, or a text and speech agree.
   - **media:** one text source.
   - **baja:** speech or the vision model only.
   - A vision-model reading counts as text only when Tesseract at the same t, or the next frame, reads the same words.
   - Example: Chubut 2024 · `other` · Conducción de la ceremonia del Sillón: Marli Pugh · "Conduce:" · nyMWlZ3tztw t=900 ocr · COlC6CCtD3g t=530 ocr "MARLI PUGH Presidente del Círculo Bárdico" (another channel) · alta.
2. **Dedupe** against approved facts:
   - drop exact repeats;
   - reuse the existing spellings of venues and names;
   - a candidate that contradicts a loaded fact becomes a question, never an edit.
3. **Closed questions:**
   - Role: presenter, presider or ceremony conductor?
   - Spelling.
   - Field.
   - Load or not.
   - The #29 question when a minor appears.
4. **Load what is approved** with `app-data-update`.
   - Apply its interpretation rules: a winner without silla/corona is `other` "Ganador: X."; a winner or venue also gets `edicion_realizada` `si`; use the existing venue spellings.
   - Credit facts found in archive assets to the admin (`ADMIN` in `db.py`), and a contributor's data to that contributor.
   - One batch file per festival; each row may carry its own fuente as a 3rd element (one lote).
   - Dry-run, then run.
   - Fuente format: `Video del archivo, <qué> (h:mm:ss): https://www.youtube.com/watch?v=<id>&t=<s>s`, or `<Documento> <year> (archivo): https://amgueddfa.org/item/<id>/`, or `<Diario>, <dd/mm/yyyy>: <url>`.

## 4. Then the paid and public steps

- **Reconstruction last, per edition.**
  - A new `venue`/`ganador_*`/`presentadores` fact re-asks only the windows where something heard may be a mishearing of its names: about 1% of an edition.
  - A new **programa** still re-asks the windows of the competitions it names.
  - `start_date`, `end_date` and `other` re-ask nothing.
  1. Land the programa and all facts together.
  2. Wait for the export commit (or run `export_approved.mjs`) and merge `origin/main`.
  3. Dry-run the edition's videos, ask if over 50 windows, then run.
- **Glossary** (`data/glosario.md`): full heard phrases only ("Marley Piu → Marli Pugh", "Alwyn Green → Alwen Green"), never a bare first name.
- **Publish:** run `npm run build`, `npm test` and `pytest`, then branch → PR → `gh pr merge --squash --subject "…"` after the OK. No AI attribution lines.

## Common mistakes

| Mistake | Instead |
|---|---|
| "la conducción a cargo de" → always `presentadores` | Read the context: next to *ceremonia / Círculo / Gorsedd* it hands the **ceremony** over (`other`). In the session it means the host. |
| Presider ("invitamos a presidir", "designación del presidente de la sesión") as presenter | `other` "Presidió la sesión: X.", after asking |
| Looking for the presenters in the transcription or the locutores script | Neither names them: read the programa del día **source file**, credits block `Locución:` (2007, 2011) |
| A name the vision model "read" with no card in the frame | It invents names (EQhLqG1fO2o t=1400): only a Tesseract match or a second text counts |
| `build_catalog --only <id>` as a "check" | It uploads to R2: always `--no-upload` until the OK |
| `ocr.py` on a list of people | It's public; use private tesseract |
| Vision-model text loaded alone | Needs Tesseract or a second source |
| Loading facts after the reconstruction | Facts first, then one re-ask per edition (now small: only windows that may mishear the new names) |
| A Kaggle job that "starts at once" | Check it has a GPU: `NvidiaL4` is not offered and runs on CPU. GPU jobs here can queue for hours, so Colab goes first |
| Trusting an on-screen year | Stage banners misread 2022 as 2002/2922; year changes go to review |
| `pkill -f <pattern>` on a remote runtime | It kills its own shell; use a `[b]racket` pattern |
