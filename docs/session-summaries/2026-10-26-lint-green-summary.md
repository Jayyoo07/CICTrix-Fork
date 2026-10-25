---
title: Lint green on current main (summary)
date: 2026-10-26
plan: docs/plans/2026-10-26-lint-green.md
---

## What shipped

- `.eslintrc.cjs` now ignores `coverage`, `.worktrees`, and `.claude` as well as `dist`, `node_modules`, and `scratch`.
- `react-refresh/only-export-components` is off. It is a dev-only Fast Refresh hint, and pages co-locate helpers and demo fixtures on purpose.
- `npm run lint` is scoped to `src` and `vite.config.ts`, so a worktree copy cannot be linted twice.
- The config (`46cfe33`) and mechanical cleanup (`a471c79`) from `chore/eslint-config` were cherry-picked onto current `origin/main` (`4a06d9d`). Conflicts were resolved toward main's newer code; the cleanup's unreachable-code deletions were kept where nothing referenced them.
- Remaining findings were cleared: unused imports, unused state values, unreachable handlers (`duplicatePosting`, `openRankingReport`, `openBulkRequestDialog`, `roleBadge`), a `no-fallthrough` comment placement, and a redundant `Boolean`.
- Hook warnings: fourteen fixed by adding stable dependencies or memoizing `inDept`/`start`; the rest are one-line disables with a reason. The deliberate cache invalidators in RSPDashboard and SettingsPage carry comments explaining why the dependency is not in the callback body.

## Deviations from the plan

- The cleanup commit deleted about 1,240 lines from `SystemAdministrationPage` (unreachable `PhaseScheduler`, `LockedTargetsVault`, `ComplianceTracker`, `FinalReviewCloseout`, `RecordCompilationModal`, and their helpers). The page itself only renders `OfficeDirectory` and `AccessRoleManagement`.

## Dead-code audit

- Every removed declaration was checked against `4a06d9d`: 50 top-level and 71 nested declarations, with zero references surviving at `HEAD`. Thirty-nine nested functions had no call site even on main; the other 32 were called only from lines deleted in the same commit. No `lazy()` imports, string lookup, or bracket access reached them. `tsc` and 524 tests confirm the static result.
- "Unreachable" is not the same as "never used." The four `SystemAdministrationPage` subtabs were rendered from `0e9d04c` (2026-07-01) until `298b547` (2026-07-05, "PM structural changes"), which removed the tab renderer and left the components in place. `duplicatePosting`, `openRankingReport`, `openBulkRequestDialog`, `handleSubmitStatusEvaluation`, `handleSendMessage`, `handleSaveIPCR`, `startEditing`, `saveTargetEdit`, and `transmitTargetsToPM` all had live `onClick` wiring when written; later commits removed the buttons.
- Phase Scheduler and Locked Targets have replacements at `HEAD` (`openPhase`/`closePhase`; `listLockedTargets` in `IPCRManagementPage`). Compliance Tracker and Final Review & Closeout do not: they were the only callers of `getComplianceByOffice`, `recordCompilation`, and `closeoutOffice`, which now have no UI. `duplicatePosting` also has no replacement.
- Nothing a user could reach on `4a06d9d` changed behavior. The old admin implementation is recoverable with `git show 4a06d9d:src/modules/admin/SystemAdministrationPage.tsx`; if those two screens are wanted, rebuild them wired to the existing APIs rather than restoring stale JSX.
- `EmployeePage`: `loadIPCRData` keeps a disable for `emptyCatRating`, a pure local factory. Adding it would re-create the loader every render; `snapshotLoaded` was added because it is a stable `useCallback`.
- `OfficeAccountConsole`: `refreshPendingApprovals` is declared after the realtime callback, so it cannot be referenced in that dependency array without reordering the component. The realtime hook stores the latest callback in a ref, so the callback still sees the current function.
- Tests require a local `.env`; it is gitignored and was copied from the main worktree for the run only.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm run lint`: exit 0, zero warnings.
- `npm test`: 60 files, 524 tests passed.
- `npx vite build --minify false --target esnext`: built 3,109 modules; `dist/assets/index-*.js` 6,029.84 kB. This is the Windows workaround for esbuild issue #4559; production still builds on Linux/Vercel.
