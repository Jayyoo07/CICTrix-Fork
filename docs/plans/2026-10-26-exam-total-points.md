---
title: Configurable written exam total points
date: 2026-10-26
status: Done
summary: RSP sets the Written Exam total points per vacancy instead of the hard-coded 100; every conversion, display, ranking and export uses it, capped at the 30-point share.
---

## Goal

RSP admins set the maximum points of the Written Exam per vacancy. Scores are validated against it and every computed value uses it.

## Approach

| # | Decision |
|---|---|
| D1 | "Exam" is the Written Exam, the only raw-points exam (hard-coded 0–100, converted ×0.30 into a 30-point share). Oral exam and Potential are rating scales and stay unchanged. |
| D2 | New column `job_postings.written_exam_total_points integer NOT NULL DEFAULT 100 CHECK (> 0)`. Additive; existing vacancies keep 100; no score data changes. |
| D3 | Integer only, matching the current `step=1` inputs. |
| D4 | Lowering the total below an entered score is blocked, listing the affected applicants. |
| D5 | Editable in the RSP portal; super admin (read-only viewer) and other roles see it read-only. |
| D6 | Conversion is `min(raw / total, 1) × 30`. A saved score above the current total (e.g. entered in another browser) is capped at 30 and the row shows a visible "Score exceeds total" warning. |

RSP scores live in localStorage (`cictrix_exam_scores`, `cictrix_category_scores`) plus the `evaluations` table, so the D4 check only sees scores in this browser and in `evaluations`. Moving RSP scores to the DB is out of scope.

## Steps

1. Migration `supabase/migrations/20261026120000_written_exam_total_points.sql` (file only; not applied).
2. Pure helpers in `src/lib/examTotalPoints.ts`: validate total, validate score, convert with cap, find affected applicants. Service call to read/update the column in `src/lib/`.
3. Total Points control on the Applicant Score screen, per vacancy, with D4 block.
4. Replace hard-coded 100 / ×0.30 everywhere scores are displayed, ranked, computed or exported; show "score / total".
5. Tests for validation, permissions and the conversion.

## Risks

- Live DB lacks the column until the migration is applied; reads fall back to 100.
- The D4 check is limited to scores visible to this browser (see above).

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`.
