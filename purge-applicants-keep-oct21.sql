-- One-off data purge (not a migration). Run in the Supabase SQL Editor.
-- Deletes every applicant not created on 2026-10-21, plus the rows that block it.
-- Expected: 72 applicants deleted, 2 remain.

begin;

create temp table _purge on commit drop as
  select id from applicants where created_at::date <> date '2026-10-21';

delete from evaluations  where applicant_id in (select id from _purge);
delete from assignments  where applicant_id in (select id from _purge);
update plantilla_slots set filled_by_applicant_id = null
  where filled_by_applicant_id in (select id from _purge);
-- application_activity_log, applicant_attachments, application_plantilla_slots cascade.
delete from applicants   where id in (select id from _purge);

select (select count(*) from applicants)  as applicants_left,   -- expect 2
       (select count(*) from evaluations) as evaluations_left,
       (select count(*) from assignments) as assignments_left;

commit;
