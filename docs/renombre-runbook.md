# Switch-over: one vocabulary (steps 4 and 5 of the data rules)

Design: `docs/superpowers/specs/2026-11-27-reglas-de-datos-design.md`. Maintainer's decisions
(2026-11-27): rename the database and the code together; one shot, accepting about two
minutes in which signing in, contributing and live updates fail; records get `coleccion`,
`fecha`, `tipo`, `formato`; editions and contributions keep `year`.

## What changes

| Where | Before | After |
|---|---|---|
| Database columns (`contributions`, `badges`, `editions`, `transcriptions`, `transcription_history`) | `festival` | `coleccion`, a foreign key to the new `colecciones` table |
| Views | `festival`, `leaderboard.festival_points` | `coleccion`, `coleccion_points` |
| Function parameters | `p_festival` | `p_coleccion` (`admin_add_facts`, `admin_correct_item`, `admin_save_transcription`, `video_text_valid`) |
| Stored payloads | `category`; a tag's or fix's `festival` | `tipo`; `coleccion` |
| Rules | fixed lists of four names | the `colecciones` table (`ganadores_publicos`, `texto_de_videos`) |
| Catalog and video records | `festival`, `year`, `year_inferred`, `undated`, `category`, `kind` | `coleccion`, `fecha {year, inferred, undated}`, `tipo`, `formato` (a video keeps `kind` as its subtype) |
| Open data (`documentos.json`, `ediciones.json`), page text | — | unchanged (checked: all 7,773 pages read the same) |

## Order (about 5 minutes; the maintainer runs or OKs each production step)

1. **Dry run** against production: `supabase db push --dry-run --db-url …` must list exactly one
   migration, `20261127000001_colecciones.sql`. Anything else: stop.
2. **Merge** the pull request. The deploy starts (about 90 s). From now until step 3 is done the
   live site asks for `coleccion`, which the database does not have yet.
3. **Apply** at once: `supabase db push --yes --db-url …`.
4. **Check** (read-only):
   - `select coleccion, count(*) from contributions group by 1` gives the four collections;
   - `select count(*) from contributions where payload ? 'category' or payload ? 'festival'` is 0;
   - `select coleccion_points from leaderboard limit 1` works as `anon`;
   - run the export (`gh workflow run export.yml`): it must succeed, and its commit, if any,
     must not bring back `festival` or `category`;
   - on amgueddfa.org: /eisteddfod/ranking/ lists people; an edition page shows its facts;
     /admin/ loads the queue; a test correction in the admin saves.
5. **Memory**: the app-data-update skill and `db.py` already use the new names.

## If it fails

- Step 3 fails: nothing changed in the database (each migration runs in one transaction);
  revert the merge (`git revert`) and redeploy.
- Problems after step 3: run `docs/renombre-rollback.sql` (tested: it restores the old names,
  checks, payload keys and functions, and drops `colecciones`), then revert the merge.

The scheduled export (every 15 minutes) may fail once during the switch; it writes nothing when
it fails.
