---
title: Match IPCR submissions on the PM dashboard
date: 2026-10-26
status: Done
summary: Align PMDashboard's IPCR submission matching with the cycle title vocabulary and the Subtab 2.2 fallback map, so forwarded IPCRs reflect on the PM dashboard overview card instead of showing 0.
---

## Goal

When opening the PM Dashboard (`Performance Management > Dashboard`), the IPCR submission card displays the true submission rate (114 of 130 submitted, 88%) across all active departments instead of "0% 0 of 130 submitted". The individual department rows and the segmented summary bar reflect actual employee status, matching the data in IPCR Management Subtab 2.2.

## Approach

Root cause:
In `PMDashboard.tsx` (`loadIpcrStats`), `computeStageInfoLocal` generates regular employees' period labels as `"1st Half <year>"` or `"2nd Half <year>"`. However, the `ipcr_submissions` table populated by `finalize_ipcr_surfaces` and historical seeds records the semester cycle titles (`"January–June 2026"`, `"July–December 2025"`, `"January–June 2025"`). Because `loadIpcrStats` looked up only `subMap.get(`${emp.id}::${periodLabel}::${phase}`)`, every single employee lookup failed and defaulted to `'Not Started'`, marking all 130 active employees as not forwarded.

Solution:
Adopt the exact dual-lookup and fallback strategy already implemented in `src/modules/admin/pm/PMIPCRManagement.tsx` (Subtab 2.2):
1. In `src/lib/ipcrPeriods.ts` (or centralized helper), export `toCalendarPeriod(periodLabel: string): string | null` to translate `"1st Half <year>"` to `"January–June <year>"` and `"2nd Half <year>"` to `"July–December <year>"`.
2. In `PMDashboard.tsx`, build both `subMap` (exact key: `${s.employee_id}::${s.period}::${s.phase}`) and `subByEmpPhase` (key: `${s.employee_id}::${s.phase}`, tracking the latest updated submission).
3. Introduce `currentCycleStart(hireDate: string): Date` matching `PMIPCRManagement.tsx` so fallback lookups do not resurrect submissions from previous completed cycles.
4. During employee evaluation:
   - Check exact key: `subMap.get(`${emp.id}::${periodLabel}::${phase}`)`
   - Check calendar period key: `calPeriod ? subMap.get(`${emp.id}::${calPeriod}::${phase}`) : undefined`
   - Fall back to `subByEmpPhase.get(`${emp.id}::${phase}`)` if `updatedAt >= currentCycleStart(hireDate).getTime()`
   - Default to `'Not Started'`
5. Add unit tests in `src/lib/ipcrPeriods.test.ts` and `src/modules/admin/PmDashboardOverview.test.tsx` ensuring period translations and forward rate matching behave consistently.

## Steps

1. Create helper `toCalendarPeriod` in `src/lib/ipcrPeriods.ts` and add unit tests in `src/lib/ipcrPeriods.test.ts`.
2. Update `loadIpcrStats` in `src/modules/admin/PMDashboard.tsx`:
   - Build `subByEmpPhase` alongside `subMap`.
   - Add `currentCycleStart` helper.
   - Resolve `actualStage` through exact key -> calendar title key -> cycle-bounded fallback.
3. Verify with live database dry-run in test and vitest suite.
4. Confirm `npx tsc --noEmit` and `npm test` pass cleanly.
5. Create session summary `docs/session-summaries/2026-10-26-pm-dashboard-submission-matching-summary.md` and rebuild the plans dashboard.

## Risks

- **False-positive fallback across cycles**: If an employee has a prior cycle's submission but none for the current cycle, an unbounded fallback could mark them as submitted. The `updatedAt >= currentCycleStart(...)` gate prevents this, matching Subtab 2.2.
- **Probationary naming variants**: Probationary cycles configured in `probationary_ipcr_schedules` or default labels (`Probationary — 1st 3 Months`) must remain intact; `toCalendarPeriod` returns `null` for non-half labels so probationary exact matching is unaffected.

## Checks to run

- `npx tsc --noEmit`
- `npx vitest run src/lib/ipcrPeriods.test.ts`
- `npx vitest run src/modules/admin/PmDashboardOverview.test.tsx`
