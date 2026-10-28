-- ============================================================================
-- Rollback for 20261028045455_for_hiring_vacancy_backfill.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- 1. Return plantilla slots for backfilled vacancies back to 'closed'
-- (only if they are still open and not filled or reserved)
UPDATE public.plantilla_slots ps
   SET status = 'closed'
 WHERE ps.status = 'open'
   AND ps.reserved_by_applicant_id IS NULL
   AND ps.filled_by_applicant_id IS NULL
   AND ps.job_posting_id IN (
     SELECT jv.job_posting_id
       FROM public.job_vacancies jv
      WHERE jv.remarks = 'Backfilled when For Hiring found no active vacancy'
        AND jv.closed_at IS NULL
   );

-- 2. Remove the backfilled vacancy rows
DELETE FROM public.job_vacancies
 WHERE remarks = 'Backfilled when For Hiring found no active vacancy';

COMMIT;
