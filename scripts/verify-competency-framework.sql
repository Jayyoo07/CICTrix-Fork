-- ==============================================================================
-- SQL Verification Script: PM Competency Framework & Position Requirements
-- Run in Supabase SQL Editor to verify backfill results.
-- ==============================================================================

-- 1. Total row count and breakdown by source & proficiency level
SELECT 
  COUNT(*) AS total_requirements,
  COUNT(DISTINCT position_title) AS distinct_positions,
  COUNT(*) FILTER (WHERE source = 'manual' OR source IS NULL) AS manual_count,
  COUNT(*) FILTER (WHERE source = 'auto-synced') AS auto_synced_count,
  COUNT(*) FILTER (WHERE proficiency_level = 'Basic') AS basic_count,
  COUNT(*) FILTER (WHERE proficiency_level = 'Intermediate') AS intermediate_count,
  COUNT(*) FILTER (WHERE proficiency_level = 'Advanced') AS advanced_count
FROM position_competency_requirements;

-- 2. Check active employee positions coverage
-- Target: 0 rows returned (every active employee position has at least 1 requirement)
WITH active_positions AS (
  SELECT DISTINCT TRIM(current_position) AS position_title
  FROM employees_with_department
  WHERE LOWER(TRIM(status)) = 'active'
    AND current_position IS NOT NULL
    AND TRIM(current_position) <> ''
),
mapped_positions AS (
  SELECT DISTINCT LOWER(TRIM(position_title)) AS norm_title
  FROM position_competency_requirements
)
SELECT 
  ap.position_title AS unmapped_active_position,
  COUNT(e.id) AS active_employee_count
FROM active_positions ap
JOIN employees_with_department e 
  ON TRIM(e.current_position) = ap.position_title 
  AND LOWER(TRIM(e.status)) = 'active'
WHERE LOWER(ap.position_title) NOT IN (SELECT norm_title FROM mapped_positions)
GROUP BY ap.position_title
ORDER BY active_employee_count DESC, ap.position_title;

-- 3. Check job postings coverage
-- Target: 0 rows returned
WITH posting_titles AS (
  SELECT DISTINCT TRIM(title) AS title
  FROM job_postings
  WHERE title IS NOT NULL AND TRIM(title) <> ''
),
mapped_positions AS (
  SELECT DISTINCT LOWER(TRIM(position_title)) AS norm_title
  FROM position_competency_requirements
)
SELECT 
  pt.title AS unmapped_job_posting_title,
  COUNT(jp.id) AS posting_count
FROM posting_titles pt
JOIN job_postings jp ON TRIM(jp.title) = pt.title
WHERE LOWER(pt.title) NOT IN (SELECT norm_title FROM mapped_positions)
GROUP BY pt.title
ORDER BY posting_count DESC, pt.title;

-- 4. Competency standards usage count across positions
SELECT 
  cs.id,
  cs.competency_name,
  cs.training_stream,
  COUNT(pcr.id) AS position_requirement_count
FROM competency_standards cs
LEFT JOIN position_competency_requirements pcr ON cs.id = pcr.competency_id
GROUP BY cs.id, cs.competency_name, cs.training_stream
ORDER BY cs.id;

-- 5. Spot-check sample archetype positions
SELECT 
  position_title,
  cs.competency_name,
  cs.training_stream,
  pcr.proficiency_level,
  pcr.source,
  pcr.updated_at
FROM position_competency_requirements pcr
JOIN competency_standards cs ON pcr.competency_id = cs.id
WHERE position_title ILIKE ANY (ARRAY[
  '%City Government Department Head II%',
  '%Division Chief%',
  '%Medical Officer III%',
  '%Engineer II%',
  '%Administrative Officer IV%',
  '%Administrative Aide VI%',
  '%Heavy Equipment Operator%',
  '%Security Guard I%'
])
ORDER BY position_title, cs.id;
