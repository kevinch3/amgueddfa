# Search engines, AI crawlers and open data

## Why
All the archive's information is open. Search engines and bots (AI crawlers
included) should find it, understand it, and be able to reuse it.

## Goals / non-goals
- Every public page discoverable (sitemap), described, and with a canonical URL.
- Machine-readable meaning: schema.org JSON-LD for editions, documents and the site.
- Open data files and an `llms.txt` for bots that consume data directly.
- All crawlers allowed, AI crawlers included (decided: the content is open).
- Anti-goal: restricted documents never appear in the sitemap, JSON-LD or data
  files. Private pages (admin, perfil, ingresar, contribuir, 404) are `noindex`
  and left out of the sitemap.

## Design
- `public/robots.txt`: `User-agent: *` / `Allow: /`, disallow the private
  pages, and point to the sitemap. No per-bot blocks.
- `/sitemap.xml` (Astro endpoint): home, ranking, tareas, festival pages,
  "sin año" pages, every year page in range, every non-restricted item page.
- `Base.astro`: canonical link, `og:*` / `twitter:card` tags (image when the
  page has one: the edition cover or the document thumbnail), optional
  `noindex`, optional JSON-LD.
- Per-page descriptions: year pages from their data (state, date, place,
  chair winner, document count); item pages from title, festival and year;
  festival pages with their span.
- JSON-LD (`src/lib/seo.ts`, pure and tested):
  - home: `WebSite` + `ArchiveOrganization`;
  - year page: `Event` (name, startDate/endDate and location from approved
    facts, image = cover, `eventStatus` `EventCancelled` when the edition did
    not happen, `isAccessibleForFree`);
  - item page: `ArchiveComponent` (name, image, `about` the edition, `holdingArchive`).
- Open data: `/datos/ediciones.json` (every edition in range: url, state,
  cover, approved public facts with fuente, document count) and
  `/datos/documentos.json` (every non-restricted item: id, title, festival,
  year, category, url, thumbnail and page image URLs, source).
- `/llms.txt`: what the site is, how it is organised, links to the data files.

## Left to the builder
Exact description wording, field names inside the data files.
