-- BinMap Qarshi — credentials for the non-Supabase authentication path.
--
-- Supabase Auth is the production provider (see 0004_supabase_auth.sql). These
-- tables back the fallback provider used when the app runs against a plain
-- PostgreSQL instance — including the local PGlite database — so development
-- and self-hosted deployments have real sign-up, sign-in and password reset.
--
-- They are deliberately inert on a Supabase deployment: the Supabase provider
-- never reads or writes them, and RLS below denies every API role.
--
-- Passwords are stored only as scrypt hashes with a per-row salt, computed by
-- the application (node:crypto). Nothing here ever holds a plaintext password
-- or a usable token: reset tokens and session tokens are stored as SHA-256
-- digests, so a dump of this table cannot be replayed.

create table if not exists public.local_credentials (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  password_hash     text not null,
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);

create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_expiry_idx on public.sessions (expires_at);

create table if not exists public.password_reset_tokens (
  token_hash text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists password_reset_user_idx on public.password_reset_tokens (user_id);

drop trigger if exists local_credentials_touch_updated_at on public.local_credentials;
create trigger local_credentials_touch_updated_at
  before update on public.local_credentials
  for each row execute function public.binmap_touch_updated_at();

-- RLS on, no policies: unreachable through any API role. Only the server's
-- privileged connection touches these tables.
alter table public.local_credentials    enable row level security;
alter table public.sessions             enable row level security;
alter table public.password_reset_tokens enable row level security;
