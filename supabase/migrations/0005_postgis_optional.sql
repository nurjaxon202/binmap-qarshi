-- BinMap Qarshi — optional PostGIS acceleration.
--
-- The portable nearby-search in 0001 narrows with a btree index on
-- (latitude, longitude) and then computes exact great-circle distances. That is
-- correct and fast at city scale.
--
-- Where PostGIS is available (it is, on Supabase), this migration adds a
-- generated `geog` column with a GIST index and swaps the function body for
-- ST_DWithin / ST_Distance, which keeps the same contract but scales to far
-- larger datasets. Where PostGIS is absent — a plain PostgreSQL instance, or
-- the local PGlite database — the file does nothing and 0001's implementation
-- stays in place.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'postgis') then
    raise notice 'PostGIS not available — keeping the portable nearby-search';
    return;
  end if;

  create extension if not exists postgis;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bins' and column_name = 'geog'
  ) then
    execute $ddl$
      alter table public.bins
        add column geog geography(Point, 4326)
        generated always as (
          st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
        ) stored
    $ddl$;
  end if;

  execute 'create index if not exists bins_geog_idx on public.bins using gist (geog)';

  execute $ddl$
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
    as $body$
      with origin as (
        select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
      )
      select
        b.id, b.latitude, b.longitude, b.description, b.photo_path,
        b.verification_status, b.verified_at, b.is_demo, b.created_at,
        st_distance(b.geog, o.g) as distance_m
      from public.bins b, origin o
      where b.status = 'active'
        and (p_city_id is null or b.city_id = p_city_id)
        and st_dwithin(b.geog, o.g, p_radius_m)
      order by b.geog <-> o.g
      limit greatest(1, least(p_limit, 200));
    $body$;
  $ddl$;
end
$$;
