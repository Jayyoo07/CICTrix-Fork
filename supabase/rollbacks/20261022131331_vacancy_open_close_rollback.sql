-- Rollback for 20261022131331_vacancy_open_close.sql
-- Postings keep the status they have now. The vacancy history is dropped.

SELECT cron.unschedule('close-expired-vacancies')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-expired-vacancies');

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- Restore the 20261021200100 definition (slot check only).
CREATE OR REPLACE FUNCTION public.reject_application_to_closed_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slot_status text;
BEGIN
  IF NEW.plantilla_slot_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status INTO slot_status FROM plantilla_slots WHERE id = NEW.plantilla_slot_id;
  IF slot_status IN ('filled', 'closed') THEN
    RAISE EXCEPTION 'This plantilla has been %; it is no longer accepting applications.', slot_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_posting_follows_vacancy ON public.job_postings;
DROP TRIGGER IF EXISTS trg_record_vacancy_for_new_open_posting ON public.job_postings;
DROP FUNCTION IF EXISTS public.job_posting_follows_vacancy();
DROP FUNCTION IF EXISTS public.record_vacancy_for_new_open_posting();
DROP FUNCTION IF EXISTS public.open_vacancy(uuid, date, date, text);
DROP FUNCTION IF EXISTS public.close_vacancy(uuid, text, text);
DROP FUNCTION IF EXISTS public.close_expired_vacancies();
DROP FUNCTION IF EXISTS public._close_vacancy_row(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.is_rsp_admin();
DROP FUNCTION IF EXISTS public.vacancy_is_open(text, date);
DROP FUNCTION IF EXISTS public.manila_today();
DROP TABLE IF EXISTS public.job_vacancies;

COMMIT;
