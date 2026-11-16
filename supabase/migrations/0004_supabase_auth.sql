-- BinMap Qarshi — wiring public.profiles to Supabase Auth.
--
-- Only runs where auth.users actually exists (i.e. a real Supabase project).
-- On a plain PostgreSQL or PGlite database the whole file is a no-op, so the
-- same migration set applies everywhere.
--
-- What it does:
--   1. profiles.id becomes a foreign key onto auth.users(id), so an account and
--      its profile cannot drift apart.
--   2. A trigger creates the profile row on sign-up, always with role 'user'.
--      This is the only automatic path into public.profiles, which is why an
--      account can never arrive pre-promoted: `role` is not read from the
--      sign-up payload at all.

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'auth' and tablename = 'users'
  ) then
    raise notice 'auth.users not present — skipping Supabase Auth wiring';
    return;
  end if;

  -- 1. Foreign key onto auth.users.
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_fkey'
  ) then
    execute $ddl$
      alter table public.profiles
        add constraint profiles_id_fkey
        foreign key (id) references auth.users (id) on delete cascade
    $ddl$;
  end if;

  -- 2. Profile creation on sign-up.
  execute $ddl$
    create or replace function public.binmap_handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      insert into public.profiles (id, email, full_name, role)
      values (
        new.id,
        new.email,
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
        'user'
      )
      on conflict (id) do update
        set email = excluded.email,
            full_name = coalesce(excluded.full_name, public.profiles.full_name);
      return new;
    end;
    $body$;
  $ddl$;

  execute 'drop trigger if exists binmap_on_auth_user_created on auth.users';
  execute $ddl$
    create trigger binmap_on_auth_user_created
      after insert on auth.users
      for each row execute function public.binmap_handle_new_user()
  $ddl$;

  -- Keep the e-mail in sync when it is changed through Supabase Auth.
  execute $ddl$
    create or replace function public.binmap_handle_user_email_change()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      if new.email is distinct from old.email then
        update public.profiles set email = new.email where id = new.id;
      end if;
      return new;
    end;
    $body$;
  $ddl$;

  execute 'drop trigger if exists binmap_on_auth_user_updated on auth.users';
  execute $ddl$
    create trigger binmap_on_auth_user_updated
      after update on auth.users
      for each row execute function public.binmap_handle_user_email_change()
  $ddl$;
end
$$;
