---
title: In-page Back buttons on drill-downs — summary
date: 2026-10-26
plan: docs/plans/2026-10-26-drill-down-back-buttons.md
---

## Shipped

- Shared `BackButton` (`src/components/BackButton.tsx`): Small secondary pill
  (§9.1), 16px `arrow-left`, label "Back", in its own `.abyan-ds` scope so the
  §9.1 styles apply in every portal. It runs the view's close function, so
  `useBackClosesView` pops the history entry and browser Back stays in step.
- Added above the title in: Office Directory (shared L&D/PM section, RSP office
  and employee, System Administration), RSP Applicant Ranking (department,
  position), For Hiring (department, plantilla), Newly Hired (department),
  Applicant Score folders, RSP Archives employee documents, L&D Archive, L&D
  and PM Summary of Ratings, PM Semester Summary, PM Archive, PM IPCR
  Management (office, employee), Office Account Console approvals, Phase 2
  rating sheet, PM demo review screens, and RSP applicant details (its own
  route, so it uses `useHistoryBack` with the RSP home as fallback).
- DESIGN_IDENTITY.md §8.2: the "no text back links" row now requires the
  Back button in drill-downs.

## Deviations

- Bug fix found on the way: `useDepartmentNames` returned a new array every
  render. RSPDashboard's position-form effect depends on it and sets state, so
  with an employee open the dashboard re-rendered without end. That starved
  React Router's transition-wrapped location updates: browser Back out of RSP
  employee details never landed, and the new Back button couldn't pop its
  entry. Fixed by memoizing the names (`670be72`).
- Skipped as unreachable (not imported anywhere): `EmployeeDirectory` with
  `EmployeeListByPosition` / `EmployeeDetailPage`, and
  `PMPromotionalApplications`.
- Left as is: RSP Archives position view and other modals (they have a close
  button).
- `src/test/supabaseStub.ts` added for component tests that need query chains
  resolving to fixed rows.

## Checks

- `npx tsc --noEmit`: clean.
- `npm test` (with dummy `VITE_SUPABASE_*`): 758 of 759 pass. The failure,
  `src/lib/trainingProgress.test.ts` "single-day training", is timezone-bound
  and predates this work: it fails under UTC and passes with
  `TZ=Asia/Manila`.
- Each surface had a test that failed for "no Back button" before the change
  and passes after.
- Headless Chromium against the dev server (Supabase calls intercepted): PM,
  L&D and RSP Office Directory, RSP office → employee, System Administration,
  RSP applicant details. The button closes one level (history index drops by
  one), browser Back still closes one level, no page errors.
- Plans dashboard not regenerated: `docs/plans/build-plans-index.ps1` is not
  in the repo and PowerShell is not installed here.
