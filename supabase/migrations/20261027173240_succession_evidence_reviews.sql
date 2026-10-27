-- ============================================================================
-- Succession Planning: Evidence Relevance Reviews (V2 Scoring)
-- Created via: npx supabase migration new succession_evidence_reviews
--
-- Persists position-specific relevance and qualification review decisions for
-- candidate evidence records (work experience, training, education, eligibility).
--
-- Schema guarantees:
--   1. One review decision per (critical_position, employee, criterion, source_record).
--   2. Snapshots of evaluated evidence and position requirements are recorded
--      at review time for staleness/drift detection.
--   3. Access posture: matches succession_candidates and succession_candidate_remarks
--      (app-layer enforcement, anon-open for local dev / preview).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS succession_evidence_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_position_id  uuid NOT NULL REFERENCES critical_positions(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  criterion             text NOT NULL CHECK (criterion IN ('work', 'training', 'education', 'eligibility')),
  source_record_id      text NOT NULL,
  is_relevant           boolean,
  is_city_hall          boolean,
  matches_requirement   boolean,
  evidence_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by           text,
  reviewed_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_succession_evidence_reviews UNIQUE (critical_position_id, employee_id, criterion, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_ser_pos_emp ON succession_evidence_reviews (critical_position_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_ser_source  ON succession_evidence_reviews (source_record_id);

COMMENT ON TABLE succession_evidence_reviews IS
  'Per-candidate evidence relevance and qualification reviews for succession planning V2 scoring. Stores snapshots for staleness detection.';

ALTER TABLE succession_evidence_reviews DISABLE ROW LEVEL SECURITY;
GRANT ALL ON succession_evidence_reviews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
