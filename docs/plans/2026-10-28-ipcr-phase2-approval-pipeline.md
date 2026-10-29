---
title: Fix IPCR Phase 2 Approval Pipeline and Trigger Synchronization
date: 2026-10-28
status: Done
summary: Fix IPCR Phase 2 approval discovery by removing non-existent department_id references, correcting the premature DB finalize trigger condition, and making listPendingRatingApprovals resilient to premature forward stages.
---

## Goal

Ensure employee Phase 2 accomplishment submissions immediately and reliably appear in the Department Head's console under the **Ratings** subtab for review and scoring, and prevent premature finalization in the database before Department Head approval.

## Root Cause Analysis

1. **Subtab Misalignment**: The Department Head is currently viewing the **Targets** subtab (`ipcrSubtab === 'targets'`), which is dedicated to **Phase 1: Target Interception & Adjustment** and queries `target_settings.status = 'submitted_for_approval'`. Angela's Phase 1 targets were approved earlier today (`status = 'approved'`). Phase 2 accomplishment ratings are managed under the **Ratings** subtab (`ipcrSubtab === 'ratings'`) via `Phase2RatingPanel`.
2. **Premature DB Finalization**: Migration `20261026023000_finalize_ipcr_surfaces.sql` installed trigger `target_settings_finalize_ipcr_upd` with `when (new.phase2_status = 'completed' and old.phase2_status is distinct from 'completed')`. When an employee submits their self-ratings, `phase2_status` changes from `'open'` to `'completed'`. The trigger fires prematurely and calls `finalize_ipcr_surfaces()`, inserting an `ipcr_submissions` record with `stage = 'Forwarded to PM'`, `performance_evaluations` as `'Approved'`, and `ipcr_performance` rows before any Department Head review.
3. **Broken Client-Side Sync (`department_id` missing)**: In `src/lib/api/ipcrSubmissions.ts`, `resolveTargetSettingMeta()` queries `department_id` from `employees_with_department`. Because the view has no `department_id` column, PostgREST returns a `42703 Bad Request` error. The error is swallowed, causing `setSubmissionStage('Submitted to Office')` to be skipped. The same bug exists in `getSubmissionTracker()` in `ipcrSubmissions.ts` and `getComplianceOverview()` in `compliance.ts`.
4. **List Query Exclusion**: `listPendingRatingApprovals()` in `src/lib/api/ipcrRatings.ts` checks `ipcr_submissions.stage` and discards any record where `stage === 'Forwarded to PM'`. Since the trigger prematurely set the stage to `'Forwarded to PM'`, Angela's submission was completely hidden from the pending review list.

## Approach

1. **Client API Fixes**:
   - In `src/lib/api/ipcrSubmissions.ts` (`resolveTargetSettingMeta` & `getSubmissionTracker`) and `src/lib/api/compliance.ts`: remove `department_id` from the `employees_with_department` queries. Look up the department ID from `departments` by `name = emp.department` where an ID is required.
   - In `src/lib/api/ipcrRatings.ts` (`listPendingRatingApprovals`): make `phase2_approved_at IS NULL` the primary pending filter. If `target_settings` has `status = 'approved'`, `phase2_status = 'completed'`, and `phase2_approved_at IS NULL`, include it as pending approval even if `ipcr_submissions` stage was stamped with `'Forwarded to PM'`.
2. **Database Trigger Guard (Migration)**:
   - Create a new migration updating `target_settings_finalize_ipcr_upd` so it only fires when `new.phase2_status = 'completed' AND new.phase2_approved_at IS NOT NULL` (and on `target_settings_finalize_ipcr_ins` with the same condition).
3. **Data Remediation SQL**:
   - Provide a safe SQL script to reset Angela's `ipcr_submissions` phase `rating` row to `stage = 'Submitted to Office'`, and remove the premature cycle 2 row in `performance_evaluations` and unapproved mirror rows in `ipcr_performance` so the record cleanly awaits Department Head review.

## Steps

1. Create a git branch for the fix (`fix/ipcr-phase2-approval-pipeline`).
2. Update `src/lib/api/ipcrSubmissions.ts` to fix `resolveTargetSettingMeta` and `getSubmissionTracker`.
3. Update `src/lib/api/compliance.ts` to eliminate `department_id` selection from `employees_with_department`.
4. Update `src/lib/api/ipcrRatings.ts` in `listPendingRatingApprovals` so `phase2_approved_at is null` is authoritative.
5. Create new migration via `npx supabase migration new fix_finalize_ipcr_trigger` to update trigger conditions.
6. Provide remediation SQL for Angela's premature records.
7. Run `npx tsc --noEmit` and `npm test` to verify all tests pass.

## Risks

- **Risk**: Existing historical finalized records must not be affected.
- **Mitigation**: The trigger condition only affects new updates where `phase2_approved_at` is null. The migration only modifies the trigger definition, not historical data.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
