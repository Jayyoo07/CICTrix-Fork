-- ============================================================================
-- Migration: open_vacancy refuses a position with no vacant plantilla
-- Date: 2026-10-27
-- Plan: docs/plans/2026-10-27-open-vacancy-with-no-vacant-plantilla.md
--
-- Opening a vacancy whose every plantilla is 'filled' succeeded and changed
-- nothing a candidate could see: the posting went 'Open', while the public
-- vacancy table — one row per plantilla still taking applications — stayed
-- empty. RSP saw "Closing soon" for a position nobody could apply to.
--
-- open_vacancy now refuses it, so the answer arrives on the button instead of
-- as an opening that appears to work. Filled plantillas are still never
-- reopened: one records a hire, and freeing it is a correction to that hire,
-- not part of advertising the position again.
--
-- Replaces open_vacancy from 20261022131331 and changes nothing else. The
-- body is unchanged but for the new check. Rollback: re-run that migration's
-- definition of this function.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.open_vacancy(
  p_posting_id uuid, p_deadline date, p_opened_on date DEFAULT NULL, p_remarks text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  posting job_postings%ROWTYPE;
  opened_on date := coalesce(p_opened_on, manila_today());
  slot_total integer;
  slot_openable integer;
BEGIN
  IF NOT is_rsp_admin() THEN
    RAISE EXCEPTION 'Only the RSP Admin can open vacancies.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_deadline IS NULL OR p_deadline < manila_today() THEN
    RAISE EXCEPTION 'The application deadline must be today or later.' USING ERRCODE = 'check_violation';
  END IF;
  IF opened_on > p_deadline THEN
    RAISE EXCEPTION 'The date opened must be on or before the deadline.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO posting FROM job_postings WHERE id = p_posting_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job position not found.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Nothing left to advertise. A posting with no slot rows at all predates the
  -- plantilla migration, so it is left alone rather than refused.
  SELECT count(*), count(*) FILTER (WHERE status IN ('open', 'closed'))
    INTO slot_total, slot_openable
    FROM plantilla_slots WHERE job_posting_id = p_posting_id;

  IF slot_total > 0 AND slot_openable = 0 THEN
    RAISE EXCEPTION 'Every plantilla for this position is filled. Add a plantilla before opening it as a vacancy.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Past its deadline but not yet swept by the cron run: close it first.
  IF posting.status = 'Open' AND NOT vacancy_is_open(posting.status, posting.application_deadline) THEN
    PERFORM _close_vacancy_row(p_posting_id, 'automatic', 'Deadline reached', NULL);
  ELSIF posting.status = 'Open' THEN
    RAISE EXCEPTION 'This position already has an open vacancy.' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO job_vacancies (job_posting_id, opened_on, deadline, remarks, opened_by, opened_by_email)
  VALUES (p_posting_id, opened_on, p_deadline, nullif(btrim(coalesce(p_remarks, '')), ''),
          auth.uid(), nullif(auth.jwt() ->> 'email', ''));

  -- Reopen the plantillas closed with the last vacancy. Filled stays filled.
  UPDATE plantilla_slots SET status = 'open'
   WHERE job_posting_id = p_posting_id AND status = 'closed';

  -- The trigger sets status 'Open' and the deadline from the new row.
  UPDATE job_postings SET status = 'Open', application_deadline = p_deadline WHERE id = p_posting_id;
END $$;

REVOKE ALL ON FUNCTION public.open_vacancy(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_vacancy(uuid, date, date, text) TO authenticated;

COMMIT;
