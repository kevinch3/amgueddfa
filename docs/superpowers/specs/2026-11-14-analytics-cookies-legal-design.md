# Analytics, cookie management and the legal pages (issue #1)

## Intent

The archive's owner wants to know how the site is used:

- **which editions get viewed**;
- **where visitors come from**, both their country and the site that sent them;
- **when the rushes happen**, and whether a rush is **people signing in** or **people just browsing**.

Visitors should get a clear, honest account of what the site stores in their browser, and a way to say "don't count me".

The same round closes issue #1: the Objetivos, Derechos (takedown), Privacidad and Cookies pages, plus the code and data licences. The analytics change is exactly what the issue's cookie section said must trigger a review.

## Goals

- Page views, referrers, countries and visits over time for the public site, without cookies.
- Sign-ins over time, visible to admins in `/admin`.
- A `/cookies` page that lists every key the site stores in the browser, with a "No contar mis visitas" switch.
- `/objetivos`, `/derechos`, `/privacidad` and `/cookies`, all in es-AR with their text in `es-AR.json`, and linked from the footer.
- `LICENSE` (AGPL-3.0) for the code and a CC BY-SA 4.0 licence for community transcriptions and data, both mentioned on `/contribuir` and `/objetivos`.

## Non-goals

- Splitting page views into signed-in and anonymous visitors. Cloudflare can't do this, and the owner accepted that.
- A consent banner. Nothing stored needs consent (see Constraints).
- Custom events (lightbox opens, searches, upload funnel).
- Self-service account deletion or data export. Privacidad explains how to ask by email. Self-service is in the backlog.
- Review of the legal texts by the asociaciones. The owner said they have no say over this, so the pages ship as final, with no "borrador" note.

## Anti-goals (a failure even if it works)

- Any cookie, fingerprint, visitor ID, or per-person record of browsing or sign-ins.
- A Cookies page that disagrees with what the code actually stores.
- Analytics loading for someone who opted out, or whose browser sends DNT or GPC.
- Broken tests or local builds when no analytics token is configured.

## Constraints

- **Hosting.** The site is a static Astro site on GitHub Pages. The `kevinroberts.ar` DNS is on Cloudflare with `amgueddfa` set to DNS-only, so Cloudflare never sees page requests. That is why the JS beacon is needed: automatic edge analytics would not work.
- **Cloudflare Web Analytics.** Its beacon (`static.cloudflareinsights.com/beacon.min.js`, configured with `data-cf-beacon='{"token":"…"}'`) sets no cookies and no local storage. The token is public.
- **Who creates the site.** The owner creates the Web Analytics site in their Cloudflare dashboard. That is an account action only they can do, and it produces the token.
- **Existing browser storage:**
  - the Supabase session in localStorage (key `sb-<project-ref>-auth-token`, plus the PKCE verifier key during sign-in);
  - `amg:tz`.
  - Both are strictly necessary or a functional preference.
- **Consent under Argentine law (Ley 25.326):** no consent is needed for strictly necessary storage. UK and EU rules (Welsh visitors) only require consent for non-essential storage on the device. A cookieless beacon plus a storage-free opt-out flag stays outside that rule. The opt-out flag is the visitor's own choice, so storing it counts as functional.
- **Tests:** they must not depend on real data (see the project's memory note). `tests-js/build.test.ts` runs locally only.
- **Commits:** no AI attribution lines.

## Approaches considered

1. **Cloudflare Web Analytics plus a sign-in chart in `/admin` (chosen).** One script tag, free, cookieless, with real IP-based countries, referrers and visits per hour in the Cloudflare dashboard. Sign-ins come from our own hourly counter in Supabase.
   - Trade-off: the data lives in two places, there is no signed-in/anonymous split of page views, and Cloudflare keeps data for a limited window.
   - The owner chose it: "1 is fine, is a ok constrain".
2. **Our own counter in Supabase with an "Estadísticas" tab.** It would answer every question in one place and split signed-in from anonymous views.
   - Trade-off: about a day more work, weaker bot filtering, and countries guessed from timezone and language.
3. **GoatCounter or a similar hosted tool.** Dropped: the same shape as option 1, but with a new third-party account to run.

## Design

### 1. Analytics beacon

- New `src/lib/consent.ts` (pure, tested):
  - `OPT_OUT_KEY = 'amg:no-contar'`;
  - `shouldCount({ optOut, dnt, gpc }): boolean`, which returns false if any of them is true;
  - `readSignals(win)`, which reads `localStorage` inside try/catch, `navigator.doNotTrack === '1'` and `navigator.globalPrivacyControl === true`;
  - `setOptOut(on)`.
- New `src/components/Analytics.astro`, rendered in `<head>` by `Base.astro`:
  - It renders nothing unless `PUBLIC_CF_ANALYTICS_TOKEN` is set at build time.
  - When the token is set, it renders a small module script that calls `shouldCount(readSignals(window))`. Only if that is true does it inject the beacon `<script defer src=… data-cf-beacon=…>`.
  - The decision happens in the browser, because the site is static.
- `deploy.yml` gains `PUBLIC_CF_ANALYTICS_TOKEN: ${{ vars.PUBLIC_CF_ANALYTICS_TOKEN }}`. The README documents the dashboard step and the variable, alongside `PUBLIC_AUTH_CODE`.
- Private pages are counted too, since only the path is sent: `/admin`, `/perfil`, `/ingresar`. *Builder's call:* skip the beacon on `/admin` so admins' own visits don't inflate the numbers.

### 2. Sign-in counter and the "Estadísticas" tab

- **Migration** `supabase/migrations/20261116000001_signin_stats.sql`:
  - Table `public.signin_hours (hour timestamptz primary key, n integer not null default 0)` with RLS enabled, no policies, and all privileges revoked from anon and authenticated.
  - Trigger function `public.count_signin()`: security definer with a pinned search_path. It runs after update of `last_sign_in_at` on `auth.users` when the new value is not null and is distinct from the old one. It upserts `date_trunc('hour', new.last_sign_in_at)` with `n = n + 1`. It stores no user id.
  - RPC `public.admin_signin_stats(days int default 90) returns table(hour timestamptz, n int)`:
    - security definer;
    - raises `not_admin` unless the caller's profile role is admin;
    - clamps `days` to 1–366;
    - is granted to authenticated only.
  - There is no backfill: before the migration, only each user's latest sign-in exists. The tab says when counting started.
- **Test stub.** `supabase/tests/stub.sql` gets `last_sign_in_at timestamptz` on `auth.users`, the real column.
- **`/admin`.** `TABS` gains `'estadisticas'`, with a new panel rendered by `src/scripts/admin.ts` (or a new `src/scripts/admin-stats.ts`; builder's call). It shows, in the admin's timezone (`userTimeZone()`):
  - sign-ins per day for the last 90 days, as a simple bar row;
  - a weekday × hour grid of sign-in counts. This is the "when is the rush" view.
  - a line with the date counting started;
  - a link to the Cloudflare Web Analytics dashboard for page views, countries and referrers.
  - Pure helpers (bucketing hours into days and weekday × hour in a given timezone) live in a lib file and are unit-tested with explicit data.

### 3. Cookie management

- **`/cookies`:**
  - States plainly that the site uses **no cookies** and no tracking.
  - A table of what is stored in the browser:

    | Key | Purpose | Kind | Lifetime |
    | --- | --- | --- | --- |
    | `sb-…-auth-token` | keeps you signed in | necessary | until you sign out |
    | PKCE verifier | completes the email sign-in link | necessary | removed after sign-in |
    | `amg:tz` | shows dates in your timezone | preference | until you sign out |
    | `amg:no-contar` | remembers that you don't want to be counted | preference | until you turn the switch off |

  - Describes the Cloudflare Web Analytics beacon: what it sends (page URL, referrer, browser and country from the IP, which Cloudflare does not store), that it uses no cookies, and a link to Cloudflare's privacy notice.
  - The **"No contar mis visitas"** switch: a checkbox that calls `setOptOut`. It shows its current state, and says so when DNT or GPC already turns counting off.
- **Footer** (`Base.astro`) links: Objetivos · Derechos · Privacidad · Cookies. `pie.retiro` stays, and its "avisanos" now points to `/derechos`. The contact address stays an image only, as the existing build test requires.

### 4. Legal pages (issue #1)

All four are Astro pages using `Base.astro`, with copy in `es-AR.json` under `legal.*`.

- **`/objetivos`:**
  - preserve the Welsh-Patagonian Eisteddfod programmes, with the community filling in what's missing;
  - non-profit: no ads, no sale of data, no commercial use, and the associations keep ownership of their material;
  - open source: a link to `github.com/kevinch3/amgueddfa-eisteddfod`, AGPL-3.0 for the code and CC BY-SA 4.0 for contributions.
  - Linked from the footer and from the home page.
- **`/derechos`:**
  - the takedown and correction procedure: who may ask, what to include (which document, in what capacity, the reason), and that the answer comes within **10 business days**, with disputed material hidden while it is reviewed;
  - a DMCA-style notice and counter-notice, grounded in **Ley 11.723**;
  - that the site is served from GitHub Pages, so a DMCA notice can also go to GitHub;
  - the scope: low-resolution images for preservation and consultation, each credited to its asociación;
  - the contributor's declaration: by submitting, the contributor declares they may share the material, and their transcriptions and data are released under CC BY-SA 4.0.
- **`/privacidad`:**
  - the data controller: "Kevin Roberts, responsable del archivo", with contact by the image address;
  - the data held: email (for the sign-in code or link, never published, and not exposed by `public_contributions`), public name, optional public country, optional private timezone, contributions and points;
  - the hourly sign-in counts, which are not linked to anyone;
  - the processors: Supabase (auth and database), Cloudflare (R2 images and Web Analytics), GitHub Pages (hosting), and Resend once custom SMTP is active. Until then Supabase sends the emails. *Builder's call:* phrase this to stay true either way.
  - rights under **Ley 25.326**: access within 10 calendar days, correction or deletion within 5 business days, exercised by email. Deletion means account deletion. Contributions already published stay under CC BY-SA, credited or anonymised as the person asks.
- **`/cookies`:** described in section 3.
- **`/contribuir`:** one line about the CC BY-SA 4.0 licence with a link to `/objetivos`. The upload and transcription submit areas get a one-line declaration with a link to `/derechos`. There is no checkbox; this is my call, to keep the flow as it is.
- **Licences:**
  - `LICENSE` holds the canonical AGPL-3.0 text from gnu.org;
  - `LICENSE-DATA.md` names CC BY-SA 4.0 for community transcriptions and data under `data/` and `src/data/transcripciones/`, links the legal code, and excludes the programme images, which belong to each asociación;
  - `package.json` gets `"license": "AGPL-3.0-only"`.
- `sitemap.xml` includes the four pages.

### Tests

- `tests-js/consent.test.ts`: the `shouldCount` truth table, and `readSignals` with a throwing localStorage.
- Unit tests for the stats bucketing in a fixed timezone, including a day where the date changes across UTC.
- `supabase/tests/db.test.ts`:
  - a sign-in update bumps the hour, and an unchanged or null `last_sign_in_at` does not;
  - two users in the same hour give n = 2;
  - no user id is stored;
  - anon and non-admin users can't read the table or call the RPC, and an admin can.
- `tests-js/build.test.ts`:
  - the four pages exist and the footer links them;
  - with no token, no `cloudflareinsights` appears in any built page;
  - **every localStorage key literal in `src/` appears on the built `/cookies` page**. This keeps the page true to the code, as the issue asks.
  - the contact address is still not in the HTML.
- In the browser: the beacon request appears with no opt-out, and is absent with the switch on or GPC set. The Estadísticas tab renders.

## Left to the builder

- The exact wording of the legal copy, staying within the facts above.
- The visual form of the stats charts (plain CSS bars or grid, no chart library).
- Whether the beacon is skipped on `/admin`.
- The file split for the admin stats code.

## Owner steps (outside the code)

- Create the Web Analytics site for `amgueddfa.kevinroberts.ar` in Cloudflare, then set the repo variable `PUBLIC_CF_ANALYTICS_TOKEN`.
- Approve applying the migration to production.
- Close issue #1 after the deploy.
