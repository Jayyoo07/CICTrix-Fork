-- ============================================================================
-- Migration: vacancy history, manual and automatic closing
-- Date: 2026-10-22
-- Plan: docs/plans/2026-10-22-vacancy-open-close.md
--
-- A position (job_postings row) is OPEN while its status is 'Open' and the
-- Manila date is on or before its application_deadline (a DATE: applications
-- close at 11:59 PM Asia/Manila on that day). Everything else is CLOSED.
--
-- Each opening is one job_vacancies row: who opened it, the deadline, and how
-- it closed (manual with a reason, or automatic at the deadline). That table is
-- the vacancy history and the audit trail. At most one row per position is
-- active (closed_at is null), and a posting is 'Open' exactly when it has one.
--
--   open_vacancy / close_vacancy   RSP only; the only way to open or close.
--   close_expired_vacancies        pg_cron, every 5 minutes.
--   trg_job_posting_follows_vacancy  The admin page upserts every posting on
--                                  each save; a stale tab must not reopen a
--                                  closed vacancy or move its deadline.
--   reject_application_to_closed_slot  Also rejects new applications once the
--                                  vacancy is closed or past its deadline,
--                                  even if the cron run is late.
--
-- Applicants are never touched. Rollback:
-- supabase/rollbacks/20261022131331_vacancy_open_close_rollback.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- ── 1. Vacancy history ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_vacancies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id   uuid        NOT NULL REFERENCES public.job_postings (id) ON DELETE CASCADE,
  opened_on        date        NOT NULL,
  -- Null only on rows backfilled from postings that never had a deadline.
  deadline         date,
  remarks          text,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  opened_by        uuid,
  opened_by_email  text,
  closed_at        timestamptz,
  close_type       text        CHECK (close_type IN ('manual', 'automatic')),
  close_reason     text,
  close_remarks    text,
  closed_by        uuid,
  closed_by_email  text,
  CONSTRAINT job_vacancies_closed_consistently
    CHECK ((closed_at IS NULL) = (close_type IS NULL))
);

-- One active vacancy per position.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_vacancies_one_active
  ON public.job_vacancies (job_posting_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_vacancies_posting
  ON public.job_vacancies (job_posting_id, opened_at DESC);

ALTER TABLE public.job_vacancies ENABLE ROW LEVEL SECURITY;

-- Admin portals read the history. Writes go through the functions below only.
GRANT SELECT ON public.job_vacancies TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'job_vacancies' AND policyname = 'job_vacancies_admin_read'
  ) THEN
    CREATE POLICY job_vacancies_admin_read ON public.job_vacancies
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── 2. Shared definitions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manila_today()
RETURNS date
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;

CREATE OR REPLACE FUNCTION public.vacancy_is_open(p_status text, p_deadline date)
RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT p_status = 'Open' AND (p_deadline IS NULL OR p_deadline >= public.manila_today()) $$;

-- Only the RSP Admin opens and closes vacancies (the Super Admin is read-only).
CREATE OR REPLACE FUNCTION public.is_rsp_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.user_id = auth.uid() AND upper(btrim(ur.role)) = 'RSP'
  )
$$;

-- ── 3. A posting's status and deadline follow its active vacancy ────────────
CREATE OR REPLACE FUNCTION public.job_posting_follows_vacancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_deadline date;
BEGIN
  SELECT v.deadline INTO active_deadline
    FROM job_vacancies v
   WHERE v.job_posting_id = NEW.id AND v.closed_at IS NULL;

  IF FOUND THEN
    NEW.status := 'Open';
    NEW.application_deadline := active_deadline;
  ELSIF NEW.status = 'Open' THEN
    -- Opening happens only through open_vacancy().
    NEW.status := CASE WHEN OLD.status = 'Open' THEN 'Closed' ELSE OLD.status END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_posting_follows_vacancy ON public.job_postings;
CREATE TRIGGER trg_job_posting_follows_vacancy
  BEFORE UPDATE OF status, application_deadline ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.job_posting_follows_vacancy();

-- A posting inserted as 'Open' (sheet import, seed scripts) gets its vacancy row,
-- so "Open ⇔ active vacancy" holds from the start.
CREATE OR REPLACE FUNCTION public.record_vacancy_for_new_open_posting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'Open' THEN
    INSERT INTO job_vacancies (job_posting_id, opened_on, deadline, remarks)
    VALUES (NEW.id, manila_today(), NEW.application_deadline, 'Created open')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_record_vacancy_for_new_open_posting ON public.job_postings;
CREATE TRIGGER trg_record_vacancy_for_new_open_posting
  AFTER INSERT ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.record_vacancy_for_new_open_posting();

-- ── 4. Closing ──────────────────────────────────────────────────────────────
-- Closes the posting's active vacancy row (or records a closed one if the
-- posting has none), closes its open plantillas and the posting itself.
-- Filled plantillas are left alone: they record a hire.
CREATE OR REPLACE FUNCTION public._close_vacancy_row(
  p_posting_id uuid, p_type text, p_reason text, p_remarks text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  who_email text := nullif(auth.jwt() ->> 'email', '');
BEGIN
  UPDATE job_vacancies
     SET closed_at = now(), close_type = p_type, close_reason = p_reason,
         close_remarks = p_remarks, closed_by = auth.uid(), closed_by_email = who_email
   WHERE job_posting_id = p_posting_id AND closed_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO job_vacancies (job_posting_id, opened_on, deadline, closed_at, close_type,
                               close_reason, close_remarks, closed_by, closed_by_email)
    SELECT jp.id, (jp.created_at AT TIME ZONE 'Asia/Manila')::date, jp.application_deadline, now(),
           p_type, p_reason, p_remarks, auth.uid(), who_email
      FROM job_postings jp WHERE jp.id = p_posting_id;
  END IF;

  UPDATE plantilla_slots SET status = 'closed'
   WHERE job_posting_id = p_posting_id AND status = 'open';

  UPDATE job_postings SET status = 'Closed' WHERE id = p_posting_id;
END $$;

REVOKE ALL ON FUNCTION public._close_vacancy_row(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_expired_vacancies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired uuid;
  closed_count integer := 0;
BEGIN
  FOR expired IN
    SELECT jp.id FROM job_postings jp
     WHERE jp.status = 'Open'
       AND jp.application_deadline IS NOT NULL
       AND jp.application_deadline < manila_today()
     FOR UPDATE
  LOOP
    PERFORM _close_vacancy_row(expired, 'automatic', 'Deadline reached', NULL);
    closed_count := closed_count + 1;
  END LOOP;
  RETURN closed_count;
END $$;

REVOKE ALL ON FUNCTION public.close_expired_vacancies() FROM PUBLIC, anon, authenticated;

-- The reasons the Close Vacancy dialog offers (src/lib/vacancies.ts).
CREATE OR REPLACE FUNCTION public.close_vacancy(
  p_posting_id uuid, p_reason text, p_remarks text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  posting job_postings%ROWTYPE;
  remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
BEGIN
  IF NOT is_rsp_admin() THEN
    RAISE EXCEPTION 'Only the RSP Admin can close vacancies.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN (
    'Position no longer needed', 'Budget or plantilla change', 'Filled through other means',
    'Sufficient applicants', 'Other'
  ) THEN
    RAISE EXCEPTION 'Choose a reason for closing.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason = 'Other' AND remarks IS NULL THEN
    RAISE EXCEPTION 'Add remarks when the reason is Other.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO posting FROM job_postings WHERE id = p_posting_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job position not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF posting.status <> 'Open' THEN
    RAISE EXCEPTION 'This vacancy is already closed.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM _close_vacancy_row(p_posting_id, 'manual', p_reason, remarks);
END $$;

-- ── 5. Opening ──────────────────────────────────────────────────────────────
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
REVOKE ALL ON FUNCTION public.close_vacancy(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_vacancy(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vacancy(uuid, text, text) TO authenticated;

-- ── 6. No new applications to a closed vacancy ──────────────────────────────
-- Same as 20261021200100, plus the vacancy check. The admin page upserts every
-- applicant on save, and BEFORE INSERT fires for upserts too, so a row that
-- already exists is not a new submission and passes untouched.
CREATE OR REPLACE FUNCTION public.reject_application_to_closed_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slot_status text;
  posting_status text;
  posting_deadline date;
BEGIN
  IF NEW.plantilla_slot_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM applicants WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT ps.status, jp.status, jp.application_deadline
    INTO slot_status, posting_status, posting_deadline
    FROM plantilla_slots ps
    JOIN job_postings jp ON jp.id = ps.job_posting_id
   WHERE ps.id = NEW.plantilla_slot_id;

  IF slot_status IN ('filled', 'closed') THEN
    RAISE EXCEPTION 'This plantilla has been %; it is no longer accepting applications.', slot_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF posting_status IS NOT NULL AND NOT vacancy_is_open(posting_status, posting_deadline) THEN
    RAISE EXCEPTION 'This vacancy is closed; it is no longer accepting applications.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ── 7. Backfill: every open posting gets its active vacancy row ─────────────
INSERT INTO public.job_vacancies (job_posting_id, opened_on, deadline, remarks)
SELECT jp.id, (jp.created_at AT TIME ZONE 'Asia/Manila')::date, jp.application_deadline,
       'Recorded when vacancy history began'
  FROM public.job_postings jp
 WHERE jp.status = 'Open'
   AND NOT EXISTS (SELECT 1 FROM public.job_vacancies v
                    WHERE v.job_posting_id = jp.id AND v.closed_at IS NULL);

-- Close the ones already past their deadline now, instead of waiting for cron.
SELECT public.close_expired_vacancies();

COMMIT;

-- ── 8. Schedule (outside the transaction: pg_cron owns its own) ─────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'close-expired-vacancies',
  '*/5 * * * *',
  $$SELECT public.close_expired_vacancies()$$
);
