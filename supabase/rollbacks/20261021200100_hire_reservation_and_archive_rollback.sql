-- Rollback for 20261021200100_hire_reservation_and_archive.sql
-- Applications left in 'For Contract Signing' go back to the status they had
-- before selection. Archived applications keep 'Not Selected'.

BEGIN;

SET LOCAL search_path = public, pg_temp;

UPDATE public.applicants
   SET status = COALESCE(status_before_selection, 'Qualified')
 WHERE status = 'For Contract Signing';

DROP TRIGGER IF EXISTS trg_reject_application_to_closed_slot ON public.applicants;
DROP FUNCTION IF EXISTS public.reject_application_to_closed_slot();
DROP TRIGGER IF EXISTS trg_archive_others_on_slot_fill ON public.plantilla_slots;
DROP TRIGGER IF EXISTS trg_clear_reservation_on_fill ON public.plantilla_slots;
DROP FUNCTION IF EXISTS public.archive_others_on_slot_fill();
DROP FUNCTION IF EXISTS public.clear_reservation_on_fill();
DROP FUNCTION IF EXISTS public.revoke_plantilla_reservation(uuid);
DROP FUNCTION IF EXISTS public.reserve_plantilla_slot(uuid, uuid, date, text);

-- The view depends on the applicant columns; restore the 20261021200000 shape.
DROP VIEW IF EXISTS public.applicant_tracker_view;
CREATE VIEW public.applicant_tracker_view WITH (security_invoker = true) AS
SELECT
  a.id, a.item_number, a.reference_no, a.reference_no_normalized, a.first_name, a.last_name,
  a.email, a.contact_number, a.position, a.office, a.status, a.created_at, a.updated_at,
  a.application_type, a.disqualification_reason, a.exam_date, a.exam_time, a.oral_exam_date,
  a.oral_exam_time, a.interview_date, a.interview_time, a.venue, a.schedule_instructions,
  a.disqualified_at, a.disqualification_reason_category, a.is_final,
  CASE WHEN a.disqualification_message_visible THEN a.disqualification_message ELSE NULL END
    AS disqualification_message,
  a.disqualification_message_visible,
  a.plantilla_slot_id,
  ps.label  AS plantilla_label,
  a.hired_elsewhere_application_id,
  h.position AS hired_elsewhere_position,
  hps.label AS hired_elsewhere_plantilla_label
FROM public.applicants a
LEFT JOIN public.plantilla_slots ps  ON ps.id  = a.plantilla_slot_id
LEFT JOIN public.applicants      h   ON h.id   = a.hired_elsewhere_application_id
LEFT JOIN public.plantilla_slots hps ON hps.id = h.plantilla_slot_id;
GRANT SELECT ON public.applicant_tracker_view TO anon, authenticated, service_role;

DROP INDEX IF EXISTS public.idx_applicants_archived_at;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS archived_at;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS selection_revoked_at;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS status_before_selection;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS signing_instructions;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS signing_deadline;

DROP INDEX IF EXISTS public.uq_plantilla_slots_reserved_by;
ALTER TABLE public.plantilla_slots DROP CONSTRAINT IF EXISTS fk_plantilla_slots_reserved_by;
ALTER TABLE public.plantilla_slots DROP COLUMN IF EXISTS signing_deadline;
ALTER TABLE public.plantilla_slots DROP COLUMN IF EXISTS reserved_at;
ALTER TABLE public.plantilla_slots DROP COLUMN IF EXISTS reserved_by_applicant_id;

NOTIFY pgrst, 'reload schema';

COMMIT;
