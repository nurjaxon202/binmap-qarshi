-- BinMap Qarshi — core schema.
--
-- PostgreSQL is the authoritative database. This file runs unchanged against a
-- Supabase project (`supabase db push`, or `npm run db:migrate` with
-- DATABASE_URL set) and against the local PGlite instance used for
-- development, so there is exactly one schema and one SQL dialect.

-- No extensions are required: gen_random_uuid() has been PostgreSQL core since
-- version 13, and all password/token hashing happens in the application with
-- node:crypto rather than in the database.

-- ------------------------------------------------------------------ cities --
-- Cities are configuration, not hard-coded. Qarshi is simply the first row.
create table if not exists public.cities (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  region           text not null,
  country          text not null default 'Uzbekistan',
  center_latitude  double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  default_zoom     smallint not null default 14 check (default_zoom between 1 and 20),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists cities_active_idx on public.cities (is_active) where is_active;

-- ---------------------------------------------------------------- profiles --
-- One row per account. With Supabase Auth, `id` is the auth.users id (see
-- 0002_supabase_auth.sql, which adds the FK and the signup trigger). With the
-- local auth provider the id is generated here and credentials live in
-- public.local_credentials (0003_local_auth.sql).
--
-- `role` is the single source of authority in the app. It is never writable by
-- the account itself: RLS forbids it and the server layer never passes it
-- through from a request body.
create table if not exists public.profiles (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  full_name         text,
  role              text not null default 'user' check (role in ('user', 'admin')),
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';

-- -------------------------------------------------------------------- bins --
-- Canonical, reviewed locations: the only table the public map reads.
-- Nothing arrives here without an administrator decision — either approval of
-- a submission (see binmap_approve_submission) or a direct admin entry.
create table if not exists public.bins (
  id                  uuid primary key default gen_random_uuid(),
  city_id             uuid not null references public.cities (id) on delete restrict,
  latitude            double precision not null check (latitude between -90 and 90),
  longitude           double precision not null check (longitude between -180 and 180),
  description         text check (description is null or char_length(description) <= 500),
  photo_path          text,
  status              text not null default 'active'
                        check (status in ('active', 'inactive', 'removed')),
  verification_status text not null default 'community'
                        check (verification_status in ('verified', 'community', 'needs_recheck')),
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  is_demo             boolean not null default false,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Exact-coordinate duplicate guard. Bins that are merely *close* stay legal —
-- two bins can face each other across a street — so the soft duplicate warning
-- at submission time does that job instead.
create unique index if not exists bins_coord_unique
  on public.bins (city_id, round(latitude::numeric, 6), round(longitude::numeric, 6))
  where status <> 'removed';

-- Bounding-box lookups are the hot path for the map viewport.
create index if not exists bins_bbox_idx on public.bins (latitude, longitude);
create index if not exists bins_city_status_idx on public.bins (city_id, status);
create index if not exists bins_public_idx on public.bins (city_id, latitude, longitude)
  where status = 'active';
create index if not exists bins_demo_idx on public.bins (is_demo) where is_demo;

-- --------------------------------------------------------- bin_submissions --
-- Unverified proposals from the public. Never read by the public map.
create table if not exists public.bin_submissions (
  id               uuid primary key default gen_random_uuid(),
  city_id          uuid not null references public.cities (id) on delete restrict,
  submitted_by     uuid references public.profiles (id) on delete set null,
  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  description      text check (description is null or char_length(description) <= 500),
  photo_path       text,
  status           text not null default 'pending'
                     check (status in ('pending', 'under_review', 'approved', 'rejected')),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  -- Shown to the submitter: the reason for the decision.
  review_note      text check (review_note is null or char_length(review_note) <= 500),
  -- Administrators only. Column privileges are revoked from the public API
  -- roles in 0002_security.sql, and the server layer never selects it for a
  -- non-admin reader.
  internal_note    text check (internal_note is null or char_length(internal_note) <= 1000),
  resulting_bin_id uuid references public.bins (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  -- An approved submission must point at the bin it produced, and any decided
  -- submission must carry its decision timestamp. Enforced by the database so
  -- a half-applied approval cannot exist.
  constraint submissions_approved_has_bin
    check (status <> 'approved' or resulting_bin_id is not null),
  constraint submissions_decided_has_timestamp
    check (status not in ('approved', 'rejected') or reviewed_at is not null)
);

create index if not exists submissions_status_idx on public.bin_submissions (status, created_at desc);
create index if not exists submissions_user_idx on public.bin_submissions (submitted_by, created_at desc);
create index if not exists submissions_city_idx on public.bin_submissions (city_id);
create index if not exists submissions_bbox_idx on public.bin_submissions (latitude, longitude);

-- ------------------------------------------------------------- bin_reports --
create table if not exists public.bin_reports (
  id           uuid primary key default gen_random_uuid(),
  bin_id       uuid not null references public.bins (id) on delete cascade,
  submitted_by uuid references public.profiles (id) on delete set null,
  report_type  text not null check (report_type in ('overflowing', 'damaged', 'missing', 'other')),
  description  text check (description is null or char_length(description) <= 500),
  photo_path   text,
  status       text not null default 'submitted'
                 check (status in ('submitted', 'reviewing', 'confirmed', 'rejected', 'resolved')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  -- Administrators only — never returned to the person who filed the report.
  admin_note   text check (admin_note is null or char_length(admin_note) <= 1000),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint reports_resolved_has_timestamp
    check (status <> 'resolved' or resolved_at is not null)
);

create index if not exists reports_bin_idx on public.bin_reports (bin_id, created_at desc);
create index if not exists reports_status_idx on public.bin_reports (status, created_at desc);
create index if not exists reports_type_idx on public.bin_reports (report_type);
create index if not exists reports_user_idx on public.bin_reports (submitted_by, created_at desc);
create index if not exists reports_open_idx on public.bin_reports (bin_id)
  where status in ('submitted', 'reviewing', 'confirmed');

-- --------------------------------------------------------- admin_audit_log --
create table if not exists public.admin_audit_log (
  id               uuid primary key default gen_random_uuid(),
  administrator_id uuid references public.profiles (id) on delete set null,
  action           text not null,
  entity_type      text not null check (entity_type in ('bin', 'bin_submission', 'bin_report', 'profile')),
  entity_id        uuid,
  details          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_created_idx on public.admin_audit_log (created_at desc);
create index if not exists audit_entity_idx on public.admin_audit_log (entity_type, entity_id);
create index if not exists audit_admin_idx on public.admin_audit_log (administrator_id, created_at desc);

-- ------------------------------------------------------- rate_limit_events --
-- Durable counter buckets, so limits survive serverless cold starts and apply
-- across instances rather than per-process.
create table if not exists public.rate_limit_events (
  id         bigserial primary key,
  bucket     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_bucket_idx on public.rate_limit_events (bucket, created_at desc);

-- ------------------------------------------------------------- updated_at --
create or replace function public.binmap_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bins_touch_updated_at on public.bins;
create trigger bins_touch_updated_at
  before update on public.bins
  for each row execute function public.binmap_touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.binmap_touch_updated_at();

-- ------------------------------------------------- role escalation guard --
-- Defence in depth: even if a bug let an UPDATE through with a changed role,
-- this trigger rejects it unless the session is a privileged database role.
-- Supabase's service_role (and a plain superuser connection) may still change
-- roles, which is how `npm run admin:create` works.
create or replace function public.binmap_guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if current_setting('request.jwt.claim.role', true) in ('authenticated', 'anon') then
      raise exception 'role changes are not permitted for this session';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.binmap_guard_role_change();

-- --------------------------------------------------- geographical queries --
-- Nearby search: the btree index on (latitude, longitude) narrows to a
-- bounding box, then exact great-circle distances are computed and ordered.
-- 0005_postgis_optional.sql upgrades this to ST_DWithin + a GIST index when
-- PostGIS is available.
create or replace function public.binmap_bins_nearby(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  double precision default 800,
  p_city_id   uuid default null,
  p_limit     integer default 50
)
returns table (
  id                  uuid,
  latitude            double precision,
  longitude           double precision,
  description         text,
  photo_path          text,
  verification_status text,
  verified_at         timestamptz,
  is_demo             boolean,
  created_at          timestamptz,
  distance_m          double precision
)
language sql
stable
as $$
  with box as (
    select
      p_lat - degrees(p_radius_m / 6371008.8) as min_lat,
      p_lat + degrees(p_radius_m / 6371008.8) as max_lat,
      p_lng - degrees(p_radius_m / (6371008.8 * greatest(cos(radians(p_lat)), 0.000001))) as min_lng,
      p_lng + degrees(p_radius_m / (6371008.8 * greatest(cos(radians(p_lat)), 0.000001))) as max_lng
  )
  select
    b.id,
    b.latitude,
    b.longitude,
    b.description,
    b.photo_path,
    b.verification_status,
    b.verified_at,
    b.is_demo,
    b.created_at,
    2 * 6371008.8 * asin(least(1, sqrt(
      power(sin(radians(b.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(b.latitude)) *
      power(sin(radians(b.longitude - p_lng) / 2), 2)
    ))) as distance_m
  from public.bins b, box
  where b.status = 'active'
    and (p_city_id is null or b.city_id = p_city_id)
    and b.latitude between box.min_lat and box.max_lat
    and b.longitude between box.min_lng and box.max_lng
    and 2 * 6371008.8 * asin(least(1, sqrt(
          power(sin(radians(b.latitude - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(b.latitude)) *
          power(sin(radians(b.longitude - p_lng) / 2), 2)
        ))) <= p_radius_m
  order by distance_m asc
  limit greatest(1, least(p_limit, 200));
$$;

-- Distance to the nearest existing bin — the duplicate check at submission
-- time and the context an administrator sees before approving.
create or replace function public.binmap_nearest_bin(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m double precision default 100,
  p_city_id  uuid default null,
  p_exclude  uuid default null
)
returns table (
  id          uuid,
  latitude    double precision,
  longitude   double precision,
  description text,
  is_demo     boolean,
  distance_m  double precision
)
language sql
stable
as $$
  select n.id, n.latitude, n.longitude, n.description, n.is_demo, n.distance_m
  from public.binmap_bins_nearby(p_lat, p_lng, p_radius_m, p_city_id, 200) n
  where p_exclude is null or n.id <> p_exclude
  order by n.distance_m asc
  limit 1;
$$;

-- --------------------------------------------- atomic submission approval --
-- Approving a submission must either create the canonical bin AND mark the
-- submission approved AND write the audit entry, or do none of it. Doing this
-- in one function keeps it a single statement from the application's side.
create or replace function public.binmap_approve_submission(
  p_submission_id uuid,
  p_admin_id      uuid,
  p_latitude      double precision default null,
  p_longitude     double precision default null,
  p_description   text default null,
  p_note          text default null,
  p_mark_verified boolean default false,
  -- The photo is copied from private evidence storage into the public bucket
  -- before this runs, so the canonical bin records the public path.
  p_photo_path    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub        public.bin_submissions;
  v_bin_id     uuid;
  v_lat        double precision;
  v_lng        double precision;
  v_desc       text;
  v_verif      text;
begin
  select * into v_sub from public.bin_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission % not found', p_submission_id using errcode = 'no_data_found';
  end if;
  if v_sub.status = 'approved' then
    raise exception 'submission % is already approved' , p_submission_id using errcode = 'invalid_parameter_value';
  end if;

  v_lat  := coalesce(p_latitude, v_sub.latitude);
  v_lng  := coalesce(p_longitude, v_sub.longitude);
  v_desc := coalesce(p_description, v_sub.description);
  v_verif := case when p_mark_verified then 'verified' else 'community' end;

  insert into public.bins (
    city_id, latitude, longitude, description, photo_path,
    status, verification_status, verified_by, verified_at,
    is_demo, created_by
  ) values (
    v_sub.city_id, v_lat, v_lng, v_desc, coalesce(p_photo_path, v_sub.photo_path),
    'active', v_verif,
    case when p_mark_verified then p_admin_id else null end,
    case when p_mark_verified then now() else null end,
    v_sub.is_demo, v_sub.submitted_by
  )
  returning id into v_bin_id;

  update public.bin_submissions
     set status = 'approved',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = coalesce(p_note, review_note),
         resulting_bin_id = v_bin_id
   where id = p_submission_id;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (
    p_admin_id, 'submission.approved', 'bin_submission', p_submission_id,
    jsonb_build_object(
      'bin_id', v_bin_id,
      'latitude', v_lat,
      'longitude', v_lng,
      'coordinates_corrected', (p_latitude is not null or p_longitude is not null),
      'marked_verified', p_mark_verified,
      'is_demo', v_sub.is_demo
    )
  );

  return v_bin_id;
end;
$$;

-- ----------------------------------------------------- seed the first city --
insert into public.cities (slug, name, region, country, center_latitude, center_longitude, default_zoom)
values ('qarshi', 'Qarshi', 'Qashqadaryo', 'Uzbekistan', 38.8606, 65.7891, 14)
on conflict (slug) do nothing;
