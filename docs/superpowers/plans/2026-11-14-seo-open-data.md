# Search Engines, AI Crawlers and Open Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every public page discoverable and machine-readable, and publish the archive as open data, without exposing restricted items.

**Architecture:** Pure builders in `src/lib/seo.ts` (descriptions, JSON-LD, sitemap XML, data records); `Base.astro` renders canonical/OG/noindex/JSON-LD; Astro static endpoints emit `sitemap.xml`, `datos/*.json` and `llms.txt`; `public/robots.txt` is static.

**Tech Stack:** Astro static endpoints, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-seo-open-data-design.md`

## Global Constraints
- Site origin `https://amgueddfa.kevinroberts.ar` (`astro.config.mjs` `site`); all URLs absolute in sitemap, canonical, OG and data files.
- Restricted items: never in sitemap, JSON-LD, OG images or data files.
- `noindex` + out of sitemap: `/admin/`, `/perfil/`, `/ingresar/`, `/contribuir/`, 404.
- JSON-LD embedded with `jsonForScript` (escapes `</script>`).

## Review Focus
- A restricted item id never appears in `sitemap.xml`, `datos/documentos.json` or any JSON-LD. Build test, Task 3.
- An edition with no approved facts still gets a valid `Event` (name, url) with no empty `startDate`/`location`. Unit test, Task 1.
- An edition marked not held gets `eventStatus` `EventCancelled`. Unit test, Task 1.
- Facts with a `fuente` keep it in `datos/ediciones.json`. Build test, Task 3.
- Characters like `&` and `<` in titles are escaped in `sitemap.xml`. Unit test, Task 1.

### Task 1: `src/lib/seo.ts` builders (tested)
- Produces: `absUrl(path)`, `xmlEscape(s)`, `sitemapXml(urls: string[])`, `editionFacts(approved, f, y)` → `{ startDate?, endDate?, venue?, silla?, corona?, notHeld }`, `editionDescription(name, year, state, facts, docs)`, `editionJsonLd({ name, year, url, image, facts })`, `itemJsonLd({ item, url, image, editionUrl })`, `siteJsonLd()`.
- Steps: write `tests-js/seo.test.ts` (Review Focus cases + 1937-style Event with `startDate: '1937-12-08'`, `location.name`), watch it fail, implement, pass, commit `seo: builders for descriptions, JSON-LD and sitemap`.

### Task 2: Base layout and per-page metadata
- `Base.astro` props `image?`, `noindex?`, `jsonLd?`; renders canonical, `og:title/description/url/type/image/locale`, `twitter:card`, robots meta, JSON-LD. Year, item, festival and home pages pass description/image/JSON-LD; private pages pass `noindex`.
- Build assertions first (canonical on a year page; `og:image` = cover on Chubut 1937's page if it has one; `"@type":"Event"` with `1937-12-08`; admin has `noindex`), then implement, commit `seo: canonical, social tags, noindex and JSON-LD per page`.

### Task 3: robots.txt, sitemap, open data, llms.txt
- `public/robots.txt`; endpoints `src/pages/sitemap.xml.ts`, `src/pages/datos/ediciones.json.ts`, `src/pages/datos/documentos.json.ts`, `src/pages/llms.txt.ts`.
- Build assertions first (robots allows all and names the sitemap; sitemap has `/chubut/1937/` and a public item, no restricted id, no `/admin/`; data files parse, no restricted id, a fact with `fuente` kept; llms.txt links the data files), then implement, commit `seo: robots.txt, sitemap, open data files and llms.txt`.
