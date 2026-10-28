-- ============================================================================
-- Migration: applicant_category_scores
-- Timestamp: 20261028054229
-- Description:
--   Persists RSP category scores and written exam scores in Supabase so that
--   applicant evaluations and ranking are persistent across devices and sessions.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- 1. Create table public.applicant_category_scores
CREATE TABLE IF NOT EXISTS public.applicant_category_scores (
  applicant_id uuid PRIMARY KEY REFERENCES public.applicants(id) ON DELETE CASCADE,
  appointment_type text NOT NULL DEFAULT 'original' CHECK (appointment_type IN ('original', 'promotional')),
  position_type text NOT NULL DEFAULT 'rank-and-file' CHECK (position_type IN ('rank-and-file', 'executive')),
  education jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  experience jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  performance jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  pcpt jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  potential jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  written_exam jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  oral_exam jsonb NOT NULL DEFAULT '{"initialScore": 0, "finalScore": null, "remarks": ""}'::jsonb,
  written_exam_raw_score numeric,
  total_score numeric,
  interview_score numeric,
  is_finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for queries ordered by updated_at
CREATE INDEX IF NOT EXISTS idx_applicant_category_scores_updated_at
  ON public.applicant_category_scores (updated_at DESC);

-- 3. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.applicant_category_scores_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applicant_category_scores_updated_at ON public.applicant_category_scores;
CREATE TRIGGER trg_applicant_category_scores_updated_at
  BEFORE UPDATE ON public.applicant_category_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.applicant_category_scores_set_updated_at();

-- 4. Row Level Security & Grants
ALTER TABLE public.applicant_category_scores ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_category_scores TO authenticated, anon;

DROP POLICY IF EXISTS applicant_category_scores_select_policy ON public.applicant_category_scores;
CREATE POLICY applicant_category_scores_select_policy
  ON public.applicant_category_scores
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS applicant_category_scores_modify_policy ON public.applicant_category_scores;
CREATE POLICY applicant_category_scores_modify_policy
  ON public.applicant_category_scores
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.applicant_category_scores IS
  'RSP applicant category scores, written exam scores, and evaluation rollups persisted remotely.';

NOTIFY pgrst, 'reload schema';

COMMIT;
