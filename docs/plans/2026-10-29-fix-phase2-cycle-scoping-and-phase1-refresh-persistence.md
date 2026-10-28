---
title: Fix Phase 2 Cycle Scoping & Phase 1 Refresh Persistence
date: 2026-10-29
status: Done
summary: Scope Phase 2 rating sheet to the active cycle so historical seeded IPCRs do not pre-fill on login, and prevent active cycle hijacking so Phase 1 targets persist across page refresh.
---

## Goal

When an employee logs into their portal to encode targets for the active performance cycle, the portal opens to Phase 1 in "Open for Editing" state with their targets preserved across browser refreshes. Phase 2 (Accomplishments & Ratings) will not show historical evaluations from past semesters, displaying instead the prerequisite notice until the current cycle's Phase 1 targets are approved.

## Approach

1. **Cycle Scoping for Phase 2 Rating Sheet**:
   - In `src/lib/api/ipcrRatings.ts`: Update `loadEmployeeRatingSheet(employeeId, cycleId)` to filter `target_settings` by the specified `cycle_id`. If no approved setting exists for the current cycle, return `null`.
   - In `src/modules/employee/EmployeePhase2.tsx`: Accept `cycleId` prop and pass it to `loadEmployeeRatingSheet`.
2. **Subtab Selection Gating**:
   - In `src/modules/employee/EmployeePage.tsx`: Auto-switch to `phase2` only if accomplishment rating is active **and** Phase 1 targets are approved for the current cycle. Default to `phase1`.
   - Pass `activeCycleId` to `<EmployeePhase2 cycleId={activeCycleId} />`.
3. **Protect Active Cycle from Historical Hijacking**:
   - In `src/modules/employee/EmployeePage.tsx` (`loadIPCRData`): When `getActiveCycle()` returns an active cycle, do not overwrite `activeCycleId` with past cycles returned by `loadLatestTargetSetting`. If the active cycle has no targets yet, start fresh with blank drafts for that active cycle.
4. **Debounced Draft Recovery in Phase 1**:
   - In `src/modules/employee/EmployeePage.tsx`: Cache typed `targetRows` in `sessionStorage` (`cictrix_phase1_draft_${employeeId}_${cycleId}`). Restore draft on page reload if DB record is draft or empty, and clear it upon submission.

## Steps

1. Update `loadEmployeeRatingSheet` in `src/lib/api/ipcrRatings.ts` to accept `cycleId`.
2. Update `EmployeePhase2.tsx` to receive `cycleId` and pass it to `loadEmployeeRatingSheet`.
3. Update `EmployeePage.tsx` to pass `cycleId` to `EmployeePhase2`, gate the Phase 2 auto-switch behind approved targets, prevent cycle ID hijacking, and add draft caching.
4. Add unit test coverage in `src/lib/api/ipcrRatings.test.ts` or `src/lib/api/ipcrTargets.latest.test.ts`.
5. Run TypeScript type check (`npx tsc --noEmit`), ESLint (`npm run lint`), unit tests (`npm test`), migration check (`npm run check:migrations`), and build (`npm run build`).
6. Rebuild plans dashboard via `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`.

## Risks

- **Offline/Unreadable Cycles via RLS**: If `performance_cycles` fails to read, `loadLatestTargetSetting` still acts as a fallback to locate active workflow settings.
- **Probationary Schedules**: Probationary employees with custom date windows continue to use their custom schedule.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/lib/api/ipcrTargets`
- `npx vitest run src/lib/api/ipcrRatings`
- `npm run check:migrations`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
