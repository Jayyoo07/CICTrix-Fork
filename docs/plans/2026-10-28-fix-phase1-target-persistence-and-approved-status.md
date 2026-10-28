---
title: Fix Phase 1 Target Persistence & Approved Status Display
date: 2026-10-28
status: Done
summary: Fix MFO disappearance after Phase 1 submission and ensure accurate status badges ("Pending Approval" / "Approved & Locked") in the Employee Portal.
---

## Goal

When an employee submits their Phase 1 targets, the filled MFOs and success indicators must remain visible on screen, the inputs must be locked, and the status badge must show **"Pending Approval"**. Once the Department Head approves the targets, the status badge must display **"Approved & Locked"** with all approved MFOs rendered read-only in the table.

## Approach

1. **Active Cycle and Latest Target Setting Harmonization**:
   - In `src/lib/api/ipcrTargets.ts`: Update `getActiveCycle()` to fall back to the latest cycle if no active or planned cycle is flagged, matching `getActivePerformanceCycle()`.
   - Update `loadLatestTargetSetting(employeeId)` to sort by `updated_at DESC, created_at DESC`, prioritize settings that are `approved` or `submitted_for_approval` with populated targets over empty draft shells, and avoid returning blank draft records when real targets exist.
2. **Robust Fallback in `EmployeePage.tsx`**:
   - When loading target settings in `loadIPCRData`, if the cycle-specific query returns `null` or a draft shell without targets, fall back to `loadLatestTargetSetting(currentUser.supabaseId)`.
   - Synchronize `activeCycleId` with the resolved target setting's `cycle_id`.
   - Decouple `ipcrApproved` from `workspaceRow` presence; derive it directly from `target_settings.status === 'approved'`.
3. **Audit and Timestamp Precision in `ipcrApproval.ts`**:
   - Update `updated_at: now.toISOString()` during approval, return, and admin edits so timestamp-based sorting reflects recent workflow actions.

## Steps

1. Update `src/lib/api/ipcrTargets.ts` (`getActiveCycle`, `loadLatestTargetSetting`).
2. Update `src/lib/api/ipcrApproval.ts` (`approveTargets`, `returnForRevision`, `adminEditTargets`).
3. Update `src/modules/employee/EmployeePage.tsx` (`loadIPCRData`, approval state derivation).
4. Add unit test coverage in `src/lib/api/ipcrTargets.test.ts`.
5. Run type checks, linter, and vitest test suite.
6. Rebuild the plans index dashboard.

## Risks

- **Multiple Historical Cycles**: If an employee has targets across multiple past semesters, prioritizing `approved` over `submitted` must not hide a newly submitted current cycle. The resolution sorts by `updated_at DESC, created_at DESC` and prioritizes active lifecycle states (`submitted_for_approval`, `approved`, `returned_for_revision`) with populated targets.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
