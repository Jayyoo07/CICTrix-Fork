---
title: Batch RSP dashboard succession counts — session summary
date: 2026-10-26
status: Done
summary: Dashboard service requests fell from 498 to 18 and measured load time from 12.28 s to 1.73 s, with identical counts for all 33 critical positions.
plan: ../plans/2026-10-26-dashboard-succession-batch.md
---

## Shipped versus planned

- `getSuccessionDashboardOverview` in `src/lib/api/succession.ts` now calls `listAutoSuccessorsForPositions` once for all critical positions instead of using four per-position workers.
- Removed `OVERVIEW_ENGINE_CONCURRENCY` and updated the dashboard service comment. No changes to the engine, ranking rules, metadata, return shape, UI, schema, auth, route loading, or polling.
- Added nine service-boundary regression tests in `src/lib/api/successionDashboardOverview.test.ts`. They exercise the real loader/evaluator against Supabase fixtures: one combined batch, office scope and incumbent exclusion, unchanged metadata, zero counts, manual candidates outside the active pool, missing positions, individual evaluator failures, shared failures, empty positions, and initial query errors.
- Work is isolated on `perf/dashboard-succession-batch`, based on `upstream/main` at `ec70722`. The user's original checkout was not edited. Nothing was pushed, deployed, or submitted as a PR.

## Live verification

Read-only comparison on 2026-10-26 used the normal app Supabase client in a local Vite browser harness, without elevated credentials or database writes. The harness blocked every fetch method except GET/HEAD. Baseline function text was checked to match the original `getSuccessionDashboardOverview` from `upstream/main`; its unchanged single-position wrapper still uses the same ranking engine. The comparison ran both paths sequentially using the same client and live dataset.

| Measurement | Per-position baseline | Dashboard batch |
| --- | ---: | ---: |
| Positions returned | 33 | 33 |
| REST requests, including existing failed reads | 498 | 18 |
| Service wall time | 12,281.5 ms | 1,725.4 ms |
| Decoded JSON response bytes, not compressed wire bytes | 8,857,186 | 318,058 |
| Browser long tasks over 50 ms | 0 | 0 |

All 33 position IDs and successor counts matched, with no missing positions or unknown counts. The count distribution was 7 positions with zero successors, 13 with one, 9 with two, 3 with three, and 1 with four.

The widened competency-requirement query returned 110 rows, matching a separate HEAD exact-count check. The manual-candidate query returned zero rows, also matching its exact count. Other measured responses returned at most 318 top-level rows. There was no combined-query truncation detected on this dataset; that is not a guarantee for future dataset growth.

The real `RspDashboardOverview` component was also mounted with the live succession service in a browser harness. It loaded the 33-position list and opened its View all dialog, with zero observed long tasks. Other dashboard props were empty fixtures; this was not a full authenticated admin-route benchmark or a visual-design audit.

The browser harness and baseline copy remain in ignored `scratch/` and are not part of the application or commit. Measurements retain only position IDs/counts and aggregate response/timing information, not employee records or credentials.

## Deviations and existing issues

- The earlier conversation reported 453 requests / 17.5 s and estimated 15–17 requests / about 2 s after batching. This session measured 498 / 12.28 s versus 18 / 1.73 s on current live data; the estimates were not treated as guarantees. An initial pre-edit baseline also measured 498 requests / 13.04 s.
- Existing live schema mismatch: `getLatestOverallScores` requests `employees.department_id`, which fails with PostgreSQL code `42703` because the column does not exist. The error is ignored by the existing loader, so its department-weight lookup falls back. The old path makes this failing read once per position (33); the new path makes it once. This separate scoring issue was flagged and left unchanged. Matching counts does not certify score correctness.
- Supabase performance/security advisors and log-source totals were read before changing the service. Existing advisor findings are outside this no-schema-change task; no policies, indexes, or access permissions were changed.
- The plan-index generator exists only as an untracked file in the original checkout, not on `upstream/main`. Its contents were invoked in memory with this worktree's plans directory substituted for `PSScriptRoot`, regenerating this worktree's `docs/plans/index.html` without editing the original checkout or adding unrelated tooling.
- A new-test TypeScript narrowing error was caught and corrected before the final checks. No application behavior was changed to address it.

## Checks run

- New service test before the implementation: 8 passed, 1 failed on the expected per-position-versus-batch query assertion.
- Targeted service/evaluator/dashboard tests: 21 passed across 3 files.
- `npx tsc --noEmit`: passed after correcting test narrowing.
- `npm run lint`: passed with zero warnings.
- `npm test`: passed, 619 tests across 71 files. Existing React `act(...)` warnings and fixture diagnostics remain.
- `npm run build:verify`: passed. Existing Vite CJS and stale Browserslist notices remain.
- Live all-position parity, request/timing/response-size checks, combined-query exact counts, and browser component interaction: passed as described above.
- Branch diff reviewed; `git diff --check`: passed.
