# Otros festivales: stored, not published (design)

Approved 2026-11-18.

**Intent.** Use the same cataloguing rules for the archive's videos as the site will
use later, but publish nothing new yet: small eisteddfodau and children's videos wait
for the privacy periods of issue #29.

**Rule.** The four main festivals are Chubut, Juventud, Mimosa and Trevelin. Any other
festival folder in `VIDEOS.tsv` / `Videos/` belongs to "Otros festivales"
(stored in the archive, not exported to the site). Interviews and news are kind
`noticia`. Videos of eisteddfodau abroad (e.g. Eisteddfod de Gales) are not archived.
Videos with no known festival stay in `_sin_clasificar`.

**Approaches.** (a) Archive only: the folder is the event, the export already skips
non-main festivals: no site or database change. Chosen. (b) A hidden fifth festival
`otros` on the site: database constraint change plus 22 files and 7 languages, for
content not shown yet. Rejected for now; it is the path when Otros is published.

**Changes (archive data, `../VIDEOS.tsv` and `../Videos/`).**
1. `Eisteddfod_de_Camwy` (14) → `Micro_Eisteddfod_de_Camwy` (the user: there is no
   separate Eisteddfod de Camwy).
2. `Mini_Eisteddfod_William_Morris` (2) → `Eisteddfod_de_Dolavon` (held at Colegio
   William Morris, Dolavon; includes an adult choir, so not only a school event).
3. Esquel: delete `k8Vuwdn8fmc` (Eisteddfod de Gales) row and thumbnail; move
   `ITLEsdZoBAM` (radio interview, poet Alejandro Jones, silver medal 2023) to
   `_sin_clasificar`, kind `noticia`, year 2023. Folder `Eisteddfod_de_Esquel` goes.
4. `Eisteddfod_Infantil_de_Trevelin` (31) and `Eisteddfod_Juvenil_de_Trevelin` (1) →
   `Eisteddfod_de_Trevelin` (the user: Trevelin holds one event).
5. Thumbnails move with their rows; `thumb_path` updated. The private backup follows
   through its symlinked list: saved files keep their path (INDEX `file`).

**Site.** `scripts/export_videos.py` keeps the 32 Trevelin Infantil/Juvenil videos out
(title match), with a comment pointing to #29. No other site change.

**Docs.** The rules above go in the `youtube-eisteddfod-harvest` skill; a comment on
#29 says that publishing Otros and the Trevelin children waits for it.

**Left to the builder.** How to mark the held-back Trevelin rows (title match is the
call); order of operations; tests for the export filter.
