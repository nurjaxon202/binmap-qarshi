-- BinMap Qarshi — the remaining review transactions, as database functions.
--
-- Approval already lived in binmap_approve_submission (0001). Rejection and
-- report review join it here for the same reason: each one has to change a row
-- *and* write its audit entry *and*, for reports, maybe clear a bin's
-- re-check flag — all or nothing.
--
-- Having one implementation in the database also means the application and the
-- demonstration seeder exercise exactly the same code path, so what the seed
-- produces is what a real administrator's click produces.

create or replace function public.binmap_reject_submission(
  p_submission_id uuid,
  p_admin_id      uuid,
  p_note          text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.bin_submissions;
begin
  select * into v_sub from public.bin_submissions where id = p_submission_id for update;
  if not found then
    return false;
  end if;
  if v_sub.status = 'approved' then
    raise exception 'submission % is already approved and cannot be rejected', p_submission_id
      using errcode = 'invalid_parameter_value';
  end if;

  update public.bin_submissions
     set status = 'rejected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_note
   where id = p_submission_id;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (
    p_admin_id, 'submission.rejected', 'bin_submission', p_submission_id,
    jsonb_build_object('reason', p_note, 'is_demo', v_sub.is_demo)
  );

  return true;
end;
$$;

create or replace function public.binmap_start_submission_review(
  p_submission_id uuid,
  p_admin_id      uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.bin_submissions
     set status = 'under_review', reviewed_by = p_admin_id
   where id = p_submission_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
  values (p_admin_id, 'submission.review_started', 'bin_submission', p_submission_id, null);

  return true;
end;
$$;

-- Report review.
--
-- Note what this does NOT do: a confirmed "missing" report never deletes or
-- deactivates the bin. Marking a bin gone stays a separate, explicit
-- administrative act. What review does is move the report along and, once a
-- bin has no outstanding reports left, lift the needs_recheck flag that a
-- missing-report raised.
create or replace function public.binmap_review_report(
  p_report_id uuid,
  p_admin_id  uuid,
  p_status    text,
  p_note      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.bin_reports;
begin
  if p_status not in ('submitted', 'reviewing', 'confirmed', 'rejected', 'resolved') then
    raise exception 'unknown report status %', p_status using errcode = 'invalid_parameter_value';
  end if;

  select * into v_prev from public.bin_reports where id = p_report_id for update;
  if not found then
    return false;
  end if;

  update public.bin_reports
     set status = p_status,
         reviewed_by = p_admin_id,
         admin_note = coalesce(p_note, admin_note),
         resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end
   where id = p_report_id;

  if v_prev.status is distinct from p_status then
    insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
    values (
      p_admin_id,
      case when p_status = 'resolved' then 'report.resolved' else 'report.status_changed' end,
      'bin_report', p_report_id,
      jsonb_build_object(
        'from', v_prev.status,
        'to', p_status,
        'report_type', v_prev.report_type,
        'bin_id', v_prev.bin_id,
        'is_demo', v_prev.is_demo
      )
    );
  elsif p_note is not null then
    insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
    values (
      p_admin_id, 'report.note_added', 'bin_report', p_report_id,
      jsonb_build_object('bin_id', v_prev.bin_id)
    );
  end if;

  if p_status in ('resolved', 'rejected') then
    update public.bins
       set verification_status = 'community'
     where id = v_prev.bin_id
       and verification_status = 'needs_recheck'
       and not exists (
         select 1 from public.bin_reports
          where bin_id = v_prev.bin_id
            and status in ('submitted', 'reviewing', 'confirmed')
       );
  end if;

  return true;
end;
$$;

-- Filing a report. A "missing" report flags the bin for re-verification in the
-- same transaction, so the flag and the report can never disagree.
create or replace function public.binmap_create_report(
  p_bin_id       uuid,
  p_submitted_by uuid,
  p_report_type  text,
  p_description  text default null,
  p_photo_path   text default null,
  p_is_demo      boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
begin
  insert into public.bin_reports
    (bin_id, submitted_by, report_type, description, photo_path, status, is_demo)
  values
    (p_bin_id, p_submitted_by, p_report_type, p_description, p_photo_path, 'submitted', p_is_demo)
  returning id into v_report_id;

  if p_report_type = 'missing' then
    update public.bins
       set verification_status = 'needs_recheck'
     where id = p_bin_id and verification_status <> 'needs_recheck';
  end if;

  return v_report_id;
end;
$$;
