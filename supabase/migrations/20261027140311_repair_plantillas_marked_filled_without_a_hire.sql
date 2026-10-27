-- ============================================================================
-- Migration: reopen plantillas marked filled that were never filled
-- Date: 2026-10-27
-- Plan: docs/plans/2026-10-27-open-vacancy-with-no-vacant-plantilla.md
--
-- Plantilla 22 of "Admin Aide VI (Clerk III)" was status 'filled' with no
-- filled_by_applicant_id and no filled_at. Nobody was hired into it: the two
-- fill triggers (20260922000002) both require filled_by_applicant_id before
-- they stamp the time or settle the per-application outcomes, so neither had
-- run. The row just said "taken" and hid the position from the public vacancy
-- table while RSP saw it as open.
--
-- filled_at IS NULL is what separates this from a real hire whose applicant
-- record was later deleted: filled_by_applicant_id is ON DELETE SET NULL, so
-- that case loses the applicant but keeps the timestamp. Those rows are left
-- alone — they record a hire whose paperwork is gone, not an empty plantilla.
--
-- The CHECK then stops the state coming back. It permits the purged-applicant
-- case (filled, no applicant, but a timestamp) and rejects only a 'filled'
-- row that claims neither a person nor a moment.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- Reopen rather than close: these plantillas were never taken, so they are
-- vacant. Whether each one is advertised still depends on its posting's
-- vacancy, which this does not touch.
UPDATE public.plantilla_slots
   SET status = 'open'
 WHERE status = 'filled'
   AND filled_by_applicant_id IS NULL
   AND filled_at IS NULL;

ALTER TABLE public.plantilla_slots
  DROP CONSTRAINT IF EXISTS plantilla_slots_filled_names_its_hire;

ALTER TABLE public.plantilla_slots
  ADD CONSTRAINT plantilla_slots_filled_names_its_hire
  CHECK (status <> 'filled' OR filled_by_applicant_id IS NOT NULL OR filled_at IS NOT NULL);

COMMIT;
