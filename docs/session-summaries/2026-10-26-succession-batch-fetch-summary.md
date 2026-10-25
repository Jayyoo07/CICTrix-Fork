# Succession batch fetch: session summary

Plan: [2026-10-26-succession-batch-fetch](../plans/2026-10-26-succession-batch-fetch.md)

## What shipped vs. planned

All code steps shipped:

- `listAutoSuccessors` no longer fetches per position. `loadAutoSuccessorContext` loads SRP ranks, the active employee pool, eligibility, IPCR scores, training history, competency tags, manual candidates and competency requirements once per department; `evaluateAutoSuccessors` is a pure per-position evaluator; `listAutoSuccessorsForPositions` returns a map of results keyed by position id.
- `listAutoSuccessors(id)` is a one-position wrapper over the batch path, so single and batch results share one implementation.
- `SuccessionPlanningPage` calls the batch once when a department expands and applies all results in one `setCandByPos` update.
- Four evaluator tests cover a qualified candidate, a gate failure, a downward-move exclusion and a manual candidate outside the active pool.

Live check on the largest department (Office of The City Health Officer, 10 critical positions):

| | REST requests | Time | Output |
| --- | --- | --- | --- |
| Before | 140 | 5.68 s | baseline |
| After | 14 | 1.26 s | 10/10 positions deep-equal |

The first batch version still took 3.06 s because its shared reads ran one after another. Issuing the independent reads in parallel brought it to 1.39 s, then 1.26 s on the comparison run. The remaining time is mostly the sequential IPCR score reads and the competency-tag chunks.

The batch refactor is in commit `cbb7ca1`. The parallel-loading follow-up and this summary are in the next commit on `perf/succession-batch`.

## Deviations

- Parallel loading inside the batch was added after measuring the serial version. It was not in the original plan.
- Plan step 5 asked for a DevTools check. `/admin/rsp/*` requires a live Supabase auth session, so the check was done at the API layer from the public login page instead, using `PerformanceResourceTiming` for request counts. For output parity, the pre-change module was restored from `HEAD` as a temporary module and run against the same live data; it was deleted afterwards. Same request and parity evidence, but no signed-in click-through.
- `getLatestOverallScores` now overlaps its employee-department read with the MFO and cycle-title reads. This changes fetch order only; scores are unchanged and the 10/10 parity check covers it.
- `loadEligibilityScoring` issues its two reads together. Per-employee records and configured points are unchanged.

## Checks run

- `npx tsc --noEmit`: clean in the main tree and in the clean `perf/succession-batch` worktree.
- `npx vitest run src/lib/api/successionAutoSuccessors.test.ts`: 4/4 passed.
- `npm test`: 197 files, 1,768 tests passed.
- `npm run build`: `tsc` passes, then Vite fails while removing an esbuild temp file (`Access is denied`) on this Windows host. All 3,094 modules transform. This is environmental and reproduces with `TEMP` pointed at the approved temp directory.
- `npm run lint`: cannot run because no ESLint configuration is tracked at the repo root. Pre-existing.
- Live request, time and parity check as above.

## Known issues, not fixed

- The live admin UI route was not clicked through because of the auth gate. The API-level check exercises the same client and database, but a signed-in visual pass is still worth doing before release.
- The batch scores every active employee rather than only the keyword-matched pool. Accepted at 221 employees; it is why a one-position department now reads more rows than before.
- `cbb7ca1` also contains the pre-existing `.env` deletion that was staged before this work. It is unrelated to the succession change and has not been pushed.
- The working tree was on `fix/modal-close-buttons` with unrelated in-progress `PMIPCRManagement.tsx` changes during verification. Those changes were not touched and are not part of this work.
