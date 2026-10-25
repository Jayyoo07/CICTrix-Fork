---
title: ESLint config and safe lint cleanup (summary)
date: 2026-10-20
plan: docs/plans/2026-10-20-eslint-cleanup.md
---

## What shipped

- `.eslintrc.cjs` (Vite React-TS template). `no-explicit-any` is off, and `no-unused-vars` ignores `_`-prefixed names, matching the code's existing convention.
- Findings went from 1,343 to 54: the 30 `react-hooks/exhaustive-deps` warnings (left on purpose, D4) and 24 `react-refresh/only-export-components` warnings.
- 49 files changed, about 2,150 lines deleted. Most of that is dead code: unused imports, unused state, handlers never wired up, and whole unrendered subtabs (`PhaseScheduler`, `LockedTargetsVault`, `ComplianceTracker`, `FinalReviewCloseout`, `RecordCompilationModal`, and others in SystemAdministrationPage) along with their now-unused helpers.
- Deletions used TypeScript's own "remove unused declaration" codefix, applied only at the spots ESLint reported and repeated until no new dead code appeared.
- 13 empty `catch` blocks now carry a comment saying why the error is ignored. None was changed to rethrow.
- Constant conditions: `while (true)` became `for (;;)`, and the dead `(true ? '' : …)` branch was removed from the hire email, so the sent text is unchanged.

## Deviations from the plan

- `AdminLayout`: its `useLocation()` value was unused, but the call was the component's only subscription to navigation, and the component reads the admin session during render. The call is kept, with a comment, so re-render behavior is unchanged (D5).
- `employeesApi.ts`: removed a `departments` SELECT whose result (`deptId`) was never read. It was a read-only query, so this only drops one wasted round trip.
- `react-refresh/only-export-components` (24) was not fixed, because it would mean moving exports between files. It only affects dev hot reload.
- `src/components/QualifiedApplicantsPage.tsx` is no longer imported anywhere (it had no route). The file was left in place.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm test`: 41 files, 377 tests passed.
- `npx vite build`: built.
- Dev server: the landing and jobs pages load with 250 resources and no failed requests. Admin pages were not exercised because they need a real Supabase sign-in.
- `npm run lint`: still fails on the 54 remaining warnings, because `--max-warnings 0`.
