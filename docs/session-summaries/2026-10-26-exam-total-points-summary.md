---
title: Written exam total points summary
date: 2026-10-26
plan: docs/plans/2026-10-26-exam-total-points.md
---

## What shipped vs. planned

Everything in the plan, deployed to production in `f02dce0`; the migration was applied by the Supabase GitHub integration on merge to `main`.

- `job_postings.written_exam_total_points` (integer, default 100, CHECK > 0) and a rollback file.
- `src/lib/examTotalPoints.ts` (validation, capped conversion, blocked-lowering check, display helpers) and `src/lib/api/examTotalPoints.ts` (read and save by position title).
- Applicant Score: Total Points control in the Exam Score modal (RSP edits, others read-only), inline "Score cannot exceed the total points (X).", lowering blocked with the affected applicants named, Total Points column in the folder table, "Written /N" column with "score / total".
- Capped conversion with a "Score exceeds total" warning in the score table, scoring modal, For Hiring, ranking report (30-point share) and printed assessment form (20-point share).

## Deviations

- Totals are keyed by position title, because the Applicant Score screen groups applicants by title; saving updates every posting with that title.
- The printed assessment form used a fixed 30 (35 for executive) maximum and the ranking report treated raw scores of 30 or below as already converted. Both now use the configured total, so those printed values and some rankings change.
- The legacy scoring modal in `ApplicantDetailsPage` is switched off (`showViewScoresButton = false`) and was left alone.

## Checks run

- `npx tsc --noEmit`, `npm run lint`, `npm test` (573 passed), `npm run build`, migration guard: all passed.
- Production: Vercel and Supabase Preview checks passed; the live bundle contains the new code; a read-only query confirmed the column with value 100.
