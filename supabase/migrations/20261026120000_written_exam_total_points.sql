-- ============================================================================
-- Migration: configurable Written Exam total points per vacancy
-- Date: 2026-10-26
-- Plan: docs/plans/2026-10-26-exam-total-points.md
--
-- RSP sets the maximum points of the Written Exam per position instead of the
-- hard-coded 100. Every existing posting gets 100, the value the Applicant
-- Score screen used until now, so no converted score changes.
--
-- Additive only: no score data lives in this table and none is touched.
-- Rollback: supabase/rollbacks/20261026120000_written_exam_total_points_rollback.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS written_exam_total_points integer NOT NULL DEFAULT 100;

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS job_postings_written_exam_total_points_positive;
ALTER TABLE public.job_postings
  ADD CONSTRAINT job_postings_written_exam_total_points_positive
  CHECK (written_exam_total_points > 0);

COMMENT ON COLUMN public.job_postings.written_exam_total_points IS
  'Maximum raw points of the Written Exam for this position. Raw scores convert to the 30-point share as min(raw / total, 1) x 30.';

COMMIT;
