---
title: Fix succession office-weight scoring
date: 2026-10-26
status: Done
summary: Resolve employee office names to department IDs in bulk and report failed lookups rather than silently using unweighted IPCR scores.
---

## Goal

Apply each employee's configured office weights to their latest completed IPCR score without adding a nonexistent employee department column. Keep genuine no-config fallback distinct from failed reads. The user approved the saved local `implementation_plan.md` before implementation; this tracked copy records that approved scope for the PR.

## Approach

In `src/lib/api/succession.ts`, read `employees(id, department)`, trim employee department names, resolve exact `departments.name` matches in bulk, and reuse the bulk active-weight lookup. Both the base employee table and compatibility view lack `department_id`; workspace office IDs are unpopulated. Include inactive departments that retain active configs. Never substitute the critical position's office for the employee's own office.

Reject failed/missing/ambiguous mappings and invalid, duplicate, or incomplete config responses with contextual errors. Retain unweighted averaging only for a successfully mapped office with a successful, complete lookup confirming no active config. Preserve completed-setting selection, cycle pinning, arithmetic, rounding, buckets, and all ranking algorithms.

Add focused retry/error/loading handling in Gap Analysis and the Seminar Enrollment picker, and show a warning when recommendation refresh fails. No UI redesign, schema migration, historical weighting change, permissions change, or live recommendation regeneration.

## Steps

1. Inspect live schema/mapping with read-only queries and trace shared callers; agree on the failure policy one question at a time.
2. Save the plan and obtain approval before editing application code (completed in local `implementation_plan.md`).
3. Add query-boundary regressions, implement bulk resolution and validation, then protect affected shared callers from stuck loading or false unrated states.
4. Verify targeted/full tests, type-check, lint, build, live weighted arithmetic, and single/batch consistency without database writes.
5. Following the user's later publication instruction, rebase the new scoring commit onto latest upstream, rerun verification, push to fork main without force, and open an upstream PR. Do not merge upstream or deploy.

## Risks

- Correct weighting can change scores, rankings, qualification, and counts; old result parity is not a correctness requirement.
- Shared L&D/Gap Analysis callers must report failures, not turn missing scores into successful empty/unrated results. Recommendation persistence is tested only with mocks.
- Exact name mapping intentionally rejects unknown names; broader data cleanup and future pagination are outside scope. Config counts guard against silent truncation.
- Local credentials include a disabled legacy key. Live verification used an existing publishable key only in browser memory; persistent configuration changes remain separate.
- The protected dashboard batching branch/worktree and commit `2d308a0` are not rewritten. Its already-merged change is inherited from upstream during publication, not cherry-picked or modified here.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, full `npm test`, `npm run build:verify`, and `git diff --check`.
- Query-boundary tests for A/B/C weighting, genuine no-config fallback, errors/rejections, missing/ambiguous mappings, invalid/duplicate/truncated configs, cycle pinning, and single/batch consistency.
- Mocked caller tests for retry, cancellation, loading cleanup, concurrent offices, and failure before recommendation persistence.
- GET/HEAD-only live comparison against independent arithmetic; compare all critical positions' single/batch results. Do not mount live write-on-open routes.
- Review the whole branch and DESIGN_IDENTITY.md §16 for changed UI controls. Screenshot/device verification remains limited by the unavailable visible browser tab; do not claim it passed.

## Results

Before rebasing: 651 tests across 74 files passed. After rebasing onto upstream `2940eb1`: 714 tests across 83 files, lint, and the type-check/verification build passed. Live read-only verification matched all 114 scores independently; 76 numeric scores changed versus unweighted arithmetic, with no label changes. All 33 positions matched between corrected single/batch paths. Full evidence and limitations: [session summary](../session-summaries/2026-10-26-succession-scoring-summary.md).
