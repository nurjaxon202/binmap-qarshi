-- BinMap Qarshi — where a location came from, and how far the map may roam.
--
-- Two additions:
--
-- 1. bins.source — who put the record there. This is separate from
--    verification_status, which says how confident we are. A location entered
--    by an administrator after a field survey and one sent in by a resident
--    are different facts about provenance, and the interface shows both.
--
-- 2. A map extent per city. The map is dedicated to one city: it opens there,
--    will not pan away, and cannot zoom out until the city is a dot in a
--    country. The extent below is an urban map extent chosen to cover the
--    built-up area — it is NOT an official municipal boundary and is not
--    presented as one.

/* ------------------------------ bins.source ------------------------------- */

alter table public.bins
  add column if not exists source text not null default 'community'
    check (source in ('admin', 'community'));

comment on column public.bins.source is
  'Who entered this location. admin = entered by a platform administrator; community = arrived through a resident submission. Distinct from verification_status, which records confidence rather than provenance.';

create index if not exists bins_source_idx on public.bins (source);

-- Anything that already came through the approval path is, by definition, a
-- resident submission; anything else was entered by an administrator.
update public.bins b
   set source = case
                  when exists (
                    select 1 from public.bin_submissions s where s.resulting_bin_id = b.id
                  ) then 'community'
                  else 'admin'
                end
 where b.source is null or b.source = 'community';

/* ------------------------------- map extent ------------------------------- */

alter table public.cities
  add column if not exists min_latitude  double precision,
  add column if not exists max_latitude  double precision,
  add column if not exists min_longitude double precision,
  add column if not exists max_longitude double precision;

comment on column public.cities.min_latitude is
  'South edge of the map extent: an urban extent covering the built-up area, not an official municipal boundary.';

alter table public.cities
  drop constraint if exists cities_extent_ordered;
alter table public.cities
  add constraint cities_extent_ordered check (
    (min_latitude is null and max_latitude is null
      and min_longitude is null and max_longitude is null)
    or (min_latitude < max_latitude and min_longitude < max_longitude)
  );

update public.cities
   set min_latitude  = 38.828,
       max_latitude  = 38.900,
       min_longitude = 65.735,
       max_longitude = 65.845
 where slug = 'qarshi';

/* -------------------- provenance through the write paths ------------------ */

-- Direct administrative entry records itself as such.
create or replace function public.binmap_create_bin(
  p_city_id             uuid,
  p_admin_id            uuid,
  p_latitude            double precision,
  p_longitude           double precision,
  p_description         text default null,
  p_photo_path          text default null,
  p_verification_status text default 'community',
  p_is_demo             boolean default false,
  p_source              text default 'admin_manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bin_id uuid;
begin
  if p_verification_status not in ('verified', 'community', 'needs_recheck') then
    raise exception 'unknown verification status %', p_verification_status
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.bins (
    city_id, latitude, longitude, description, photo_path,
    status, verification_status, verified_by, verified_at,
    is_demo, created_by, source
  ) values (
    p_city_id, p_latitude, p_longitude, p_description, p_photo_path,
    'active', p_verification_status,
    case when p_verification_status = 'verified' then p_admin_id else null end,
    case when p_verification_status = 'verified' then now() else null end,
    p_is_demo, p_admin_id, 'admin'
  )
  returning id into v_bin_id;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (
    p_admin_id, 'bin.created', 'bin', v_bin_id,
    jsonb_build_object(
      'latitude', p_latitude,
      'longitude', p_longitude,
      'verification_status', p_verification_status,
      'source', p_source,
      'is_demo', p_is_demo
    )
  );

  return v_bin_id;
end;
$$;

-- An approved submission is a resident contribution, whoever approved it.
create or replace function public.binmap_approve_submission(
  p_submission_id uuid,
  p_admin_id      uuid,
  p_latitude      double precision default null,
  p_longitude     double precision default null,
  p_description   text default null,
  p_note          text default null,
  p_mark_verified boolean default false,
  p_photo_path    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub    public.bin_submissions;
  v_bin_id uuid;
  v_lat    double precision;
  v_lng    double precision;
  v_desc   text;
  v_verif  text;
begin
  select * into v_sub from public.bin_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission % not found', p_submission_id using errcode = 'no_data_found';
  end if;
  if v_sub.status = 'approved' then
    raise exception 'submission % is already approved', p_submission_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_lat   := coalesce(p_latitude, v_sub.latitude);
  v_lng   := coalesce(p_longitude, v_sub.longitude);
  v_desc  := coalesce(p_description, v_sub.description);
  v_verif := case when p_mark_verified then 'verified' else 'community' end;

  insert into public.bins (
    city_id, latitude, longitude, description, photo_path,
    status, verification_status, verified_by, verified_at,
    is_demo, created_by, source
  ) values (
    v_sub.city_id, v_lat, v_lng, v_desc, coalesce(p_photo_path, v_sub.photo_path),
    'active', v_verif,
    case when p_mark_verified then p_admin_id else null end,
    case when p_mark_verified then now() else null end,
    v_sub.is_demo, v_sub.submitted_by, 'community'
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

/* --------------------------- nearby search, with source ------------------- */

-- The result shape gains a `source` column, and CREATE OR REPLACE cannot
-- change a function's return type, so both are dropped first. nearest_bin
-- depends on nearby, so it goes first.
drop function if exists public.binmap_nearest_bin(
  double precision, double precision, double precision, uuid, uuid);
drop function if exists public.binmap_bins_nearby(
  double precision, double precision, double precision, uuid, integer);

create function public.binmap_bins_nearby(
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
  source              text,
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
    b.id, b.latitude, b.longitude, b.description, b.photo_path,
    b.verification_status, b.source, b.verified_at, b.is_demo, b.created_at,
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
  limit greatest(1, least(p_limit, 500));
$$;

create function public.binmap_nearest_bin(
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
  from public.binmap_bins_nearby(p_lat, p_lng, p_radius_m, p_city_id, 500) n
  where p_exclude is null or n.id <> p_exclude
  order by n.distance_m asc
  limit 1;
$$;
