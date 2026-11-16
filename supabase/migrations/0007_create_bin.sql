-- BinMap Qarshi — direct administrative bin creation.
--
-- The path used when building the initial Qarshi database from real field
-- verification, and by the demonstration seeder. Like the other review
-- functions, it writes the row and its audit entry in one transaction, so
-- there is exactly one implementation of "an administrator added a bin".

create or replace function public.binmap_create_bin(
  p_city_id             uuid,
  p_admin_id            uuid,
  p_latitude            double precision,
  p_longitude           double precision,
  p_description         text default null,
  p_photo_path          text default null,
  p_verification_status text default 'community',
  p_is_demo             boolean default false,
  -- Recorded in the audit entry so the log distinguishes a field survey from
  -- a CSV import from the demonstration seed.
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
    status, verification_status, verified_by, verified_at, is_demo, created_by
  ) values (
    p_city_id, p_latitude, p_longitude, p_description, p_photo_path,
    'active', p_verification_status,
    case when p_verification_status = 'verified' then p_admin_id else null end,
    case when p_verification_status = 'verified' then now() else null end,
    p_is_demo, p_admin_id
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
