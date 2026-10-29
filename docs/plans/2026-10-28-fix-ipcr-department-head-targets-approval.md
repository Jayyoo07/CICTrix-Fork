---
title: Fix IPCR targets auto-approval and restore Department Head review
date: 2026-10-28
status: Done
summary: Disentangle submitted targets from auto-approval, display "Pending Approval" on employee submit, verify Department Head inline target editing before approval, and align seed scripts with manual approval workflow.
---

## Goal

Restore the proper IPCR Phase 1 Target Setting lifecycle:
1. When an employee submits their IPCR targets, their screen displays a **"Pending Approval"** badge (Info blue, locked against edits) while waiting for their Department Head's action, rather than prematurely claiming "Approved & Locked".
2. Confirm and maintain the existing **Department Head Edit / Override** functionality (`Edit / Override` -> inline inputs -> `adminEditTargets`) so Department Heads can modify MFO titles and Success Indicators before approving or returning.
3. Fix seed data and active target loading so submitted IPCR targets show up in the Department Head's review queue (`/office/dashboard?activeTab=ipcr&ipcrSubtab=targets&targetsSubtab=verify`) instead of being pre-approved by automated scripts.

## Approach

1. **Employee Portal Status & Badges (`src/modules/employee/EmployeePage.tsx`)**:
   - Disentangle the binary `ipcrApproved` boolean.
   - When `targetStatus === 'submitted_for_approval'` or `workspaceRow?.status === 'Targets Submitted'`, render a **"Pending Approval"** badge (`#E0E5FF` bg / `#191FA8` text with a `Clock` icon, conforming to `DESIGN_IDENTITY.md` §9.8 and §10) and an informational notice stating that targets are submitted and awaiting Department Head review.
   - Keep target inputs read-only while pending approval, and hide the "Save Draft" and "Submit Targets for Approval" buttons.
   - Only display **"Approved & Locked"** (`#DCFCE7` bg / `#0F7A40` text with `CheckCircle2`) when `targetStatus === 'approved'`.
   - When returned for revision (`targetStatus === 'returned_for_revision'`), display a **"Needs Revision"** badge (`#FDE2E2` bg / `#B42323` text) and display the Department Head's review comment banner, enabling inputs and submission buttons again.

2. **Verify & Maintain Department Head Inline Target Editing (`src/modules/admin/pm/OfficeAccountConsole.tsx` & `src/lib/api/ipcrApproval.ts`)**:
   - Department Head editing functionality is verified intact:
     - `startEdit(p)` activates inline editing for all MFO titles and Success Indicator descriptions with character counter limits.
     - `saveEdits(p)` calls `adminEditTargets(...)` which persists changes to `mfos` and `success_indicators` with audit logging in `ipcr_audit_log`.
     - Department Head retains the three explicit options: `Approve & Freeze`, `Edit / Override`, and `Return for Revision`.
   - Add unit test coverage verifying that `startEdit` and `saveEdits` behave as expected in `OfficeAccountConsole.back.test.tsx`.

3. **Target Setting Resolution (`src/lib/api/ipcrTargets.ts`)**:
   - In `loadLatestTargetSetting()`, replace `rows.find((s) => s.status === 'approved') ?? rows[0]` with `rows[0] ?? null` so that an employee's latest active submission (pending review) is loaded rather than defaulting to an older cycle's approved record.

4. **Seed Script Alignment & Production SQL (`scripts/seed-ipcr-current-targets.mjs`)**:
   - In `scripts/seed-ipcr-current-targets.mjs`, update active-cycle target generation so targets are seeded with `status: 'submitted_for_approval'` (with `submitted_at`) instead of hardcoding `status = 'approved'` and fake approval timestamps for non-Legal offices.
   - Provide a safe SQL script for the user to execute in Supabase dashboard to reset unrated target settings for the active cycle from `approved` to `submitted_for_approval` (clearing `approved_at` and `approved_by`), populating the Department Head queues.

## Steps

1. In `src/modules/employee/EmployeePage.tsx`:
   - Replace naive `setIpcrApproved(ws.status !== 'Draft Targets')` with explicit checks on `targetStatus`.
   - Update header status badge and top notice banner for:
     - `draft`: "Open for Editing" / "Closed"
     - `submitted_for_approval`: "Pending Approval"
     - `returned_for_revision`: "Needs Revision"
     - `approved`: "Approved & Locked"
   - Lock inputs and hide submission buttons while in `submitted_for_approval` or `approved`.

2. In `src/lib/api/ipcrTargets.ts`:
   - Fix `loadLatestTargetSetting` to prioritize the most recent target setting rather than skipping pending targets in favor of approved ones.

3. In `scripts/seed-ipcr-current-targets.mjs`:
   - Set status to `submitted_for_approval` instead of `approved` for active cycle offices so that targets populate the Department Head queue.

4. In `src/modules/admin/pm/OfficeAccountConsole.back.test.tsx`:
   - Add tests verifying the Department Head can click `Edit / Override`, modify target text, and save edits via `adminEditTargets`.

5. Provide manual SQL script in `supabase/queries/reset_unrated_targets_to_submitted.sql` for resetting active cycle targets in the live database.

## Risks

- **Phase 2 Gate Dependency**: Phase 2 rating sheet requires targets to be `approved`. By requiring Department Heads to approve targets before ratings begin, the system correctly adheres to CSC IPCR guidelines (targets must be reviewed and approved by the supervisor before performance can be rated).
- **Dual-role Department Heads**: Department heads submitting their own IPCR are blocked by `ipcrApproval.ts` from approving or editing their own targets; their targets must be approved by the designated office/executive supervisor.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
