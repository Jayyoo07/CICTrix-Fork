---
title: Fix Summary of Ratings Completed IPCR Display & Roster Eligibility
date: 2026-10-28
status: Done
summary: Fix PostgreSQL ambiguous column error in evaluate_sor_publication, align roster snapshot eligibility with semester start date, and update UI completion denominator so Summary of Ratings accurately displays completed IPCRs for each department.
spec: docs/plans/2026-10-27-sor-previous-semester-competency.md
---

## Goal

Every department on the PM Summary of Ratings accurately displays its completed semester IPCRs (Cycle 6: January–June 2026, 105 / 105 across the 5 offices) with official ratings and full competency blocks instead of showing "0 of 120 employees with complete IPCR" and "No completed semester".

## Approach

Four root causes identified:
1. `evaluate_sor_publication`: PostgreSQL variable conflict between output table column `cycle_id` and table column in `on conflict (department_name, cycle_id)`. Fix by adding `#variable_conflict use_column` and using constraint target `on conflict on constraint ipcr_dept_pub_dept_cycle_key`.
2. `build_ipcr_semester_roster`: Checked `date_hired <= cycle.end_date` rather than `date_hired <= cycle.start_date`, adding mid-semester hires who were not expected to have an IPCR for that semester. Fix to use `start_date`.
3. `SummaryOfRatings.tsx`: `buildDeptCompletionRows` used current live headcount (28) as completion denominator rather than the semester's required roster count (24), violating the frozen denominator rule. Fix to use `sem.requiredCount` when published.
4. RLS & Permissions: Add `anon` to `select` on `ipcr_department_publication` and `ipcr_semester_roster`, and `grant execute` on functions so public/anon sessions load read-only ratings reliably.

## Steps

- [x] 1. Migration `fix_sor_publication_and_roster`:
   - Fix `evaluate_sor_publication` with `#variable_conflict use_column` and constraint conflict target.
   - Fix `build_ipcr_semester_roster` with `date_hired <= start_date`.
   - Grant execute to `anon, authenticated, service_role` and select on tables to `anon, authenticated`.
- [x] 2. Database Verification:
   - Validate `evaluate_sor_publication` for all 5 departments against the live Supabase database.
   - Confirm Cycle 6 (January–June 2026) qualifies at 100% completion (105 / 105).
- [x] 3. Frontend Data Layer:
   - Verify `sorSemesterSource.ts` retrieves published records and final scores.
- [x] 4. UI & Completion Denominator:
   - Update `SummaryOfRatings.tsx` to set completion to `sem.approvedCount / sem.requiredCount` for published departments.
   - Update tests in `SummaryOfRatings.test.ts`.
- [x] 5. Smoke Tests & upstream merge:
   - Run `check:migrations`, `tsc`, `lint`, and `vitest`.
   - Commit and merge PR upstream.

## Risks

- Re-snapshotting cycle 6 roster: `build_ipcr_semester_roster` has an idempotency guard. We will truncate `ipcr_semester_roster` and `ipcr_department_publication` in the migration so the corrected start-date roster is frozen properly.

## Checks to run

- `npm run check:migrations`
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/lib/api/sorSemesterSource.test.ts src/modules/admin/pm/SummaryOfRatings.test.ts`
- Live database query verifying 5/5 departments published for January–June 2026
