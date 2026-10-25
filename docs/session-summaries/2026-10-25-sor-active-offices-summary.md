# Summary of Ratings shows active offices only — session summary

Plan: `docs/plans/2026-10-25-sor-active-offices.md`

## Shipped vs. planned

Shipped as planned.

- `getActiveOfficeKeys()` in `src/lib/api/competencyGapAnalysis.ts` reads active top-level offices through `listDepartments()`.
- `restrictToActiveOffices()` in `src/modules/admin/pm/SummaryOfRatings.tsx` drops records and headcount for inactive offices and seeds a `0 / 0` entry for active offices with nobody yet. A failed office lookup leaves the data unfiltered.
- Wired into `LndSummaryOfRatings`, the PM `SummaryOfRatings` and `PmDashboardOverview`. On the PM dashboard this also scopes the department dropdown and the results KPIs.

## Deviations

None in code. The browser check could not run: the pages need a real sign-in, and the local `.env` holds a legacy Supabase anon key that the project disabled on 2026-09-24, so a local dev server cannot load data.

## Checks run

- `npx vitest run`: 57 files, 509 tests passed, including the new `pm/SummaryOfRatings.test.ts`.
- `npx tsc --noEmit`: one error, in `RspDashboardOverview.test.tsx` (missing `onOpenSuccessionPosition`). It belongs to the uncommitted RSP work already in the worktree, not this change.
- `npm run lint`: cannot run; the repo has no ESLint config file.
