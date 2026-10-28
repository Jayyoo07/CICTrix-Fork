-- ============================================================================
-- Rollback for 20261028054229_applicant_category_scores.sql
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

DROP TABLE IF EXISTS public.applicant_category_scores CASCADE;
DROP FUNCTION IF EXISTS public.applicant_category_scores_set_updated_at() CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
