-- Rollback for 20261026120000_written_exam_total_points.sql.
-- Drops the column; the app falls back to 100 when it is missing.

BEGIN;

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS job_postings_written_exam_total_points_positive;
ALTER TABLE public.job_postings
  DROP COLUMN IF EXISTS written_exam_total_points;

COMMIT;
