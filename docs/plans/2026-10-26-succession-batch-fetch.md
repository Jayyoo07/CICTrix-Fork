---
title: Batch succession candidate loading per department
date: 2026-10-26
status: Done
summary: Load the shared succession inputs once per department and evaluate every critical position in memory, replacing the per-position query fan-out.
---

## Goal

Expanding a department in Succession Planning should issue roughly 15 REST requests regardless of how many critical positions it holds, instead of about 14 per position. Candidate output must be unchanged.

## Approach

`listAutoSuccessors` in `src/lib/api/succession.ts` fetches the same SRP ranks, active employees, eligibility records, IPCR scores, training history, training competency tags, and configuration for every position. The page calls it once per position, so ten positions produce roughly 140 requests.

Split the function into a context loader and a per-position evaluator:

- `loadAutoSuccessorContext(positionIds)` loads the shared data once, including manual candidates and any employees outside the active pool.
- `evaluateAutoSuccessors(position, ctx)` contains the existing Stage 1 and Stage 2 logic, reading from the context instead of fetching.
- `listAutoSuccessorsForPositions(ids)` fetches the critical-position rows, loads the context once, and returns a map of results keyed by position id.
- `listAutoSuccessors(id)` becomes a wrapper over the batch function, so there is one code path.

`src/components/SuccessionPlanningPage.tsx` replaces the `positions.map(async …)` fan-out with one batch call and one `setCandByPos` update.

## Steps

1. Extract the evaluator and add the context and batch functions in `succession.ts`.
2. Keep `listAutoSuccessors` as a single-position wrapper.
3. Update `SuccessionPlanningPage.tsx` to call the batch function once per department expansion.
4. Add evaluator tests covering a gate failure, a qualified candidate, a downward move, and a manual candidate.
5. Verify request count in DevTools and compare one department's candidate output before and after.

## Risks

- Behaviour drift during extraction. Mitigated by keeping the wrapper on the same evaluator and adding fixture tests for the four paths.
- Wider score and training fetch: the batch computes them for all active employees rather than only the keyword-matched pool. At 221 employees this is a few hundred rows and under 100KB.
- Manual candidates outside the active pool must be included explicitly, or their scores silently drop.
- URL length on large `.in()` lists. Training competency tags are chunked; the other lists are already sent at this size elsewhere.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run dev`, expand one department with DevTools Network open: expect about 15 REST requests instead of about 140 for ten positions, and the same candidates as before.

## Results

- Live check against the largest department (Office of The City Health Officer, 10 critical positions), 2026-10-26:
  - Before: 140 REST requests, 5.68 s, from ten parallel single-position calls.
  - After: 14 REST requests, 1.26 s.
  - Candidate output: 10 of 10 positions deep-equal to the old implementation.
- The first batch version took 3.06 s because its shared reads still ran serially. Overlapping the independent reads brought it to 1.39 s, then 1.26 s on the comparison run.
- `npx tsc --noEmit` passes and the full Vitest suite passes. `npm run lint` cannot run because the repo has no ESLint config (pre-existing).
