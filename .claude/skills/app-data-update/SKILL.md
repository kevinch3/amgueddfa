---
name: app-data-update
description: Use when someone sends data for the archive outside the site (email, WhatsApp, a list from a contributor) — edition dates, venues, winners, sillas, coronas, notes, years not held, a memory, a scan — or when an item's year, festival, category, title or rights are wrong, or when a fact already loaded must be fixed or removed. Covers loading on a contributor's behalf from the CLI without the admin panel.
---

# Updating the app's data

The live database (Supabase) is the source. Approved rows show on the site **at once** through the
`public_contributions` view; `data/approved/*.json` is a snapshot that `export.yml` refreshes every
15 minutes. Programa / Ganadores transcriptions have their own skill (`programa-transcription`).

All SQL goes through the helper, from the repo root:

```bash
H=.claude/skills/app-data-update/db.py
python3 -I $H query "select …"            # read-only checks
python3 -I $H facts batch.json --dry-run  # print the SQL, then run without --dry-run
python3 -I $H exec change.sql             # any write, atomic, as the admin
```

`exec` and `facts` run as the admin (JWT claims set), so the `admin_*` and `approve_contribution`
functions work. Find a contributor's uuid with
`query "select id, display_name from profiles where display_name ilike '%gwen%'"`.

## Which path

| What arrived | Path | Credited to | Notes |
|---|---|---|---|
| Date, venue, winner, silla, corona, note, competencia of an edition | `facts` (→ `admin_add_facts`) | contributor | one batch = one `lote`; 10 pts each; a row `[field, value, fuente]` carries its own source (video moment, clipping) |
| Edition held / not held | fact `edicion_realizada` `si`/`no` | contributor | **the only thing that sets `editions.status`**; a "no" also gets an `other` note with the reason |
| Item's year, festival, category, title, rights, caption, no_text, hidden | `admin_correct_item(item, festival, year, payload)` | admin, 0 pts | `festival`/`year` args = the item's **current** ones from `src/data/catalog.json`; latest approved tag wins |
| Memory (recuerdo) | insert `memory` row `pending`, then `approve_contribution` | contributor | text 10–5000 chars; 5 pts |
| Scan / photo / PDF | upload original, insert `upload` row `pending`, **approve in the browser** (/admin) | contributor | the browser makes the webp pages + thumb; then `python3 -m scripts.sync_uploads`, `build_catalog` |
| Fix or remove a fact already loaded | `update`/`delete` on `contributions` by id | — | see below; nothing un-approves, so edit the row |

## Facts: interpretation rules (the user's)

- "ganó / ganador X" **without** silla or corona → `other` "Ganador: X." (or "Ganadora: X."). Only an explicit
  silla/sillón → `ganador_silla`, corona → `ganador_corona`.
- Venue or winner known → also `edicion_realizada` `si`. "No hubo" → `no` + reason note; reason unknown →
  ask the contributor, or note "No se realizó; se desconoce el motivo."
- Contributor not in `profiles` (never signed up) → stop and ask; facts can only be credited to an account.
- Contributor unsure → `"fuente": "<Name> (sin confirmar)"` on every fact. A year they list with nothing
  known → `other` "Sin datos de sede ni de ganador." and **no** `edicion_realizada`. A known winner but no
  venue → append "Sin datos de la sede." to the winner note.
- Venues follow `Place, Town` — reuse the existing spelling (`query` the venues below) instead of a new
  variant. Ask before correcting a place or person name; normalise one person's variants to the form
  already in the data.
- Leave out unverified accusations about people (who killed whom, political blame); ask the user.
- Values ≤ 500 chars, fuente ≤ 200; validate with `validate('fact', …)` from `src/lib/contrib.ts` in a
  throwaway `tests-js/zz_*.test.ts` (vitest only picks up `tests-js/`), run, delete.

Before loading, see what the editions already hold, so you add only what's new:

```bash
python3 -I $H query "select year, payload->>'field' f, payload->>'value' v, payload->>'fuente' src
  from contributions where festival='chubut' and year between 1937 and 1950
  and status='approved' and type='fact' order by year"
python3 -I $H query "select payload->>'value' v, count(*) from contributions
  where payload->>'field'='venue' and status='approved' group by 1 order by 2 desc"
```

## Memory and upload SQL (for `exec`)

```sql
-- memory credited to a contributor (RLS is bypassed: the API runs as postgres).
-- Pick the row id yourself (python3 -c 'import uuid;print(uuid.uuid4())'): exec has no variables.
insert into public.contributions (id, user_id, created_by, type, festival, year, payload, status)
  values ('<new uuid>', '<contributor uuid>', '347c144e-6c6e-4d6a-9bf9-14505a624a9d',
          'memory', 'chubut', 1958, '{"text":"…"}', 'pending');
perform public.approve_contribution('<new uuid>', false, null);

-- item correction (catalog id from src/data/catalog.json → items[].id; its CURRENT festival and year,
-- null when the item has no year)
perform public.admin_correct_item('3fa9c2d1e0b7', 'trevelin', 1962, '{"year": 1963}'::jsonb);
```

**Dry-run any `exec`**: end the file with `raise exception 'ROLLBACK_OK';`. The error proves every
line before it ran, and the whole block is rolled back.

Upload: put the original in the private `uploads` bucket at `uploads/<contributor uuid>/<new uuid>.<ext>`
(Storage API with `SUPABASE_SERVICE_ROLE_KEY`; jpg/png/webp/pdf ≤ 20 MB), insert the `upload` row with
`payload {"category", "alcance" (programa only: completo|tapa|parcial), "description"?, "storage_path"}`
and `status 'pending'`, then tell the user to approve it from /admin. Don't approve uploads from SQL:
the page images would be missing.

## Fixing a loaded fact

```bash
python3 -I $H query "select id, year, payload from contributions where type='fact' and payload->>'value' ilike '%asesinado%'"
```
then `exec`: `update public.contributions set payload = jsonb_set(payload, '{value}', to_jsonb('…'::text)) where id = '<id>';`
To remove one, `delete … where id = '<id>'` (if it was `edicion_realizada`, also fix `editions`).
Check the id first; a broad `where` can hit other contributors' rows.

Edit a row only on the word of the person it's credited to (or the user). When someone else contradicts
it, add their version as a new fact credited to them and ask the user whether to change the original.

## Afterwards (every path)

1. Re-run the check `query`: rows `approved`, counts as expected.
2. `node --env-file=.env scripts/export_approved.mjs`, `npm run build`, `npm test` (plus
   `python3 -m pytest tests` if the catalog changed).
3. Commit `data: <festival> <years> from <contributor> (…)` with `data/approved/` — no AI attribution
   lines in the message.
4. **Ask before `git push`**: it deploys amgueddfa.org.

## Common mistakes

- Crediting an item correction to the contributor with a hand-built `tag` row: use `admin_correct_item`.
- Passing the corrected year as `admin_correct_item`'s `p_year`: it's the current one; the new one goes in the payload.
- `edicion_realizada` "si" for a year with no venue or winner.
- A new venue spelling ("Salón San David de Trelew" next to "Salón San David, Trelew").
- Hand-quoting SQL in curl: apostrophes in names (O'Neill) break it — use the helper.
