---
title: Succession Planning V2 Automated Fallbacks & Review Bypass
date: 2026-10-28
status: Draft
summary: Bypass manual evidence review gating in Succession V2 and add multi-tier database fallbacks (department name resolution, date_hired tenure, profile education and eligibility) so qualified successors load and rank immediately.
---

## Goal

Allow Succession Planning V2 to discover eligible department employees and immediately populate the Ranked Candidates table using automated fixed-weight scoring (30% Performance, 20% Experience, 20% Training, 15% Education, 15% Eligibility). Manual review gating is bypassed and multi-tier database fallbacks are applied for missing granular PDS detail records.

## Approach

1. **Candidate Discovery Alignment:**
   - Resolve `critical_positions.department_id` to `departments.name`.
   - Query `employees` using `department = deptName` and `status = 'Active'`.
   - Apply discovery filters matching V1: exclude incumbent, same-title peers, and probationary staff.
   - Include explicit nominees from `succession_candidates`.
2. **Multi-Tier Evidence Fallbacks:**
   - Experience: Use `employee_work_experience` if present. If empty, fall back to City Hall tenure computed from `employees.date_hired` as verified relevant experience.
   - Training: Aggregate hours from `employee_training` rows.
   - Education: Use `employee_education`; if empty, fall back to `employees.highest_educational_attainment`.
   - Eligibility: Use `employee_eligibility`; if empty, fall back to `employees.eligibility`.
   - Performance: Retrieve latest completed IPCR overall rating via `getLatestOverallScores`.
3. **Review Bypass / Auto-Scoring:**
   - Set evidence inventories to `complete: true` and default unreviewed evidence items to `relevant: true` and `recognized: true`.
   - Evaluate all candidates through `evaluateSuccessionV2` and `rankSuccessionV2`.
4. **UI Adaptation:**
   - Display ranked candidates in the main succession table with their V2 100-point breakdown.
   - Display the count of candidates failing minimum qualifications.
   - Suppress the empty "Needs Evidence Review" section when reviews are bypassed.

## Steps

1. Update `src/lib/api/successionPipelineV2.ts` to implement department name resolution, candidate discovery exclusions, multi-tier data fallbacks, and review bypass.
2. Update `src/components/SuccessionPlanningPage.tsx` to handle the unblocked pool and suppress the empty review prompt when reviews are bypassed.
3. Update unit and integration tests in `src/lib/api/successionPipelineV2.test.ts` and `src/components/SuccessionPlanningPage.v2.test.tsx`.
4. Run verification checks:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run check:migrations`
   - `npm run build`
5. Verify live rendering with Vite dev/preview.

## Risks & Mitigations

- **Risk: Qualification Exclusions:** Candidates failing minimum experience or training hours will be excluded from the ranked pool. Handled by displaying the excluded count and specific reasons below the table.
- **Risk: Tenure Approximations:** Relying on `date_hired` treats all City Hall service as relevant experience until granular work records are filed. Documented as a provisional score.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
- `npm run build`
