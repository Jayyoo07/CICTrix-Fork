---
title: Batch RSP dashboard succession counts
date: 2026-10-26
status: Done
summary: Replace the dashboard's per-position succession fetches with one shared batch, preserving every successor count and existing failure behavior.
---

## Goal

Load the RSP home dashboard's succession counts without repeating shared reads for every critical position. All position counts must match the previous implementation, including zero versus unknown. This is item 1 of the performance follow-ups discussed with the user; items 2–5 are not included.

The existing engine implementation is governed by [2026-10-26-succession-batch-fetch.md](2026-10-26-succession-batch-fetch.md). This change reuses it rather than replacing it.

## Approach

In `src/lib/api/succession.ts`, replace the worker loop in `getSuccessionDashboardOverview` with one `listAutoSuccessorsForPositions(allIds)` call. Map each successful result to `qualified.length`; missing or failed results stay `null`, which the existing UI displays as “—”. Keep position metadata, department scope, incumbent lookup, return shape, and ranking rules unchanged. Remove `OVERVIEW_ENGINE_CONCURRENCY` and update its outdated comment.

Work on `perf/dashboard-succession-batch` in a separate worktree based on `upstream/main`, preserving the user's original branch and local files. No schema, authentication, UI, caching, route-loading, or polling changes. No push or PR without explicit permission.

## Steps

1. Save this approved plan before code changes.
2. Add service-level regression tests for all-position batching, mixed departments, zero counts, per-position/shared failures, empty positions, and unchanged metadata.
3. Replace only the dashboard's per-position loop with the existing batch API.
4. Run targeted tests, type-check, lint, and the full Vitest suite; review the branch diff.
5. Use normal app access for read-only before/after live measurements. Compare every critical position (33 in the reported baseline), record request totals and timings, inspect combined response sizes/limits, and check browser responsiveness. Record only IDs, counts, and aggregate measurements, never employee records or credentials.
6. Save the session summary and regenerate the plan dashboard. Mark Done only after required verification passes; explicitly record any blocked verification.

## Risks

- A shared-read failure affects multiple positions together. Preserve unknown counts, not misleading zeros. Existing queries that ignore errors remain a known limitation, outside this focused change.
- Multi-position manual-candidate and competency-requirement queries can return more rows. Check response limits and count parity across the complete dataset.
- Synchronous evaluation of all positions may affect responsiveness. Inspect browser main-thread work rather than assuming fewer requests guarantees a smooth page.
- Live data may change during comparison. Use the same normal app access for both paths and investigate mismatches before declaring parity.
- The reported 453 requests / 17.5 s baseline is supplied by the earlier conversation, not yet reproduced here. About 15–17 requests and 2 s are estimates, not acceptance guarantees.

## Checks to run

- Targeted dashboard-service and succession evaluator tests, plus `RspDashboardOverview.test.tsx`.
- `npx tsc --noEmit`.
- `npm run lint`.
- `npm test`.
- Read-only live old/new comparison: identical successor counts for every position, measured elimination of per-position request fan-out, and recorded timings.
- Browser responsiveness and response-limit checks. No claim of a measured improvement or completed live validation if access is unavailable.

## Results

- Read-only browser comparison against live data on 2026-10-26: 33 of 33 position counts match, with no missing positions or unknown counts.
- Dashboard service requests: 498 before, 18 after. Service wall time: 12.28 s before, 1.73 s after. These measurements isolate the service, not the complete admin route.
- Decoded JSON response volume: 8,857,186 bytes before, 318,058 bytes after. Neither run recorded a browser long task over 50 ms.
- Exact-count checks confirm all 110 competency requirements and all 0 manual-candidate rows were returned for the combined position set. Manual candidates outside the active pool are covered by a regression test.
- The real `RspDashboardOverview` component loaded all 33 positions and opened its View all dialog in the browser, with no long tasks recorded in that check. The full authenticated admin route was not benchmarked.
- Type-check, lint, 21 targeted tests, all 619 tests across 71 files, and `npm run build:verify` pass. Existing test/build warnings remain.
- Existing live issue, not introduced or fixed here: `getLatestOverallScores` selects nonexistent `employees.department_id` and ignores the error. It occurs 33 times in the old dashboard path and once in the batch path; count parity does not certify existing score correctness.
- Details: [session summary](../session-summaries/2026-10-26-dashboard-succession-batch-summary.md).
