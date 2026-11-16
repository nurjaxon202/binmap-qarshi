# BinMap Qarshi

**Quti qayerda?** — an open map of public waste bins, starting with Qarshi,
Qashqadaryo.

BinMap helps people find the nearest public bin, lets them add locations that
are missing from the map, and collects reports about bins that are full,
damaged or gone. It is not a waste-collection service and not a government
application: it is a survey of public infrastructure made by the people who
use it.

What makes it different from a list of pins is that it is **honest about how
much it knows**. Every location carries two separate facts, and the interface
never conflates them:

- **Where it came from** — entered by an administrator, or submitted by a
  resident and approved. Set by the database functions that create the row,
  never by the caller.
- **How much it has been checked** — verified on site, not yet verified, or
  disputed because of incoming reports. Shown as a texture as well as a
  colour, so the distinction survives greyscale, colour blindness and a phone
  screen in sunlight.

The design language is written down in [DESIGN.md](DESIGN.md), and
[docs/screenshots](docs/screenshots) holds current captures of every main
screen on desktop and phone.

---

## Running it

Requires **Node 22.5 or newer** (Node 24 recommended). Nothing else — no
Docker, no database to install, no accounts to create.

```bash
npm install
```

```bash
npm run demo:seed
```

```bash
npm run dev
```

Then open **http://localhost:3000**.

`npm run demo:seed` creates the demonstration environment: about 30 fictional
Qarshi locations, submissions in every state, reports of every type, an audit
trail, and five accounts. It prints the generated passwords once and writes
them to `.data/demo-credentials.txt` (gitignored). Nothing is hard-coded.

To explore without demonstration data, skip the seed step — the application is
built to be useful and honest while empty, which is what a real first day
looks like.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` |
| `npm run demo:seed` | Create the demonstration environment |
| `npm run demo:reset` | Delete it and build it again |
| `npm run demo:clean` | Delete it and stop |
| `npm run admin:create -- <email>` | Promote an account to moderator |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests (Playwright) |
| `node scripts/security-check.mjs` | Probe a running server's boundaries |

### The first moderator

```bash
npm run admin:create -- siz@example.uz
```

Add `--create` to make the account at the same time. This is the only
bootstrap path into the moderator role: it is never derived from a sign-up
payload, never writable by the account itself, and the database rejects a role
change that arrives from an API session.

---

## How it is built

**PostgreSQL is the authoritative database in every mode.** The schema,
migrations, constraints, row-level security policies and geographic functions
are plain PostgreSQL in `supabase/migrations/`, and they run unchanged against
a Supabase project or against the local instance.

- **Production** — Supabase. Set `DATABASE_URL` to the project's *pooler*
  connection string.
- **Development** — [PGlite](https://pglite.dev), the official PostgreSQL
  sources compiled to WebAssembly, running in-process against `.data/pgdata`.
  Same engine, same SQL, same migrations; it just needs no server. This is why
  the project runs with no setup.

Everything else follows from keeping one database and one dialect:

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, CSS-first tokens |
| Map | Leaflet + React Leaflet, clustering via Supercluster |
| Validation | Zod — every untrusted value crosses a schema |
| Auth | Supabase Auth when configured, otherwise scrypt + sessions in PostgreSQL |
| Storage | Supabase Storage when configured, otherwise the local filesystem |

The browser never talks to the database. Reads and writes go through server
components, server actions and route handlers, which is what lets the Supabase
and local providers swap without any feature code changing.

### Where things live

```
src/app/            routes; (footer) is the content group, /xarita is full-bleed
src/app/actions/    server actions — the only write path
src/lib/db/         PostgreSQL access, one module per table
src/lib/auth/       provider interface + Supabase and local implementations
src/lib/storage/    photo storage, and the EXIF stripper
src/lib/analysis.ts the coverage classification and its published limits
supabase/migrations the authoritative schema
scripts/            migrate, seed, admin bootstrap, security probe
```

---

## The map

The map is the product, so it behaves like a city map rather than a world map
that happens to be scrolled to Qarshi.

**It stays on Qarshi.** `public.cities` carries an explicit rectangle
(`min_latitude` / `max_latitude` / `min_longitude` / `max_longitude`), and the
map refuses to pan outside it or to zoom out past the point where it fills the
viewport. The minimum zoom is *computed* from the viewport rather than
hard-coded, because "far enough out to see the whole city" is a different
number on a phone and on a wide monitor; it is recomputed on resize, so
rotating a phone cannot escape it.

That rectangle is a **map extent, not a municipal boundary**. It is the area
the map shows, chosen to cover Qarshi's built-up area, and the schema comment
says so. BinMap does not publish an official administrative boundary for the
city and does not claim one.

**Zoom is gradual.** Leaflet's defaults move two whole zoom levels on a single
wheel notch, which on a trackpad crosses half the city in one flick. BinMap
uses quarter-level steps and four times the scroll distance per level
(`mapBehaviour` in `src/lib/config.ts`). Measured in a browser at 1440x900:

| Input | Zoom change |
| --- | --- |
| One wheel notch | 0.25 level |
| A three-notch flick | 0.5 level in total, not 1.5 |
| One zoom button press | 0.5 level |
| Pinch, fingers twice as far apart | 1.0 level |
| Pinch, a small 1.15x spread | 0.25 level |

At the floor the zoom-out button carries `aria-disabled="true"` and stops
responding, rather than bouncing. The widest view on that viewport is about
11.4 x 9.2 km; on a phone the city's full width still fits, and the extent is
held vertically centred.

---

## Security

Three independent layers, none relying on another:

1. **The server.** `requireUser()` / `requireAdmin()` read the role from
   `public.profiles` on every request — never from a cookie or a JWT claim.
   Every admin page and every admin action checks for itself.

   A layout check is *not* enough: the App Router renders a layout and its page
   in parallel, so a layout-only guard still lets the page query and stream its
   rows into the HTML of an unauthorised response. This project hit exactly
   that bug; `scripts/security-check.mjs` exists partly to catch it.

2. **Row-level security.** 14 policies in `0002_security.sql` protect every
   other route into the data — above all Supabase's auto-generated REST and
   Realtime APIs, which clients reach with the anon key.

3. **The database itself.** `SELECT` on `bin_reports.admin_note` and
   `bin_submissions.internal_note` is revoked from the API roles, `UPDATE` on
   `profiles.role` is revoked, and a trigger rejects a role change from an API
   session even if a bug let the statement through.

Other properties worth stating plainly:

- **Photographs are stripped of metadata before storage.** EXIF routinely
  carries the GPS coordinates of where a photo was taken and the device's
  serial number. `src/lib/storage/sanitize.ts` rewrites the container to remove
  it — JPEG APP1/APP2/APP13/APP14/COM, PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME`,
  WebP `EXIF`/`XMP` — without re-encoding the pixels. The file's type is
  decided from its magic bytes, never from what the browser claimed.
- **Unapproved photographs are private.** Submission and report evidence is
  reachable only through a short-lived signed URL minted after an ownership
  check. Approving a submission copies its photo into the public tier; nothing
  unapproved is ever publicly addressable.
- **Approving is atomic.** Creating the bin, marking the submission and writing
  the audit entry happen in one database transaction
  (`binmap_approve_submission`), with check constraints that make a
  half-applied approval impossible.
- **Rate limits live in PostgreSQL**, not in memory, because on a serverless
  platform an in-process counter is worth as many requests as there are cold
  starts.
- **Passwords** (local provider) are scrypt with a per-row salt; session and
  reset tokens are stored only as SHA-256 digests, so a database dump cannot be
  replayed.

---

## A bin's history

Each location on the map states four things, and the panel labels all four
rather than leaving any of them implied:

- **Xaritaga qo‘shilgan** — when the record arrived.
- **So‘nggi tekshiruv** — when somebody last stood in front of it, or
  *Hali tekshirilmagan* where nobody has.
- **Ma’lumot manbasi** — administrator or resident (see below).
- **Tekshiruv holati** — verified, not yet verified, or disputed.

`bins.verified_at` holds only the most recent check; `public.bin_verifications`
holds every visit, with who made it and what they found. A moderator records
one from the bin's administration page, and **the date is stamped by the
database, not typed in** — a typed date is a claim, not a record. An ordinary
account cannot reach it: the role is checked in the action, the RLS policy
refuses the write independently, and the function is the only writer of
`verified_at`.

---

## Where a location came from

Every bin carries `source`, which is either `admin` (an administrator entered
it) or `community` (a resident submitted it and a moderator approved it). It
is not a column the application writes directly: `binmap_create_bin` always
sets `admin` and `binmap_approve_submission` always sets `community`, so the
attribution follows the actual authenticated path the record took and no
caller can claim otherwise.

The interface shows it on the bin panel, as a column and filter in the
administration bin list, and as a proportion on the dashboard. **Every one of
those figures is counted from `public.bins` at request time.** None of them is
written into the markup.

`admin` means *a BinMap administrator entered this record*. It does not mean
the municipality, the hokimiyat or any government body supplied, endorsed or
verified it, and no screen says that it does.

---

## Demonstration data

The local database ships with a demonstration environment so the application
can be explored with something on the map. Every seeded row carries
`is_demo = true`.

The seeder works **through the same database functions the application calls**,
so its submissions were really approved, its reports really reviewed, and its
audit trail is the real one. It is demonstration content, not a fixture.

The seeded history runs between two fixed dates rather than backwards from
whenever the seeder happens to run, so re-seeding gives the same history and
the dates on screen stay consistent with each other. The window is set in
`scripts/seed-demo.mjs` (`TIMELINE`) and currently reads 24 October to
19 November 2026.

**It stops at today while the end date is still ahead of the clock.** Nothing
simulated may be dated in the future, because the live application keeps
stamping the real `now()`: a genuine verification would otherwise land before
the creation date of a bin dated next week, and a genuinely new comment would
sort underneath every seeded one in the review queue. Once the calendar
passes the end date the full window is used, unchanged.

The 420 seeded locations are generated by `scripts/generate-locations.mjs`
from a cached OpenStreetMap extract of Qarshi: positions are sampled along
real street centrelines, weighted towards pedestrian ways, footways and
places people gather, with a density falloff from the centre and a 55 m
minimum spacing. **The geography is real; the bins are not.** No claim is made
that a bin stands at any of these coordinates, and descriptions name a *kind*
of place ("next to a bus stop") rather than an address — naming an address
would amount to asserting a verified bin exists there.

Nothing in the interface labels these rows, because a product should not read
as a prototype. The separation is kept where it has to be:

- `is_demo` travels with every row — bins, submissions, reports, accounts —
  and is exposed on the public API, so the distinction is never lost.
- `npm run demo:seed` refuses to run when `NODE_ENV=production` unless
  `BINMAP_ALLOW_DEMO_SEED=true` is set deliberately.
- `npm run demo:clean` removes every demonstration trace, photographs
  included, and leaves real records untouched — which is why rows created by
  the browser tests survive it and have to be removed by hand.
- The placeholder images are obviously abstract graphics, not photographs.

**A production database must contain only real submitted or verified
records.** Do not seed one.

---

## Configuration

Copy `.env.example` to `.env.local`. With nothing set, the app runs entirely
locally. See that file for the full annotated list; the ones that matter most:

| Variable | Effect |
| --- | --- |
| `DATABASE_URL` | Use a real PostgreSQL server. Absent → local PGlite |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Switch auth and storage to Supabase |
| `BINMAP_TILE_URL` | Your own map tile provider |
| `BINMAP_GEOCODER` | `none` disables place search; the map still works |
| `BINMAP_DIRECTIONS_PROVIDER` | `google` \| `yandex` \| `2gis` \| `osm` |
| `BINMAP_ALLOW_DEMO_SEED` | Required to seed in production |

### External services

Every external service is optional and replaceable, and the map stays usable
when one is unavailable.

- **Map tiles** default to the OpenStreetMap Foundation servers, which are
  community-funded and *not* a production CDN. Point `BINMAP_TILE_URL` at your
  own provider before taking real traffic. Tiles are fetched on demand and
  never bulk-downloaded; attribution is rendered on every map.
- **Place search** is proxied through `/api/geocode` so the provider sees one
  identifying User-Agent, requests are rate limited and results are cached.
  Nominatim's policy forbids autocomplete, so search requires an explicit
  submit — there is no per-keystroke endpoint anywhere in this codebase.
- **Directions** link out to Google, Yandex, 2GIS or OpenStreetMap. BinMap does
  not compute walking routes and the interface says so.

---

## Testing

```bash
npm test
```

85 unit tests covering the geographic maths, the EXIF stripper (against real
JPEG/PNG/WebP container bytes), the coverage classification and its published
criteria, every validation schema, and password hashing.

```bash
node scripts/security-check.mjs
```

44 checks over real HTTP against a running server: that gated pages leak
nothing, that public payloads contain no submitter identity or internal note,
that private photographs are refused without a valid signature, that path
traversal is rejected, and that an ordinary signed-in account cannot reach the
administration area or read another account's data. The script signs in the
way a browser without JavaScript would, replaying the hidden fields React
renders into the form; if React changes that encoding the sign-in fails loudly
rather than skipping the privilege checks.

```bash
npx playwright install chromium
npm run test:e2e
```

Browser tests for the public map and the full contribution lifecycle —
propose, approve, verify it appears, report, resolve, confirm it persists —
plus a photograph travelling from the private tier to the public one on
approval, the city lock and zoom behaviour, and the permission boundaries, on
desktop and on a phone viewport.

**The suite lives inside the rate limits rather than asking for them to be
raised.** Sign-in is capped at fifteen attempts per fifteen minutes per
address and proposals at ten an hour per account, so:

- sessions are saved once and reused, and a still-valid session is not
  replaced — repeat runs cost no sign-ins at all;
- the two tests that propose a bin use a different contributor account each;
- a submission blocked by the limiter fails with that as the message, instead
  of a bare timeout.

If a run still reports the limiter, wait it out rather than loosening it:

waiting until moderator@namuna.binmap.uz can sign in...
  attempt 1: rate limited (56 soniya dan keyin qayta urinib ko‘ring)
  attempt 2: rate limited (26 soniya dan keyin qayta urinib ko‘ring)
signed in after 60s

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Supabase and Vercel setup, the storage
buckets, migrations and the production checklist.

## Screenshots

```bash
node scripts/screenshots.mjs
```

Writes `docs/screenshots/*.png` for the main screens at 1440x900 and on a
Pixel 7 viewport, against whatever server `BINMAP_SHOT_URL` points at
(default `http://localhost:3000`). It signs in with a demonstration moderator
account to reach the administration pages, so it only ever works against a
demonstration database.

## Language

The interface is Uzbek (Latin). Code, database columns and these documents are
English. The translations live in one file, `src/lib/i18n/uz.ts`, so adding
Russian or English later means adding a sibling with the same shape.
