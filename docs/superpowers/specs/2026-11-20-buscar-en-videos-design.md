# Search what is said in the videos

**Why.** 518 of the archive's videos have a transcription, but it could only be
searched inside one open video. A visitor should type a word on an edition page
and see which videos say it, with the line and its time, and jump there; and
take the same query to every year.

**Goals.** Simple, cheap, permissive: no server, no new dependency, accents and
case ignored, results as you type. **Non-goals:** typo-tolerant matching,
changing Pagefind, the rest of issue #47 (copy button, links per line and per
chapter). **Anti-goal:** downloading every transcription on every edition page.

## Approaches

1. **One search file per edition, built at build time (chosen).** The edition
   page fetches its own (20–170 KB compressed) when the visitor reaches for the
   box; `/buscar/` fetches all of them, four at a time, newest first (1.1 MB
   compressed in total). One format, one matching code, exact line and second.
2. **Transcripts in Pagefind.** Lighter on `/buscar/`, but results are excerpts
   without the line or its time, and the edition page would need its own search
   anyway.
3. **One file for all years.** Simplest, but the edition page would pay for
   every year.

## How it is built

- `lib/video-search-data.ts` (build only) groups the transcribed videos by
  edition; `pages/datos/videos-texto/[edicion].json.ts` and `indice.json.ts`
  publish them.
- `lib/video-search.ts` (pure, tested): query → folded words; a line answers
  alone or together with the next one (caption lines are 3–8 words), counted
  once, where the phrase starts. `matches()` is the one rule that says how
  permissive the search is.
- `lib/video-hash.ts` + `scripts/reproductor.ts`: `#v=<id>&t=<seconds>` opens
  the player at that moment; the player keeps the hash while open
  (`replaceState`, no history entries) and clears it on close. Search results
  are plain links to that address.
- `components/VideoSearch.astro` + `scripts/buscar-videos.ts`: the box, in the
  Videos section of an edition (only when it has transcriptions) and in the
  Videos tab of `/buscar/` (`?en=videos&q=…`). "Buscar en otras ediciones"
  carries the query from one to the other.

## Left for later

- Issue #47: "copy link to this moment", links per transcript line and chapter.
- A video moved to another edition after the last build is searched under its
  old edition until the next build; its link then opens nothing there.
