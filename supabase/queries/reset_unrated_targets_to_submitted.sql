-- ============================================================================
-- Reset Unrated IPCR Target Settings to 'submitted_for_approval'
--
-- Purpose:
--   Populates the Department Head pending approval queue by resetting target
--   settings that were seeded as 'approved' but have not yet been evaluated/rated
--   in Phase 2 back to 'submitted_for_approval'.
--
-- Safe Execution Instructions:
--   1. Run Section 1 (SELECT) first in the Supabase SQL Editor to preview the
--      affected employees and target setting records.
--   2. Review the row count and records.
--   3. Run Section 2 (UPDATE) inside the transaction block to perform the reset.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PREVIEW AFFECTED TARGET SETTINGS
-- ----------------------------------------------------------------------------
-- Run this query to inspect which rows will be affected before updating.
SELECT
  ts.id AS target_setting_id,
  e.employee_id,
  e.first_name || ' ' || e.last_name AS employee_name,
  e.department,
  pc.id AS cycle_id,
  pc.title AS cycle_title,
  ts.status AS current_status,
  ts.phase2_status,
  ts.submitted_at,
  ts.approved_at
FROM target_settings ts
JOIN employees e ON e.id = ts.employee_id
JOIN performance_cycles pc ON pc.id = ts.cycle_id
WHERE (pc.status = 'Active' OR pc.title ILIKE '%2026%')
  AND ts.phase2_status <> 'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM mfos m
    JOIN success_indicators si ON si.mfo_id = m.id
    JOIN success_indicator_ratings sir ON sir.success_indicator_id = si.id
    WHERE m.target_setting_id = ts.id
  )
  -- Focus on targets that are currently approved or not yet in submitted_for_approval
  AND ts.status <> 'submitted_for_approval'
ORDER BY e.department, e.last_name, e.first_name;


-- ----------------------------------------------------------------------------
-- SECTION 2: RESET TARGET SETTINGS (EXECUTE IN SQL EDITOR)
-- ----------------------------------------------------------------------------
BEGIN;

UPDATE target_settings ts
SET
  status = 'submitted_for_approval',
  submitted_at = COALESCE(ts.submitted_at, now()),
  approved_by = NULL,
  approved_at = NULL,
  reviewed_by = NULL,
  reviewed_at = NULL,
  updated_at = now()
WHERE ts.cycle_id IN (
    SELECT id FROM performance_cycles
    WHERE status = 'Active' OR title ILIKE '%2026%'
  )
  AND ts.phase2_status <> 'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM mfos m
    JOIN success_indicators si ON si.mfo_id = m.id
    JOIN success_indicator_ratings sir ON sir.success_indicator_id = si.id
    WHERE m.target_setting_id = ts.id
  )
  AND ts.status <> 'submitted_for_approval';

-- Verify the update count and current status:
SELECT
  status,
  count(*) AS total_count
FROM target_settings
WHERE cycle_id IN (
  SELECT id FROM performance_cycles
  WHERE status = 'Active' OR title ILIKE '%2026%'
)
GROUP BY status;

COMMIT;
