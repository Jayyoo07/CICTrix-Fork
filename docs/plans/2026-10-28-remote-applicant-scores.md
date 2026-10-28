---
title: Migrate applicant category and written exam scores from localStorage to remote Supabase tables
date: 2026-10-28
status: Done
summary: Transition applicant category scores and written exam scores from browser localStorage to a dedicated Supabase table (applicant_category_scores) with a centralized service layer, preserving scoring and ranking logic while retaining offline fallback.
---

## Goal

RSP category scores and written exam scores are stored and managed directly in Supabase (`applicant_category_scores`), making applicant evaluations persistent across devices, browsers, and users. The For Hiring page and Qualified Applicants section load score matrices and rank applicants from remote tables rather than relying on browser `localStorage`.

## Analysis of Existing Scoring Logic

1. **Applicant Category Scores (`cictrix_category_scores`)**:
   - Scores 7 categories:
     - `education` (max 20 pts original / promotional)
     - `experience` (max 20 pts original / promotional)
     - `performance` (max 0 original / 20 promotional)
     - `pcpt` (max 20 original / 10 promotional)
     - `potential` (max 0 original / 20 promotional)
     - `writtenExam` (max `written_exam_total_points`, contributes 30 pts)
     - `oralExam` (max 20 original / 0 promotional)
   - Each category contains: `{ initialScore: number, finalScore: number | null, remarks: string }`.
   - Appointment type (`original` | `promotional`) and position type (`rank-and-file` | `executive`).
   - Modal score formula:
     - Promotional: `eff(education) + eff(experience) + eff(performance) + eff(potential) + eff(pcpt)`
     - Original: `eff(education) + eff(experience) + eff(oralExam)`
2. **Written Exam Scores (`cictrix_exam_scores`)**:
   - Recorded per job posting / position folder in the "Input Written Exam" modal.
   - When saved, it sets `writtenExam.initialScore` for each applicant in that position and recalculates effective totals.
3. **For Hiring Page Dependency**:
   - `buildCompletedSet()` uses the presence of category scores or completed evaluations to identify qualified applicants.
   - `resolveApplicantScores()` computes `interviewScore` and `examScore` for table display and ranking.

## Approach

1. **Database Schema (`public.applicant_category_scores`)**:
   - Create table `public.applicant_category_scores` linked to `public.applicants(id)` with cascade delete.
   - Store category objects (`education`, `experience`, `performance`, `pcpt`, `potential`, `written_exam`, `oral_exam`) as JSONB with default templates matching `ScoringCat`.
   - Include numeric rollup columns: `written_exam_raw_score`, `total_score`, `interview_score`, and boolean `is_finalized`.
   - Add RLS policies granting read/write access to authenticated and anon roles (matching the recruitment portal access model).
2. **Centralized Service Layer (`src/lib/api/applicantScores.ts`)**:
   - Pure functions for score calculations (`calculateModalScore`, `calculateOverallScore`, `deriveDefaultCategoryScores`).
   - Data access functions:
     - `fetchApplicantScores(applicantIds?: string[])`: queries Supabase, falls back to `localStorage` cache if offline.
     - `saveApplicantScore(applicantId: string, scores: ApplicantCategoryScores)`: upserts to Supabase, updates local cache.
     - `savePositionExamScores(jobPostingId: string, scores: Record<string, number>)`: batch updates exam scores in Supabase.
3. **UI Integration**:
   - `src/components/QualifiedApplicantsSection.tsx`: Replace direct `localStorage.getItem`/`setItem` calls with service layer hooks/methods.
   - `src/components/ForHiringPage.tsx`: Fetch applicant score snapshots remotely in `load()` alongside hiring context.
   - `src/modules/admin/RSPDashboard.tsx`: Delegate category score finalization checks to the service layer.

## Subagent Delegation Plan (3 Agents on Gemini 3.8 Flash High)

- **Agent 1: Database Migration & Schema Engineer**
  - Run `npx supabase migration new applicant_category_scores`.
  - Implement idempotent schema migration and matching rollback script in `supabase/rollbacks/`.
  - Validate with `npm run check:migrations`.
- **Agent 2: Service Layer & Unit Test Engineer**
  - Implement `src/lib/api/applicantScores.ts`.
  - Write unit tests in `src/lib/api/applicantScores.test.ts` covering calculations, schema mapping, and fallback logic.
  - Verify with `npm test -- src/lib/api/applicantScores`.
- **Agent 3: UI Integration & Component Test Engineer**
  - Integrate service layer into `QualifiedApplicantsSection.tsx`, `ForHiringPage.tsx`, and `RSPDashboard.tsx`.
  - Update/add component tests in `src/components/ForHiringPage.context.test.tsx` and `src/components/QualifiedApplicantsSection.test.tsx`.
  - Verify with `npm test -- src/components/ForHiringPage src/components/QualifiedApplicantsSection`.

## Verification & Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run check:migrations`
- `npm test`
- `npm run build:verify`
- Live PostgREST read/write sanity test
