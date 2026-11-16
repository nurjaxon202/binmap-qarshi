# Deploying BinMap Qarshi

The target architecture is **Supabase** for the database, authentication and
photo storage, and **Vercel** for the application. Nothing here is Vercel-
specific beyond the build command; any host that runs Next.js 16 works.

Both accounts have to be created by a person — these steps cannot be
automated, and no credentials exist in this repository.

---

## 1. Supabase

### Create the project

1. Create a project at <https://supabase.com/dashboard>.
2. Note the **project ref**, the **anon** key and the **service role** key
   (Project Settings → API).
3. Choose a region close to Uzbekistan — `eu-central-1` is the usual pick.

### Apply the schema

The migrations in `supabase/migrations/` are the authoritative schema. Apply
them with either tool:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

Or, without the Supabase CLI, run them directly:

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" npm run db:migrate
```

Seven migrations should apply. `0004_supabase_auth.sql` detects `auth.users`
and wires the profile trigger; `0005_postgis_optional.sql` detects PostGIS and
upgrades the nearby-search to a GIST index. Both are no-ops where the feature
is absent, which is why the same files also run against the local database.

### Create the storage buckets

In Storage, create exactly two:

| Bucket | Visibility | Holds |
| --- | --- | --- |
| `bin-photos` | **Public** | Photographs of approved, published bins |
| `bin-evidence` | **Private** | Submission photos and report evidence |

This split is load-bearing. Unapproved photographs live in the private bucket
and are reachable only through short-lived signed URLs that the server mints
after checking ownership; approving a submission copies its photo into the
public bucket. If `bin-evidence` is public, unreviewed photographs become
publicly addressable.

### Check authentication

Under Authentication → Providers, keep **Email** enabled. Under URL
Configuration set the Site URL to your domain and add `<domain>/kirish` as a
redirect URL, so confirmation and password-reset links return to the app.

---

## 2. Vercel

Import the repository and keep the defaults (Next.js is detected; build is
`next build`).

### Environment variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The **pooler** string, port **6543** |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key — server-side only |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` |
| `BINMAP_TILE_URL` | your tile provider (see below) |
| `BINMAP_GEOCODER_EMAIL` | a contact address, if you use Nominatim |

> **Use the pooler connection string, not the direct one.** On a serverless
> platform every invocation can open its own connection; a direct connection
> exhausts the database's limit under modest traffic. The pooler host contains
> `pooler.supabase.com` and uses port 6543.

Do **not** set `BINMAP_ALLOW_DEMO_SEED`. Without it the seeder refuses to run
against `NODE_ENV=production`, which is the guard that keeps fictional
locations out of a live map.

`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix and must never gain
one. The module that reads it imports `server-only`, so a client import fails
the build rather than shipping the key.

### Migrations on deploy

Migrations are not applied automatically in production (`BINMAP_AUTO_MIGRATE`
is ignored when `NODE_ENV=production`). Run them as a deploy step, or by hand
before promoting a release:

```bash
DATABASE_URL="<pooler-url>" npm run db:migrate
```

The runner records a checksum per file and refuses to continue if an applied
migration has changed — add a new file rather than editing one that has
shipped.

---

## 3. Map tiles

The default is the OpenStreetMap Foundation tile servers. They are
community-funded infrastructure and their usage policy does not cover a
production application, so **change this before launch**.

OpenStreetMap *data* and the OSMF *tile servers* are different things: the data
is open, the servers are a donated service. Options that respect that:

- A commercial provider (MapTiler, Stadia, Thunderforest, Mapbox raster).
- Your own `openstreetmap-tile-server`, rendering from OSM data you host.
- CARTO's basemaps, which now require an API key.

```
BINMAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
BINMAP_TILE_ATTRIBUTION=© OpenStreetMap hissadorlari, © Example
BINMAP_TILE_MAX_ZOOM=19
```

Attribution is rendered on every map and in the footer; keep it accurate for
whichever provider you use.

---

## 4. The first moderator

Sign up through the app, then promote the account from a machine that has the
database credentials:

```bash
DATABASE_URL="<pooler-url>" npm run admin:create -- siz@example.uz
```

```bash
DATABASE_URL="<pooler-url>" npm run admin:create -- --list
```

There is deliberately no way to do this from inside the application: the role
is not readable from a sign-up payload, the API roles have no `UPDATE`
privilege on `profiles.role`, and a trigger rejects a role change arriving from
an API session.

---

## 5. Before announcing it

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

```bash
node scripts/security-check.mjs https://your-domain
```

Then confirm by hand:

- [ ] The map opens on Qarshi and shows real streets.
- [ ] The map cannot be panned out of the city or zoomed out to the region,
      on a wide monitor and on a phone.
- [ ] `public.cities` holds the extent for your city. The defaults are
      Qarshi's; a second city needs its own rectangle, or its map will not be
      constrained.
- [ ] `/boshqaruv` sends a signed-out visitor to sign-in, and an ordinary
      account to `/ruxsat-yoq`.
- [ ] A submission's photograph is **not** reachable by URL while pending.
- [ ] `select count(*) from public.bins where is_demo` returns **0**. Nothing
      in the interface labels demonstration rows any more, so this query is
      how you check — not the screen.
- [ ] Every bin's `source` reflects how it really arrived. Nothing on any
      screen says the municipality supplied or endorsed the data, and nothing
      you add should.
- [ ] `/api/bins` contains no e-mail address and no internal note.
- [ ] The map works on a phone, one-handed.
- [ ] Attribution names the provider you are actually using.

### A note on the empty map

A fresh production database has no bins, and the map says so:

> Hozircha tasdiqlangan qutilar mavjud emas. Yangi joylashuv qo'shish orqali
> xaritani to'ldirishga yordam bering.

That is the correct state, not a problem to paper over. Fill it by verifying
locations in the field and entering them through **Boshqaruv → Qutilar → Qo'lda
quti qo'shish**, or by approving what people submit. Do not seed demonstration
data into production to make the map look busy — an honest empty map is worth
more than a full fictional one, and the whole trust model of the product rests
on that.

This matters more now that nothing in the interface is labelled as
demonstration content. The seeded rows exist so the application can be
explored locally; in production every row has to be something a person
actually submitted or an administrator actually verified. `npm run demo:seed`
refuses to run against `NODE_ENV=production` for that reason, and the refusal
is not a formality to work around.

---

## 6. Running without Supabase

The application also runs against a plain PostgreSQL server, using its own
authentication (scrypt + session rows) and the local filesystem for photos.
Set `DATABASE_URL` and leave the Supabase variables unset.

Two things to arrange yourself in that mode:

- **Persistent storage** for `BINMAP_UPLOAD_DIR`. A container filesystem is
  not persistent; mount a volume.
- **`BINMAP_MEDIA_SIGNING_SECRET`**, a 32-byte random value shared by every
  instance, so a signed photo URL minted by one is accepted by another:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Password-reset e-mails are not sent in this mode — there is no mail provider —
so the reset link is shown in the interface instead. Wire up a mail service, or
use Supabase Auth, before running this mode for real users.
