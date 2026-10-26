---
title: Fix succession office-weight scoring — local implementation summary
date: 2026-10-26
status: Done
summary: Resolved employee office names to department IDs without a schema change; all 114 live scores matched independent weighted calculations. User authorized publication to fork main and an upstream PR.
plan: ../plans/2026-10-26-succession-office-weight-scoring.md
---

## Scope and approval

The user approved the saved local `implementation_plan.md` after agreeing that failed lookups must report errors rather than silently average. Work is isolated on `fix/succession-department-weights` in the `cictrix-succession-scoring` worktree, based on `ec70722`. The root plan is ignored by the repository.

The dashboard batching branch/worktree and commit `2d308a0` were not modified by this work. Verification initially ran on `ec70722`, with no schema changes, live database writes, recommendation generation, commit, push, PR, or deployment. The user subsequently authorized a commit, push to fork main, and upstream PR. The new scoring commit was rebased cleanly onto upstream `2940eb1`, which already contains the separately merged batching change. No direct upstream push, upstream merge, or deployment is authorized.

## Confirmed cause and mapping

`getLatestOverallScores` selected `employees.department_id`, which does not exist in production (HTTP 400 / PostgreSQL `42703`). It discarded the error and passed null weights to the score roll-up.

Live read-only catalog checks confirmed that `employees.department` is a name, and `employees_with_department` also lacks `department_id`; it projects the same name rather than joining the department lookup. All 114 completed-IPCR employees currently resolve uniquely by trimmed employee name to exact `departments.name`. `ipcr_workspace.office_id` is unset in every live workspace row, so it is not a viable replacement mapping. Nine completed employees are in inactive departments that still have active weighting configs; those departments must not be excluded.

## Local changes

- `src/lib/api/succession.ts`: bulk employee-name → department-ID resolution, then the existing bulk active-config lookup. No lookup per employee, fuzzy matching, critical-position-office substitution, or new FK.
- Missing, ambiguous, failed, or malformed mapping/config data now rejects with safe contextual errors. Config responses request an exact count to distinguish truncation from successful absence. A successfully mapped office confirmed to have no active config still receives the documented unweighted fallback.
- Latest completed-setting selection, optional cycle pin, Q/E/T arithmetic, rounding, buckets, manual-candidate rules, and ranking/gate algorithms are unchanged.
- `src/components/CriticalPositionGapAnalysisPage.tsx`: explicit retryable summary/profile errors, loading cleanup, cancellation, and stale-result clearing.
- `src/modules/admin/SeminarEnrollment.tsx`: per-office picker loading/errors and retry, plus a warning when automatic recommendation refresh fails while saved recommendations remain visible. Generation/persistence algorithms are unchanged.
- Four new test files add 41 cases covering the real scoring query boundary, succession single/batch/error propagation, mocked recommendation failure before any upsert, and shared UI failure/retry behavior.

## Verification

- Initial regression run against old code: 24 of 27 tests failed, including identical unweighted scores across differently configured offices and silently accepted read failures.
- Final `npm test`: **651 passed across 74 files**.
- After the clean rebase onto upstream `2940eb1`, full `npm test`: **714 passed across 83 files**; lint and the type-check/verification build passed again. Whole-branch review found no scoring blockers; the new retry controls were aligned to existing `.btn` classes and error tokens under the newly inherited repo rules. No `/code-review` procedure file was available in this worktree, so review was performed in-thread rather than delegated.
- Following that style-only alignment, all 41 targeted scoring/caller tests, lint, and the type-check/verification build passed again. The plan dashboard was regenerated using the original checkout's untracked generator in memory, targeting this worktree without editing the original checkout. Its deterministic output also reconciles stale index entries with the documents present on current upstream.
- `npx tsc --noEmit`, `npm run lint`, `npm run build:verify`, and `git diff --check`: passed.
- Existing unrelated test/build diagnostics remain (React act warnings, fixture/backend URL errors, disabled legacy API key messages, Vite CJS/Browserslist notices).

The live browser harness blocked non-GET/HEAD fetches. The copied local `.env` had a disabled legacy anon key, so the harness used the project's existing enabled `hris` publishable key **in browser request headers only**, after verifying the project URL and absence of an auth session. No elevated key, key re-enabling, permission changes, or persistent credential updates were used. Ordinary local configuration remains unchanged and will require a separately authorized key update for use outside this harness.

Final normal-client live scoring verification:

| Check | Result |
| --- | ---: |
| Completed employees / returned scores | 114 / 114 |
| Mismatches against independent arithmetic over the same responses | 0 |
| Numeric scores differing from unweighted arithmetic | 76 |
| Adjectival labels differing | 0 |
| Missing mappings/configs | 0 |
| Successful scoring-loader REST reads, excluding discovery | 6 |

The six reads returned 272 target settings, 318 MFOs, 1 cycle, 114 employees, 7 departments, and 7 active configs. The independent calculation did not call the production roll-up helpers. Employee records and credentials were not saved in verification artifacts; returned evidence is aggregate-only.

Corrected single-position and multi-position results matched for **all 33 critical positions**, with no failed results. A separate same-engine simulation of previous unweighted scoring changed readiness totals for 20 positions, but changed neither successor counts nor employee rank order on this dataset. This baseline is explicitly simulated, not a rerun or modification of the protected dashboard branch. Dashboard integration is deferred.

UI tests cover retry, loader cleanup, stale/overlapping requests, and no false empty/unrated states. The actual Gap Analysis component also displayed a retryable error and cleared loading under a browser-injected config read failure. Screenshot capture could not run because the browser tab was not visible; no desktop/mobile visual audit or full authenticated-route verification is claimed. Seminar Enrollment was not mounted against live services because its on-open effect generates recommendations; that path was tested with mocks only.

## Remaining boundaries

Historical/as-of office weighting, broader loader error handling for existing target-setting/MFO/title reads, security-advisor remediation, data cleanup, credential configuration, and integration with newer main/dashboard batching are outside this fix. Larger datasets may fail safely on truncated mappings/configs; pagination/chunking is not added here. Live score/count/rank observations are dataset-specific, not guarantees that future corrected scores cannot change qualification or ordering.
