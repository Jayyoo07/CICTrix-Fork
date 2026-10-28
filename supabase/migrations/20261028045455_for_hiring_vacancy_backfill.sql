-- ============================================================================
-- Migration: backfill active vacancies for Open postings and reopen closed plantillas
-- Date: 2026-10-28
-- Plan: docs/plans/2026-10-28-for-hiring-selection-blocked.md
--
-- Postings marked 'Open' lacked active job_vacancies rows, breaking the invariant
-- "Open <=> active vacancy" and leaving applicants stuck on closed plantilla slots.
--
-- This migration idempotently:
-- 1. Inserts an active job_vacancies record for every Open job posting with
--    associated plantilla slots that lacks an active vacancy.
-- 2. Reopens closed plantilla slots for those Open postings (leaving filled or
--    reserved slots untouched).
--
-- Rollback: supabase/rollbacks/20261028045455_for_hiring_vacancy_backfill.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- 1. Backfill active vacancy record for Open postings that lack one
INSERT INTO public.job_vacancies (job_posting_id, opened_on, deadline, remarks)
SELECT jp.id,
       COALESCE((jp.created_at AT TIME ZONE 'Asia/Manila')::date, public.manila_today()),
       jp.application_deadline,
       'Backfilled when For Hiring found no active vacancy'
  FROM public.job_postings jp
 WHERE jp.status = 'Open'
   AND EXISTS (SELECT 1 FROM public.plantilla_slots ps WHERE ps.job_posting_id = jp.id)
   AND NOT EXISTS (
     SELECT 1 FROM public.job_vacancies v
      WHERE v.job_posting_id = jp.id AND v.closed_at IS NULL
   )
ON CONFLICT (job_posting_id) WHERE closed_at IS NULL DO NOTHING;

-- 2. Reopen closed plantilla slots for Open job postings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plantilla_slots' AND column_name = 'filled_by_employee_id'
  ) THEN
    EXECUTE '
      UPDATE public.plantilla_slots
         SET status = ''open''
       WHERE status = ''closed''
         AND filled_by_employee_id IS NULL
         AND reserved_by_applicant_id IS NULL
         AND job_posting_id IN (SELECT id FROM public.job_postings WHERE status = ''Open'')
    ';
  ELSE
    EXECUTE '
      UPDATE public.plantilla_slots
         SET status = ''open''
       WHERE status = ''closed''
         AND filled_by_applicant_id IS NULL
         AND reserved_by_applicant_id IS NULL
         AND job_posting_id IN (SELECT id FROM public.job_postings WHERE status = ''Open'')
    ';
  END IF;
END $$;

COMMIT;
