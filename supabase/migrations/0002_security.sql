-- BinMap Qarshi — Row Level Security.
--
-- These policies are the database's own answer to "who may see or change what".
-- The server layer in src/lib enforces the same rules independently; neither
-- relies on the other, and nothing relies on hiding buttons in the frontend.
--
-- Note on connections: the application server talks to PostgreSQL as a
-- privileged role (Supabase service_role, or the owner on a plain Postgres),
-- which bypasses RLS by design — that is why the server layer carries its own
-- checks. These policies protect every *other* path into the data: Supabase's
-- auto-generated REST and Realtime APIs, which clients reach with the anon or
-- authenticated key.

-- Supabase ships auth.uid() / auth.role(). On a plain PostgreSQL or PGlite
-- instance they do not exist, and the policies below would not compile without
-- them. Create equivalents only when they are genuinely absent, so Supabase's
-- own definitions are never overwritten.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'role'
  ) then
    execute $fn$
      create function auth.role() returns text
      language sql stable
      as $body$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
      $body$;
    $fn$;
  end if;
end
$$;

-- Is the caller an administrator? SECURITY DEFINER so the lookup itself is not
-- subject to the profiles policies (which would recurse).
create or replace function public.binmap_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- --------------------------------------------------------------- enable RLS --
alter table public.cities           enable row level security;
alter table public.profiles         enable row level security;
alter table public.bins             enable row level security;
alter table public.bin_submissions  enable row level security;
alter table public.bin_reports      enable row level security;
alter table public.admin_audit_log  enable row level security;
alter table public.rate_limit_events enable row level security;

-- ------------------------------------------------------------------ cities --
drop policy if exists cities_read_active on public.cities;
create policy cities_read_active on public.cities
  for select using (is_active or public.binmap_is_admin());

drop policy if exists cities_admin_write on public.cities;
create policy cities_admin_write on public.cities
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- ---------------------------------------------------------------- profiles --
-- An account may read and update only its own row. Changing `role` is blocked
-- by the binmap_guard_role_change trigger from 0001, which no policy can
-- bypass, so an UPDATE that touches role fails even here.
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select using (id = auth.uid() or public.binmap_is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- -------------------------------------------------------------------- bins --
-- Only active bins are public. Inactive and removed ones, and every unapproved
-- proposal, stay invisible outside the admin dashboard.
drop policy if exists bins_read_active on public.bins;
create policy bins_read_active on public.bins
  for select using (status = 'active' or public.binmap_is_admin());

drop policy if exists bins_admin_write on public.bins;
create policy bins_admin_write on public.bins
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- --------------------------------------------------------- bin_submissions --
-- Anyone signed in may propose a location, but only as themselves.
drop policy if exists submissions_insert_own on public.bin_submissions;
create policy submissions_insert_own on public.bin_submissions
  for insert with check (
    submitted_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and resulting_bin_id is null
  );

drop policy if exists submissions_read_own on public.bin_submissions;
create policy submissions_read_own on public.bin_submissions
  for select using (submitted_by = auth.uid() or public.binmap_is_admin());

-- Deliberately no UPDATE or DELETE policy for ordinary accounts: a submitter
-- cannot change the coordinates after the fact, cannot edit the status, and
-- cannot approve their own proposal.
drop policy if exists submissions_admin_write on public.bin_submissions;
create policy submissions_admin_write on public.bin_submissions
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- ------------------------------------------------------------- bin_reports --
drop policy if exists reports_insert_own on public.bin_reports;
create policy reports_insert_own on public.bin_reports
  for insert with check (
    submitted_by = auth.uid()
    and status = 'submitted'
    and reviewed_by is null
    and admin_note is null
  );

drop policy if exists reports_read_own on public.bin_reports;
create policy reports_read_own on public.bin_reports
  for select using (submitted_by = auth.uid() or public.binmap_is_admin());

drop policy if exists reports_admin_write on public.bin_reports;
create policy reports_admin_write on public.bin_reports
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- --------------------------------------------------------- admin_audit_log --
-- Readable by administrators only, and never writable through the API: the
-- server writes it, inside the same transaction as the action it records.
drop policy if exists audit_admin_read on public.admin_audit_log;
create policy audit_admin_read on public.admin_audit_log
  for select using (public.binmap_is_admin());

-- ------------------------------------------------------- rate_limit_events --
-- No policy at all: the table is server-side bookkeeping. RLS is enabled and
-- nothing is granted, so the API roles see an empty table.

-- ------------------------------------------------------- column privileges --
-- Internal notes are not merely filtered by the application — the API roles
-- have no SELECT privilege on those columns at all. Guarded because the
-- `anon` / `authenticated` roles only exist on Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke select (admin_note) on public.bin_reports from authenticated;
    revoke select (internal_note) on public.bin_submissions from authenticated;
    revoke update (role) on public.profiles from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select (admin_note) on public.bin_reports from anon;
    revoke select (internal_note) on public.bin_submissions from anon;
  end if;
end
$$;
