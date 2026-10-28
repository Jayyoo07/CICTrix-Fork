-- For Hiring vacancy audit — 2026-10-28
-- Read-only. Run in the Supabase dashboard SQL editor before and after the
-- for_hiring_vacancy_backfill migration.
-- Plan: docs/plans/2026-10-28-for-hiring-selection-blocked.md

-- 1. Postings that read Open but have no active vacancy row.
--    Every row here is a state the app cannot represent correctly.
select
  jp.id,
  jp.title,
  jp.status,
  jp.application_deadline,
  count(v.id) filter (where v.closed_at is null) as active_vacancies
from public.job_postings jp
left join public.job_vacancies v on v.job_posting_id = jp.id
where jp.status = 'Open'
group by jp.id, jp.title, jp.status, jp.application_deadline
having count(v.id) filter (where v.closed_at is null) = 0
order by jp.title;

-- 2. Plantilla state per posting, with typed applicants.
select
  jp.title as position,
  ps.label as plantilla,
  ps.status as slot_status,
  count(a.id) as applicants
from public.job_postings jp
join public.plantilla_slots ps on ps.job_posting_id = jp.id
left join public.applicants a
  on a.plantilla_slot_id = ps.id
 and a.deleted_at is null
where jp.status in ('Open', 'Closed')
group by jp.title, ps.label, ps.status
having count(a.id) > 0
order by jp.title, ps.label;

-- 3. Applicants whose only plantilla is closed while the posting is Open.
select
  jp.title as position,
  ps.label as plantilla,
  ps.status as slot_status,
  a.id as applicant_id,
  btrim(concat_ws(' ', a.first_name, a.middle_name, a.last_name)) as applicant,
  a.status as application_status
from public.applicants a
join public.plantilla_slots ps on ps.id = a.plantilla_slot_id
join public.job_postings jp on jp.id = ps.job_posting_id
where jp.status = 'Open'
  and ps.status = 'closed'
  and a.deleted_at is null
order by jp.title, ps.label, applicant;
