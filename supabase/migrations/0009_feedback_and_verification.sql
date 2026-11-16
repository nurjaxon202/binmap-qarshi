-- BinMap Qarshi — community feedback, and a bin's verification history.
--
-- Two additions, unrelated to each other but landing together:
--
-- 1. public.feedback — what residents think of the platform itself. Written
--    by signed-in people, published only after a moderator says so, and read
--    by anyone. Deliberately prose: there is no score, no stars and no
--    satisfaction percentage, because a civic tool with twelve users does not
--    get to average them into a number and call it a rating.
--
-- 2. public.bin_verifications — the record of someone going and looking. The
--    bins table already carries verified_at and verified_by, but only ever
--    the latest; this keeps each visit, so "when was this last checked" has
--    an answer with a history behind it rather than a single mutable field.

/* ------------------------------ feedback ---------------------------------- */

create table if not exists public.feedback (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid references public.profiles (id) on delete set null,
  body              text not null check (char_length(body) between 10 and 2000),
  status            text not null default 'pending'
                      check (status in ('pending', 'published', 'rejected', 'hidden')),
  moderated_by      uuid references public.profiles (id) on delete set null,
  moderated_at      timestamptz,
  -- An official reply, shown publicly beneath the comment it answers.
  admin_response    text check (admin_response is null or char_length(admin_response) <= 1000),
  admin_response_by uuid references public.profiles (id) on delete set null,
  admin_response_at timestamptz,
  -- Moderators only. Never returned to the author, and not merely filtered in
  -- the application: the API roles lose SELECT on this column below.
  internal_note     text check (internal_note is null or char_length(internal_note) <= 1000),
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  published_at      timestamptz,
  constraint feedback_published_has_timestamp
    check (status <> 'published' or published_at is not null),
  constraint feedback_response_has_author
    check (admin_response is null or admin_response_by is not null)
);

comment on table public.feedback is
  'Community opinions about the platform. Published entries are public; everything else is visible only to its author and to moderators.';
comment on column public.feedback.is_demo is
  'Seeded demonstration content. Production must contain only real submissions.';
comment on column public.feedback.admin_response is
  'An official reply, shown publicly. Distinct from internal_note, which is never shown to anyone outside the administration.';

-- The public feed is "published, newest first"; everything else is a queue
-- ordered by arrival.
create index if not exists feedback_public_idx
  on public.feedback (published_at desc) where status = 'published';
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_author_idx on public.feedback (author_id, created_at desc);
create index if not exists feedback_demo_idx on public.feedback (is_demo) where is_demo;

/* -------------------------- verification history -------------------------- */

create table if not exists public.bin_verifications (
  id          uuid primary key default gen_random_uuid(),
  bin_id      uuid not null references public.bins (id) on delete cascade,
  verified_by uuid references public.profiles (id) on delete set null,
  outcome     text not null check (outcome in ('verified', 'needs_recheck')),
  note        text check (note is null or char_length(note) <= 500),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.bin_verifications is
  'One row per time somebody went and looked at a bin. bins.verified_at holds only the most recent; this holds the history.';

create index if not exists bin_verifications_bin_idx
  on public.bin_verifications (bin_id, created_at desc);
create index if not exists bin_verifications_admin_idx
  on public.bin_verifications (verified_by, created_at desc);

/* --------------------------- audit entity types --------------------------- */
-- The audit log now records feedback moderation and verification visits too.

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in ('bin', 'bin_submission', 'bin_report', 'profile', 'feedback'));

/* ------------------------------- functions -------------------------------- */

-- Recording a visit changes the bin and writes two records. One transaction,
-- so a bin can never claim a verification date with no visit behind it.
create or replace function public.binmap_record_verification(
  p_bin_id   uuid,
  p_admin_id uuid,
  p_outcome  text,
  p_note     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bin   public.bins;
  v_event uuid;
begin
  if p_outcome not in ('verified', 'needs_recheck') then
    raise exception 'unknown verification outcome %', p_outcome
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_bin from public.bins where id = p_bin_id for update;
  if not found then
    return null;
  end if;

  insert into public.bin_verifications (bin_id, verified_by, outcome, note, is_demo)
  values (p_bin_id, p_admin_id, p_outcome, p_note, v_bin.is_demo)
  returning id into v_event;

  -- A visit is what makes verified_at true, so it is set from the visit and
  -- nowhere else. A re-check visit clears the date: the bin is once again
  -- something nobody has confirmed.
  update public.bins
     set verification_status = p_outcome,
         verified_by = case when p_outcome = 'verified' then p_admin_id else null end,
         verified_at = case when p_outcome = 'verified' then now() else null end
   where id = p_bin_id;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (
    p_admin_id,
    case when p_outcome = 'verified' then 'bin.verified' else 'bin.flagged_for_recheck' end,
    'bin',
    p_bin_id,
    jsonb_build_object('outcome', p_outcome, 'note', p_note, 'is_demo', v_bin.is_demo)
  );

  return v_event;
end;
$$;

-- Moderating a comment. Publishing stamps published_at once and keeps it:
-- re-publishing something that was hidden should not pretend it is new.
create or replace function public.binmap_moderate_feedback(
  p_feedback_id   uuid,
  p_admin_id      uuid,
  p_status        text,
  p_response      text,
  p_internal_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.feedback;
begin
  if p_status not in ('pending', 'published', 'rejected', 'hidden') then
    raise exception 'unknown feedback status %', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_row from public.feedback where id = p_feedback_id for update;
  if not found then
    return false;
  end if;

  update public.feedback
     set status = p_status,
         moderated_by = p_admin_id,
         moderated_at = now(),
         published_at = case
                          when p_status = 'published' then coalesce(v_row.published_at, now())
                          else v_row.published_at
                        end,
         admin_response = coalesce(nullif(btrim(coalesce(p_response, '')), ''), v_row.admin_response),
         admin_response_by = case
                               when nullif(btrim(coalesce(p_response, '')), '') is not null
                                 then p_admin_id
                               else v_row.admin_response_by
                             end,
         admin_response_at = case
                               when nullif(btrim(coalesce(p_response, '')), '') is not null
                                 then now()
                               else v_row.admin_response_at
                             end,
         internal_note = coalesce(nullif(btrim(coalesce(p_internal_note, '')), ''), v_row.internal_note)
   where id = p_feedback_id;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (
    p_admin_id, 'feedback.' || p_status, 'feedback', p_feedback_id,
    jsonb_build_object('is_demo', v_row.is_demo, 'replied', p_response is not null)
  );

  return true;
end;
$$;

/* ---------------------------------- RLS ----------------------------------- */

alter table public.feedback          enable row level security;
alter table public.bin_verifications enable row level security;

-- Anyone may read what has been published. Nothing else.
drop policy if exists feedback_read_published on public.feedback;
create policy feedback_read_published on public.feedback
  for select using (
    status = 'published'
    or author_id = auth.uid()
    or public.binmap_is_admin()
  );

-- You may write your own, and only as a pending entry: a person cannot
-- publish themselves, answer themselves, or attach a moderator's note.
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert with check (
    author_id = auth.uid()
    and status = 'pending'
    and moderated_by is null
    and admin_response is null
    and internal_note is null
    and published_at is null
  );

-- No update policy for authors at all. An entry is a statement of what
-- somebody said at a moment; editing it after publication, or editing anyone
-- else's, is not something the table allows.
drop policy if exists feedback_admin_write on public.feedback;
create policy feedback_admin_write on public.feedback
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

-- Verification visits are an administrative record. The public panel shows
-- the date; who went is not published.
drop policy if exists bin_verifications_admin on public.bin_verifications;
create policy bin_verifications_admin on public.bin_verifications
  for all using (public.binmap_is_admin()) with check (public.binmap_is_admin());

/* -------------------------- column privileges ----------------------------- */
-- As elsewhere: the internal note is not filtered by the application, it is
-- unreadable to the API roles. Guarded because these roles only exist on
-- Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke select (internal_note) on public.feedback from authenticated;
    revoke update (status, moderated_by, moderated_at, admin_response,
                   admin_response_by, admin_response_at, internal_note, published_at)
      on public.feedback from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select (internal_note) on public.feedback from anon;
  end if;
end
$$;
