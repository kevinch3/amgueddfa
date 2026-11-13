# Amgueddfa Eisteddfod y Wladfa — design

## Context / why
We have a private archive of 751 files (328 MB) of Eisteddfod programs and related documents for Chubut (Trelew), Juventud (Gaiman), Mimosa (Puerto Madryn) and Trevelin, organized as `<Festival>/<Year>/<Category>/` with each file's origin in `SOURCES.tsv`. It has many gaps: years with no full program, Facebook flyers whose year was only inferred, and missing results.

The user wants a public, collaborative "museum" site where the community can browse the collection in low resolution, pick a festival and an edition, and fill in what's missing. A game layer should motivate contributions, and a quick email verification should keep bots out and give each contributor a persistent identity. The aim is to first crowdsource the gaps, then grow into a checked reference archive for the associations and the Welsh-Patagonian community.

## Decisions (user)
- **Name:** *Amgueddfa Eisteddfod y Wladfa*.
- **Language:** Argentine Spanish (vos) first, structured so Welsh (`cy`) can be added later. All interface text goes in translation files from day one.
- **Where:** a new GitHub project in this folder, published on GitHub Pages.
- **Low resolution:** images are reduced but still readable. Full-size originals are never published.
- **Navigation:** choose festival → choose edition (year) → see what exists and what's missing → contribute.
- **Contribution types (all four):**
  1. upload a scan or photo of a missing document;
  2. enter structured facts (dates, venue, presenters, chair and crown winners, competition list rows);
  3. micro-tasks on existing items (confirm or correct year and category, transcribe a page);
  4. memories / free-text comments on an edition.
- **Review:** admins approve **everything** before it is public. The admin is the user, plus anyone they promote later.
- **Visibility:** browsing is public. Contributing requires a verified email.
- **Stack: approach A.** A static site on GitHub Pages plus Supabase (email OTP auth, Postgres, Storage, row-level security).

## Goals / non-goals / anti-goals
- **Goals:**
  - Make the coverage gaps visible and fun to close.
  - Every published item keeps its source.
  - Very low friction for older, non-technical community members (mobile first, a 6-digit code instead of passwords).
- **Non-goals (v1):**
  - Welsh translation content (only the structure for it).
  - A native app.
  - Peer approval (keep counters in the data model for later).
  - Full-text OCR search.
- **Anti-goals:**
  - Publishing full-resolution originals.
  - Exposing participants' personal data from results or inscription sheets without review.
  - Anything that requires a GitHub account or a password to contribute.
  - Spam reaching the public site.

## Approaches considered
- **A: GitHub Pages + Supabase.** Chosen. It needs the least custom security code and is free, and the static catalog keeps working even if Supabase is down. Cost: a free Supabase project pauses after a week idle, so a scheduled GitHub Action pings it daily.
- **B: Cloudflare Pages + Workers + D1/R2.** Rejected: we would have to write the auth, upload and email code ourselves.
- **C: PocketBase on kpc behind a tunnel.** Rejected: uptime depends on the home server, and it exposes the home network.

## Design

### Repo layout (builder's call, proposed)
- The repo lives in a subfolder `amgueddfa/`, which is the git root and pushed to a **public** GitHub repo (required for free Pages). The archive folders stay outside it and are never committed.
- `amgueddfa/scripts/build_catalog.py` reads `../SOURCES.tsv`, walks `../<Festival>/…` and produces:
  - `site/src/data/catalog.json`: one entry per item with id, festival, year, category, title, kind, source_url, retrieved, notes, `year_inferred` flag, derivative paths and `restricted` flag;
  - derivatives in `site/public/media/…`:
    - images: WebP, long side 1200 px, quality ~70, plus a 320 px thumbnail;
    - PDFs: first-page preview plus a page-by-page low-res WebP strip (all pages, so programs are readable), with no PDF republished;
    - DOC, PPTX, XLS and HTML: a converted PDF via LibreOffice, then the same treatment, or just a preview of the first page plus the source link;
    - CSV competition lists: rendered as tables.
  - The target total is under 100 MB.
  - **Item id (my call):** the first 12 hex digits of the SHA-256 of the file *content*, so ids survive files being moved or renamed.
  - **Corrections overlay (my call):** approved year, category or festival corrections never move files. They are stored as an overlay (`data/approved/overrides.json`) that the build applies on top of the archive layout.
  - **Where the build runs (my call):** the script runs **locally only**, because only this machine has the archive. Its output is committed, and CI only builds and deploys the site from committed data.
- **Public `notes` (my call):** the catalog does **not** publish the raw `notes` column. About 569 rows contain scraped Facebook text with commenters' names and the "Comment as …" UI string. The build writes a cleaned `note_public` instead:
  - for Facebook items, the page's own caption only: cut at the first comment marker, with names and timestamps removed, max ~300 characters;
  - for everything else, the human-written note.
  - `source_url` is always published.
  - The five pre-existing files with no recorded origin are published as "Colección inicial (origen no registrado)".
- **Restricted items (my call):** derivatives of `restricted` items are **never committed**. Instead the local build uploads them to a private Supabase bucket `restricted/` with the service key, run from the local `.env`, never in CI. The page shows a "Disponible tras revisión" placeholder, and admins see a signed URL. When an admin releases an item, a DB function marks it released and copies the file to the public bucket `media/`. The edition page then loads released items' previews from that bucket (a live read), so no rebuild or local step is needed.
- `site/`: an Astro static site with an i18n folder `site/src/i18n/es-AR.json` (`cy.json` later). Interactive parts (login, contribute, admin, profile) are small client-side islands using `@supabase/supabase-js`.
- `supabase/migrations/*.sql`: the schema, row-level security and functions, under version control.
- `.github/workflows/`:
  - `deploy.yml`: build and deploy to Pages on push;
  - `keepalive.yml`: daily Supabase ping;
  - `export.yml`: weekly export of approved contributions to `data/approved/*.json`, committed so git keeps a durable copy, and the next build merges approved facts into the static pages.

### Pages
- **`/`:** the coverage map, a festivals × years grid coloured by state (full program / some material / empty). Also headline counters, a "most wanted" list (the biggest gaps) and recent approved contributions.
- **`/<festival>/`:** a timeline of editions with coverage state.
- **`/<festival>/<year>/`:** the edition page. It shows:
  - the category sections (Programa, Programa del día, Preliminares, Bases y avisos, Resultados, Otros), with thumbnails and a lightbox viewer;
  - empty slots, e.g. "Todavía no tenemos el programa completo — ¿lo tenés?";
  - an edition facts card;
  - approved memories;
  - a "Contribuir" button.
- **`/item/<id>`:** the viewer, with source/origin info and the micro-task buttons ("¿El año es correcto?", "Transcribir").
- **`/tareas`:** a quick-task feed, one micro-task at a time. It is seeded with the ~640 Facebook images whose year or category was inferred.
- **`/ingresar`:** sign in with an email OTP. Ask for an email, send a 6-digit code (Supabase `signInWithOtp`), then choose a display name. The session persists in the browser (Supabase refresh token).
- **`/perfil/<display>`:** points, badges, contributions (pendiente / aprobada / rechazada).
- **`/ranking`:** a leaderboard, overall and per festival.
- **`/admin`:** only for the admin role. A review queue (oldest first, filter by type) with approve / reject with reason / edit-and-approve, a preview of uploads, the ability to release restricted items, and the ability to promote users.

### Data model (Supabase)
- **`profiles`:** id (= `auth.users.id`), display_name, role (`user` | `admin`), points, created_at.
- **`contributions`:** id, user_id, type (`upload` | `fact` | `tag` | `transcription` | `memory`), festival, year, item_id (nullable), payload (jsonb), status (`pending` | `approved` | `rejected`), reviewer_id, review_note, confirm_count (reserved for future peer review), created_at, reviewed_at.
  - `fact` payload: `{field, value}`. Fields: start_date, end_date, venue, presentadores, ganador_silla, ganador_corona, other; or a competition row.
  - `tag` payload: `{year?, category?, festival?}`.
  - `upload` payload: `{storage_path, category, description}`.
- **`badges`** and **`user_badges`**.
- **`editions` (my call):** festival, year, status (`unknown` | `held` | `not_held`), note.
  - The coverage grid for each festival starts at the earliest year that has material, or an admin-set founding year.
  - Cells default to `unknown`. They appear as "¿Se realizó?" (light grey) rather than "missing", so the site never begs for programs of editions that never happened.
  - A `fact` with `field: "edicion_realizada"` (yes/no) is a contribution type like any other. "Most wanted" lists only `held` editions with no program.
- **`released_items`:** item_id, released_by, released_at (see restricted items above).
- **Storage buckets:**
  - `uploads/` (private): contributors' originals; admins see them through signed URLs.
  - `restricted/` (private).
  - `media/` (public): low-res derivatives of approved uploads and released items.
  - **Approved uploads (my call):** on approval, a Supabase Edge Function makes the low-res WebP into `media/` straight away. The user can later pull originals into the local archive with `scripts/sync_uploads.py`, which writes `SOURCES.tsv` rows with source "Aporte de <display_name>, <date>".
- **Live data vs static (my call):** the static catalog is the base layer. Approved contributions show **immediately**, because edition pages, the home page "recientes", profiles and the leaderboard read approved rows live from Supabase (anon, RLS: status = approved). If Supabase is unreachable, the pages fall back to the last export. The weekly `export.yml` exists only to keep a durable copy in git and to bake approved facts into the static pages for search engines.
- **Row-level security:**
  - users insert only their own pending contributions and read their own;
  - anyone reads approved ones;
  - only admins update status and role.
- **Approval:** a Postgres function (`approve_contribution`) sets the status, awards points and checks badges, so scoring can't be done from the client.

### Gamification (initial values, tunable)
- **Points per approved contribution:**
  - upload that fills an empty category for an edition: **50** (otherwise 20);
  - fact: 10;
  - transcription: 15;
  - tag confirmation or correction: 2;
  - memory: 5.
  - Points count only after approval, and pending points show greyed out.
- **Badges:**
  - first contribution;
  - "Archivista de <Festival>" (10 approved for that festival);
  - "Cazador de programas" (first full program for an edition);
  - "Bardo" (memories);
  - "Ojo de lince" (50 tags).
- **Collective progress:** the coverage map fills in, and a "Most wanted" list names the editions with no program.

### Anti-bot / abuse
- The email OTP itself is the main defence.
- Supabase auth rate limits stay on.
- A per-user daily cap on pending contributions, e.g. 30.
- Upload limits: images or PDF, 20 MB max.
- Optional Cloudflare Turnstile on `/ingresar` if bots still get through (Supabase supports captcha natively).

### Rights / personal data
- Every item shows its origin (from `SOURCES.tsv`).
- Items in `Resultados`, plus any file the user flags, start as `restricted`: metadata and title are visible, the preview is hidden ("Disponible tras revisión"), until an admin releases them.
- A footer note invites the associations to request removal or correction.
- Recommended, not blocking: tell the associations before launch.

### Deployment
- GitHub repo `amgueddfa-eisteddfod` (name is builder's call) under the user's account, created with `gh`.
- Pages via Actions.
- Supabase project created by the user (free tier). Its URL and anon key go in repo variables, since the anon key is designed to be public and RLS protects the data. The service key goes only in the Actions secret used by `export.yml`.
- Supabase SMTP: the built-in sender is rate-limited (a few emails per hour). For launch, configure custom SMTP (e.g. Resend free tier) so OTP emails come from the project's address.

## Left to the builder
- The exact Astro setup and component library.
- Visual design, using the `frontend-design` skill. Direction: a warm "museum" feel (paper, gold or red accents, Welsh dragon / chair motif), accessible and mobile first.
- Derivative quality tuning within the "low-res but readable" bound.
- Badge art, and the exact copy in es-AR.

## Next step after approval
Copy this doc to `amgueddfa/docs/superpowers/specs/2026-11-13-amgueddfa-design.md` (the first commit of the new repo), then write the step-by-step implementation plan (superpowers:writing-plans).

Expected order:
1. catalog + derivatives script;
2. static Astro site (browse only);
3. Supabase schema + RLS + OTP sign-in;
4. contribution flows;
5. admin queue + scoring;
6. game layer;
7. Actions + deploy.

The user must create the Supabase project and paste its keys at step 3. That is account creation, which I won't do.

## Verification
- `python scripts/build_catalog.py` produces `catalog.json` with 751 items, each with a source. Derivatives total under ~100 MB, and spot-checked PDFs are readable at the chosen resolution.
- `npm run build && npm run preview` (Astro). Check that the coverage map matches `INDEX.md` and that edition pages for Chubut 2024 and Trevelin 2011 render.
- Run Supabase locally (`supabase start`) and walk the full flow in Chrome on localhost with a local test account (Inbucket catches the OTP email):
  - OTP sign-in;
  - submit one contribution of each type;
  - check they appear as pending;
  - approve from `/admin`;
  - check points and badges update;
  - check RLS: a non-admin cannot approve.
- Run the export workflow locally, check that approved facts show on the rebuilt edition page, then deploy to Pages.
