-- BinMap Qarshi — remove community feedback.
--
-- The feedback feature introduced in 0009 has been withdrawn. 0009 is left as
-- it was, because migrations are checksummed and append-only once applied;
-- this one takes the feedback half back out and leaves the other half of 0009
-- — public.bin_verifications and binmap_record_verification — untouched.
--
-- Everything removed here was feedback-only. Nothing else referenced the
-- table, the function or the 'feedback' audit entity.

/* ------------------------------ audit entries ------------------------------ */
-- The audit log's entity check is about to stop allowing 'feedback', so the
-- rows that used it have to go first or the constraint cannot be added back.

delete from public.admin_audit_log where entity_type = 'feedback';

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in ('bin', 'bin_submission', 'bin_report', 'profile'));

/* ------------------------------ the function ------------------------------- */

drop function if exists public.binmap_moderate_feedback(uuid, uuid, text, text, text);

/* -------------------------------- the table -------------------------------- */
-- Dropping the table takes its indexes, policies and column grants with it.

drop table if exists public.feedback;
