# Bulk facts: send several, approve as a group, admins publish directly

## Why

Entering one source (e.g. a book page about Chubut 1937) took eight separate
submissions and eight separate approvals. Facts must be addable and approvable
in bulk so transcribing a source is one flow, not eight interruptions.

## Goals / non-goals

- Any contributor sends several facts in one submission, with an optional
  shared **Fuente** (source) that is **shown publicly** next to each fact.
- Admins see facts sent together as one group in "Para revisar" and can
  approve or reject the whole group (each fact still individually).
- Admins can load facts directly (published without review) and credit them
  to another person, who gets the points and badges.
- Non-goal: bulk uploads or memories. Non-goal: editing facts after approval.
- Anti-goal: bulk must not bypass review for non-admins, nor the daily limit
  for non-admins.

## Approaches considered (chosen: C)

- A) Admin-only direct loader — rejected alone: contributors keep the
  one-by-one pain.
- B) Contributor multi-fact submission + "Aprobar todos" — rejected alone:
  an admin transcribing still reviews their own entries.
- **C) Both (chosen).**

## Design

### Contributor: several facts per submission (`/contribuir`, Datos tab)
- The current fact editor stays; **"+ Agregar otro dato"** validates the fact
  being edited, moves it to a list below (each row removable) and clears the
  editor. **"Enviar"** sends the list plus the fact in the editor if filled.
- **Up to 15 facts per submission** *(our call)*. They count toward the
  existing 30-per-24h limit; the whole submission is one insert, so it is all
  or nothing if the limit is hit.
- Optional **"Fuente"** text (≤ 200 chars), shared by all facts of the
  submission, stored as `payload.fuente` on each.
- All facts of one submission share `payload.lote` (a uuid) so the queue can
  group them. No schema change for this.

### Public display
- Year page (static build and live hydration) and the "no page yet" screen
  show "Fuente: …" under a fact that has one.

### Admin: groups in "Para revisar"
- Pending facts with the same `lote` render as one group with
  **"Aprobar todos (n)"** and **"Rechazar todos"** (one reason for all).
  Each fact keeps its own approve / reject.
- Approving a group approves each fact through the existing
  `approve_contribution` (points and badges per fact, as now).

### Admin: "Cargar datos" tab (direct, no review)
- Festival, year, **"Acreditar a"** (user picker, defaults to the admin),
  the same fact editor and list, Fuente, and **"Publicar"**.
- New DB function `admin_add_facts(target uuid, festival text, year int,
  facts jsonb)`: admin-only; inserts the facts for `target` and approves each
  via `approve_contribution`, so points, badges and edition status behave
  exactly as a normal approval. One transaction.
- **Admins are exempt from the 30-per-24h limit** (`limit_daily` skips when
  `is_admin()`) *(our call)*. Applied with `supabase db push`.

## Left to the builder

- Copy (es-AR voseo), list styling, the user picker's exact control.
- Sharing the fact editor between `/contribuir` and the admin tab.
