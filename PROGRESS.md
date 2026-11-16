# BinMap Qarshi — build status

Last updated 4 November 2026.

The MVP is **complete and verified**: every Level 1 feature works against a
real PostgreSQL database, the demonstration environment is populated, and the
full contribution lifecycle has been exercised end to end in a browser.

The final refinement pass is done too — the product is **BinMap Qarshi**
throughout, the map is locked to the city with gradual zoom, 420 demonstration
locations sit on real Qarshi streets, every bin states who recorded it, and no
screen carries a demonstration disclaimer while the underlying separation is
intact.

For how to run it see [README.md](README.md); for the design language see
[DESIGN.md](DESIGN.md); for going live see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **88 passing** |
| `npm run build` | clean, 28 routes |
| `node scripts/security-check.mjs` | **44 passing**, 0 skipped |
| `npm run test:e2e` | **53 passing**, 12 skipped by project guard |
| Clean install from an empty directory | verified |

Run against the production build (`npm run build && npm start`), not the dev
server.

The browser suite proves the lifecycle the brief asks for, against the
database rather than a mock: propose a bin with a photograph → it is **not**
on the public map → a moderator approves it → it **is** on the map, as
`community` rather than `verified`, and attributed to the resident who sent it
→ file an overflowing report → resolve it → the change survives a reload, and
the audit log records both decisions.

Two of those tests guard behaviour that would otherwise regress in silence,
and both were checked by deliberately breaking the feature and confirming the
test caught it:

| Test | With the feature removed |
| --- | --- |
| `cannot be zoomed out to the region` | fails on desktop and mobile; the screenshot shows all 224 bins collapsed to one bubble with Samarqand, Buxoro and Turkmenistan on screen |
| `one wheel notch is a fraction of a zoom level` | fails; Leaflet's defaults drop a whole tile level on a single notch |

The zoom numbers were also measured directly in a browser at 1440×900 — one
wheel notch moves 0.25 of a level, a three-notch flick 0.5 in total, a button
press 0.5, a pinch to twice the finger separation 1.0 — and the floor
(zoom 13.25 there, 12 on a phone) disables the zoom-out control rather than
bouncing.

---

## What is built

**Level 1 — all complete.** Homepage, interactive Qarshi map, confirmed-bin
display, current location, place search, nearby discovery, bin details,
submission with photo upload, problem reporting, registration/sign-in/recovery,
contributor dashboard, moderator authentication, submission review, report
management, PostgreSQL persistence, responsive mobile layout.

**Level 2 — mostly complete.** Map filters, Supercluster clustering,
administrative search and filtering on every list, the audit log, coverage
visualisation and classification, report trends, duplicate detection (a soft
warning that never blocks a legitimate nearby bin, plus an exact-coordinate
database constraint).

Not built: CSV import/export. The schema and the `source` field on
`binmap_create_bin` are ready for it, and imported rows must not become
confirmed without review — see "Remaining work".

**Level 3** is architectural only, as intended: cities are rows, not constants;
providers are swappable through configuration; the data layer is a module
boundary a public API could sit on.

**Bin history.** Every bin states when it was added, when it was last
checked (or that it has not been), where it came from and how far it is
verified, backed by `public.bin_verifications` — one row per visit, written
only by the database function that stamps the date.

A community feedback page (`/fikrlar`) was built and then withdrawn at the
owner's request. Migration `0009` created it alongside the verification
history; `0010` drops the feedback table and function again and leaves the
verification history in place.

**Final refinement pass.** The city lock and gradual zoom described above;
provenance (`source`) on every bin, shown on the bin panel, as a column and
filter in the administration list, and as a proportion on the dashboard, all
counted from `public.bins` at request time; 420 demonstration locations
generated along real Qarshi street centrelines; every demonstration
disclaimer removed from the interface with the underlying separation kept;
and `scripts/screenshots.mjs`, which writes `docs/screenshots`.

---

## Architecture decisions (settled)

### PostgreSQL is authoritative everywhere

One schema, one dialect, in `supabase/migrations/*.sql` — seven migrations
covering tables, constraints, indexes, RLS, geographic functions and the
atomic review transactions.

- **Production**: Supabase, via the pooler connection string.
- **Development**: PGlite — the official PostgreSQL sources compiled to
  WebAssembly (verified running **PostgreSQL 18.6**) against `.data/pgdata`.

This was chosen because the machine had no Docker and no local PostgreSQL, so
`supabase start` was unavailable. PGlite keeps the database genuinely
PostgreSQL rather than substituting SQLite, which an earlier draft did and
which was removed.

### Everything privileged happens on the server

The browser only ever calls this app's own endpoints; the app talks to the
database. That is what lets the Supabase and local auth/storage providers swap
without a line of feature code changing.

### Atomic state transitions live in the database

`binmap_approve_submission`, `binmap_reject_submission`,
`binmap_start_submission_review`, `binmap_create_report`,
`binmap_review_report` and `binmap_create_bin` each change their rows *and*
write the audit entry in one transaction, with check constraints making a
half-applied approval impossible. The demonstration seeder calls the same
functions, so seeded history is real history.

### Confidence is a texture, not a colour

The design's organising idea (see DESIGN.md): verified is solid, community is
hatched, doubtful is open-and-dotted, demonstration data is cross-hatched and
dashed. It survives greyscale and colour blindness, and it is why a
demonstration record cannot be mistaken for a real one at a glance.

---

## Bugs found and fixed during verification

Worth recording, because two were real and neither would have shown up in a
compile:

1. **Admin pages leaked data to unauthenticated callers.** `requireAdmin()`
   lived only in `boshqaruv/layout.tsx`. The App Router renders a layout and
   its page **in parallel**, so the page still queried and streamed its rows —
   an anonymous `curl` received 68 KB of HTML containing submitter e-mail
   addresses, even though a browser then followed the redirect. Fixed by
   calling `requireAdmin()` in every admin page; `scripts/security-check.mjs`
   now asserts the response body carries no account data, not merely that a
   redirect happened. **A layout is not a security boundary.**

2. **The approve button silently did nothing.** Two causes. React's
   `useActionState` builds the FormData itself and does not include the submit
   button's `name`/`value`, so the decision never arrived; and an unchecked
   checkbox is absent from FormData, so `formData.get()` returned `null`, which
   Zod's `.optional()` rejects (it accepts only `undefined`). Fixed with a
   hidden field each button sets on click, and null-tolerant schema helpers.
   A `RemainingErrors` component now surfaces any error without its own field,
   so no form can fail silently again.

3. CARTO basemaps now require an API key — unkeyed tiles rendered
   "API KEY REQUIRED" and the city vanished. Default switched to a keyless
   provider, with the production warning documented.

4. The map page had no `h1`; markers (divIcons) had no accessible name,
   because react-leaflet's `alt` only applies to image icons. Both fixed.

5. Literal `—` escapes leaked into JSX text from the generator script —
   harmless inside JS string literals, visible to users in JSX.

---

## Remaining work

Nothing blocks running or deploying the product. In rough priority order:

- **CSV import/export** for bins (Level 2). Must land as *submissions* or as
  rows requiring explicit approval — never as confirmed bins.
- **E-mail on the local auth path.** With no mail provider the password-reset
  link is shown in the interface instead of sent. Supabase Auth handles this
  properly; a self-hosted deployment needs a mail service wired in.
- **Rendering on an empty database** is handled by every page's empty state but
  is not covered by an automated test; the e2e suite assumes seeded data.
- **PostGIS** is wired up conditionally (`0005`) but has only run against the
  portable path locally, since PGlite has no PostGIS. It needs one check on a
  real Supabase project.
- **Supabase Auth and Supabase Storage have not been exercised against a live
  project** — no credentials were available. Both providers are implemented
  behind the same interfaces the local ones satisfy, and the Supabase-only
  migration is guarded, but the first deployment should verify sign-up,
  password reset, the two buckets and the private→public photo promotion.
- Russian and English locales: the dictionary is one file with one shape, so
  this is additive.

---

## Things worth knowing before changing anything

- **Migrations are checksummed.** The runner refuses if an applied file has
  changed. Locally, `rm -rf .data` and re-migrate; once deployed, migrations
  are append-only.
- **`pgcrypto` is not available in PGlite** and is not needed —
  `gen_random_uuid()` has been PostgreSQL core since 13.
- **A `'use server'` file may only export async functions.** Shared state
  shapes live in `src/app/actions/form-state.ts` for that reason.
- **React 19's lint rules are enforced**: no `setState` synchronously in an
  effect, no ref writes during render, no mutating a ref passed as a prop. The
  map fetches detail in the event handler and resolves deep links on the
  server because of this — both are better designs, so keep the pattern.
- **Config never reaches the browser via `process.env`.** Only `NEXT_PUBLIC_*`
  is inlined, so `publicMapConfig()` builds a serialisable object on the server
  and passes it as props. This is what keeps providers genuinely swappable.
- **Counts are cast to `::int` in SQL**, because `pg` returns bigint as a string.
- **Next 16 renamed `middleware` to `proxy`** — the file is `src/proxy.ts`.
- A **git repository was initialised** in this directory (no commits).
- **`source` is set by the database, not the caller.** `binmap_create_bin`
  always writes `admin`, `binmap_approve_submission` always writes
  `community`. Do not add a code path that sets it directly — the column is
  only trustworthy because nothing can.
- **Nothing in the interface labels demonstration rows**, by design. `is_demo`
  is still on every row and still exposed on the public API; `npm run
  demo:clean` keys on it, and deliberately leaves real rows alone — which is
  why bins created by the browser suite survive a `demo:reset` and have to be
  removed by hand.
- **Marker clustering starts at two, not three.** A pair of bins left
  unclustered draws two pins over each other whenever they are closer than
  about 60 m, and the one underneath cannot be clicked at all. It did not
  show at 225 locations and did at 420. `minPoints: 2` on the Supercluster
  index is what keeps every bin reachable, and
  `marker density > no bin marker is hidden underneath another` guards it.
- **The seeded report count is a proportion of the bin count**, not a fixed
  number, so changing how many locations are generated does not quietly leave
  the city under- or over-reported.
- **The demonstration timeline stops at today.** It is configured as
  24 October – 19 November 2026, but nothing simulated may be dated in the
  future: the live application keeps stamping the real `now()`, so a genuine
  verification would land before the creation date of a bin dated next week,
  and a new submission would sort below every seeded one in the review
  queue. The first was observed before the clamp went in. The seeder asserts the
  whole history for coherence at the end of its own run.
- **The rate limiters are real, and the test suite respects them.** Sign-in
  is limited per e-mail address, so it survives a `demo:reset` (which gives
  accounts new ids but the same addresses); proposals are limited per account,
  so a reseed does clear those. Sessions in `.auth/` are reused while valid,
  which is what keeps repeat runs from spending the sign-in allowance. If a
  run reports the limiter, `node scripts/wait-for-auth.mjs` waits it out.
- **A controlled input cannot be filled by assigning `.value`.** The bin
  picker feeds its coordinates from the map's own `moveend`, so the e2e
  helper moves the map instead; the earlier version wrote to the hidden
  inputs and silently sent every proposal to the city centre.
- **Do not force-kill the local server.** PGlite holds `.data/pgdata` open;
  killing the process mid-write corrupts it, and the only cure is
  `rm -rf .data && npm run db:migrate && npm run demo:seed`. Stop it with
  Ctrl-C, or from the editor's own run panel.
- **The city extent is a map extent, not a municipal boundary.** It lives in
  `public.cities` and the schema comment says so. A second city needs its own
  rectangle or its map will not be constrained.
- **Leaflet's own stylesheet is imported after `globals.css`**, so overriding
  a Leaflet rule at equal specificity silently loses. That is why the rules in
  the Leaflet section carry `!important`.
