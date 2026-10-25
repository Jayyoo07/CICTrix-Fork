---
title: Summary of Ratings shows active offices only
date: 2026-10-25
status: Done
summary: Limit the L&D and PM Summary of Ratings and the PM dashboard overview to offices that are active in the departments table, dropping Legal and Information Technology.
---

## Goal

Legal and Information Technology were deactivated in `departments` (migration `20261024171047`), but Summary of Ratings still lists them because it builds its office list from employee records. Show only active offices, including active offices with no employees yet.

## Approach

- Add `getActiveOfficeKeys()` to `src/lib/api/competencyGapAnalysis.ts`: the active top-level offices from `listDepartments()`, keyed by `normDeptKey`.
- Add a pure `restrictToActiveOffices(records, headcount, activeOffices)` in `pm/SummaryOfRatings.tsx`. It drops records and headcount entries for inactive offices and seeds a zero-count entry for each active office with nobody yet. `buildDeptCompletionRows` stays unchanged.
- Call both in `LndSummaryOfRatings`, `pm/SummaryOfRatings` and `PmDashboardOverview`. If the office lookup fails, fall back to the unfiltered data.

Nothing is deleted; records tagged to inactive offices stay in the database.

## Steps

1. Service function and pure helper.
2. Wire into the three pages.
3. Unit test for the helper; update the PM overview test mock.
4. Run checks and verify in the browser.

## Risks

- Office names in employee records that differ from `departments.name` beyond case/whitespace would be hidden. Matching uses the same `normDeptKey` as today.

## Checks to run

- `npx tsc --noEmit`, `npm test`, `npm run lint`
- L&D Summary of Ratings in the browser: Legal and IT gone, five offices listed.
