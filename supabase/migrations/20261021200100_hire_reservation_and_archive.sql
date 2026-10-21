-- ============================================================================
-- Migration: reserve a plantilla before hiring; filling it archives the rest
-- Date: 2026-10-21
-- Plan: docs/plans/2026-10-21-hire-reservation-and-credentials.md
--
-- Any number of people may apply to a plantilla; exactly one is hired. Hiring
-- is now two steps:
--
--   1. RSP selects one applicant. The plantilla is RESERVED for them and the
--      application moves to 'For Contract Signing' with a deadline and
--      instructions the tracker shows. Only one reservation per plantilla.
--      RSP can revoke it ("did not report"), which reopens the plantilla and
--      puts the application back where it was.
--   2. RSP generates credentials. The client writes the hire and marks the
--      slot filled (existing path). Filling now also archives everyone else
--      who applied to that plantilla as 'Not Selected', and the tracker shows
--      them a regret letter.
--
-- 'For Contract Signing' is deliberately NOT a hired status, so reserving does
-- not fire trg_withdraw_on_hire_elsewhere; the person's other applications are
-- withdrawn only at the actual hire.
--
-- Additive and idempotent. Rollback:
-- supabase/rollbacks/20261021200100_hire_reservation_and_archive_rollback.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- ── 1. Reservation on the plantilla ─────────────────────────────────────────
ALTER TABLE public.plantilla_slots ADD COLUMN IF NOT EXISTS reserved_by_applicant_id uuid;
ALTER TABLE public.plantilla_slots ADD COLUMN IF NOT EXISTS reserved_at timestamptz;
ALTER TABLE public.plantilla_slots ADD COLUMN IF NOT EXISTS signing_deadline date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plantilla_slots_reserved_by') THEN
    ALTER TABLE public.plantilla_slots
      ADD CONSTRAINT fk_plantilla_slots_reserved_by
      FOREIGN KEY (reserved_by_applicant_id) REFERENCES public.applicants (id) ON DELETE SET NULL;
  END IF;
END $$;

-- One plantilla per reserved applicant (one applicant per plantilla is the
-- column itself).
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_reserved_by
  ON public.plantilla_slots (reserved_by_applicant_id)
  WHERE reserved_by_applicant_id IS NOT NULL;

-- ── 2. What the applicant sees, and where the application goes back to ──────
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS signing_deadline date;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS signing_instructions text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS status_before_selection text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS selection_revoked_at timestamptz;
-- Set when the plantilla this application was for is filled by someone else.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_applicants_archived_at
  ON public.applicants (archived_at)
  WHERE archived_at IS NOT NULL;

-- ── 3. Reserve ───────────────────────────────────────────────────────────────
-- Returns NULL on success, otherwise a message for the admin. SECURITY INVOKER:
-- the caller's own policies decide whether they may touch these rows. The row
-- lock makes two admins selecting at once safe: the second one sees the first
-- reservation.
CREATE OR REPLACE FUNCTION public.reserve_plantilla_slot(
  p_slot_id uuid,
  p_applicant_id uuid,
  p_deadline date,
  p_instructions text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  slot   record;
  holder text;
  app    record;
BEGIN
  IF p_deadline IS NULL THEN
    RETURN 'Set the date the applicant must report by.';
  END IF;

  SELECT id, status, reserved_by_applicant_id, label, slot_number
    INTO slot
    FROM plantilla_slots
   WHERE id = p_slot_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'This plantilla no longer exists.';
  END IF;
  IF slot.status <> 'open' THEN
    RETURN 'This plantilla is already ' || slot.status || '.';
  END IF;
  IF slot.reserved_by_applicant_id IS NOT NULL AND slot.reserved_by_applicant_id <> p_applicant_id THEN
    SELECT btrim(concat_ws(' ', first_name, last_name)) INTO holder
      FROM applicants WHERE id = slot.reserved_by_applicant_id;
    RETURN 'This plantilla is already reserved for ' || COALESCE(NULLIF(holder, ''), 'another applicant')
        || '. Revoke that selection first.';
  END IF;

  SELECT id, status INTO app FROM applicants WHERE id = p_applicant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'Applicant not found.';
  END IF;
  IF is_final_application_status(app.status) THEN
    RETURN 'This application is already closed (' || app.status || ').';
  END IF;

  UPDATE plantilla_slots
     SET reserved_by_applicant_id = p_applicant_id,
         reserved_at              = now(),
         signing_deadline         = p_deadline
   WHERE id = p_slot_id;

  UPDATE applicants
     SET status_before_selection = CASE WHEN status = 'For Contract Signing'
                                        THEN status_before_selection ELSE status END,
         status                  = 'For Contract Signing',
         signing_deadline        = p_deadline,
         signing_instructions    = NULLIF(btrim(COALESCE(p_instructions, '')), ''),
         selection_revoked_at    = NULL,
         updated_at              = now()
   WHERE id = p_applicant_id;

  RETURN NULL;
END $$;

-- ── 4. Revoke ("did not report") ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_plantilla_reservation(p_applicant_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE plantilla_slots
     SET reserved_by_applicant_id = NULL,
         reserved_at              = NULL,
         signing_deadline         = NULL
   WHERE reserved_by_applicant_id = p_applicant_id
     AND status = 'open';

  UPDATE applicants
     SET status                  = COALESCE(status_before_selection, 'Qualified'),
         status_before_selection = NULL,
         signing_deadline        = NULL,
         signing_instructions    = NULL,
         selection_revoked_at    = now(),
         updated_at              = now()
   WHERE id = p_applicant_id
     AND status = 'For Contract Signing';

  IF NOT FOUND THEN
    RETURN 'This applicant is not waiting for contract signing.';
  END IF;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_plantilla_slot(uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_plantilla_reservation(uuid) TO authenticated, service_role;

-- ── 5. Filling a plantilla clears its reservation and archives the rest ──────
CREATE OR REPLACE FUNCTION public.clear_reservation_on_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'open' THEN
    NEW.reserved_by_applicant_id := NULL;
    NEW.reserved_at              := NULL;
    NEW.signing_deadline         := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_reservation_on_fill ON public.plantilla_slots;
CREATE TRIGGER trg_clear_reservation_on_fill
  BEFORE UPDATE OF status ON public.plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION public.clear_reservation_on_fill();

-- SECURITY DEFINER: the other applicants may sit under offices the hiring
-- admin's own policies do not cover; the plantilla is filled either way.
CREATE OR REPLACE FUNCTION public.archive_others_on_slot_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'filled'
     AND NEW.filled_by_applicant_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM 'filled' THEN
    UPDATE applicants a
       SET status                  = 'Not Selected',
           archived_at             = now(),
           signing_deadline        = NULL,
           signing_instructions    = NULL,
           updated_at              = now()
     WHERE a.id <> NEW.filled_by_applicant_id
       AND a.deleted_at IS NULL
       AND NOT is_final_application_status(a.status)
       AND (
         a.plantilla_slot_id = NEW.id
         OR a.id IN (SELECT s.applicant_id FROM application_plantilla_slots s
                      WHERE s.plantilla_slot_id = NEW.id)
       );
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_archive_others_on_slot_fill ON public.plantilla_slots;
CREATE TRIGGER trg_archive_others_on_slot_fill
  AFTER UPDATE OF status, filled_by_applicant_id ON public.plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION public.archive_others_on_slot_fill();

-- A filled or closed plantilla takes no new applications. The portal already
-- disables Apply; this stops a stale page or a direct insert. A reserved
-- plantilla is still open and keeps taking applications.
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

DROP TRIGGER IF EXISTS trg_reject_application_to_closed_slot ON public.applicants;
CREATE TRIGGER trg_reject_application_to_closed_slot
  BEFORE INSERT ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.reject_application_to_closed_slot();

-- ── 6. Tracker view: the signing notice and the archive flag ─────────────────
-- Same definition as 20261021200000 with four columns appended (CREATE OR
-- REPLACE only allows appending).
CREATE OR REPLACE VIEW public.applicant_tracker_view WITH (security_invoker = true) AS
SELECT
  a.id,
  a.item_number,
  a.reference_no,
  a.reference_no_normalized,
  a.first_name,
  a.last_name,
  a.email,
  a.contact_number,
  a.position,
  a.office,
  a.status,
  a.created_at,
  a.updated_at,
  a.application_type,
  a.disqualification_reason,
  a.exam_date,
  a.exam_time,
  a.oral_exam_date,
  a.oral_exam_time,
  a.interview_date,
  a.interview_time,
  a.venue,
  a.schedule_instructions,
  a.disqualified_at,
  a.disqualification_reason_category,
  a.is_final,
  CASE
    WHEN a.disqualification_message_visible THEN a.disqualification_message
    ELSE NULL
  END AS disqualification_message,
  a.disqualification_message_visible,
  -- disqualified_by is intentionally omitted — never exposed to the public tracker.
  a.plantilla_slot_id,
  ps.label  AS plantilla_label,
  a.hired_elsewhere_application_id,
  h.position AS hired_elsewhere_position,
  hps.label AS hired_elsewhere_plantilla_label,
  a.signing_deadline,
  a.signing_instructions,
  a.archived_at,
  a.selection_revoked_at
FROM public.applicants a
LEFT JOIN public.plantilla_slots ps  ON ps.id  = a.plantilla_slot_id
LEFT JOIN public.applicants      h   ON h.id   = a.hired_elsewhere_application_id
LEFT JOIN public.plantilla_slots hps ON hps.id = h.plantilla_slot_id;

GRANT SELECT ON public.applicant_tracker_view TO anon, authenticated, service_role;

-- ── 7. Report ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  unlinked integer;
BEGIN
  SELECT count(*) INTO unlinked
    FROM public.applicants a
   WHERE a.deleted_at IS NULL
     AND a.plantilla_slot_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.application_plantilla_slots s WHERE s.applicant_id = a.id)
     AND NOT public.is_final_application_status(a.status);
  RAISE NOTICE '% open application(s) are not linked to a plantilla; they cannot be reserved or archived by a fill until linked.', unlinked;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
