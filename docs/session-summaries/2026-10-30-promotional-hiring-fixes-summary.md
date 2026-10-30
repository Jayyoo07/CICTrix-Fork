---
title: Promotional hiring implementation progress
date: 2026-10-30
summary: Tasks 1–3 and 3A are committed and verified with mocked tests, TypeScript and lint. Scheduled promotional interviews now show for interviewers. Tasks 4–8 (appointment pipeline and isolated browser/database acceptance) are not started; Task 4 is blocked on an isolated database.
---

## Scope and current state

Implementation follows [the approved plan](../plans/2026-10-30-promotional-hiring-fixes.md), including scheduled promotional interviewer visibility. Remediation, live writes, emails, pushes and deployments remain excluded.

Paused after completing and reviewing Task 3 and running unit tests across Tasks 1–3, as requested. Task 3A was completed later the same day (see below). **Resume at Task 4**, which is blocked until an isolated database is available. Tasks 4–8 are unstarted; fork push and upstream PR remain subject to separate authorization. This is a partial repair, not completion of the promotional appointment pipeline.

Worktree: `C:\Users\ajcbu\.local\share\opencode\worktree\6c6304\promotional-hiring-fixes-build`, branch `fix/promotional-hiring-pipeline`. Existing audit/plan documents were copied into this worktree without deleting the originals. The original checkout and `run-queue.bat` remain untouched.

Models/connections: `openai/gpt-6.1-sol#high` for coordination and review through existing OpenAI OAuth; `deepseek/deepseek-flash#max` (catalog identity DeepSeek V4.1 Flash 1017) for implementation/tests through the existing paid key connection. Accepted product commits: Task 1 `1dda88f`, Task 2 `c29adba`, Task 3 `20c24f1`. Each task had one successful review correction and zero unsuccessful corrective attempts. No builders remain active.

Task 1 resolves promotion entry from current remote username/employee-number credentials, independent of browser cache. Explicit soft-delete filtering, literal underscore matching, wildcard rejection and a missing-employee-number guard were added in a successful corrective round. Parent independently verified 22/22 targeted tests, TypeScript and zero-warning scoped ESLint, then included these tests in the final full src run. Existing post-auth profile-read error handling is unchanged and remains a review note. No account credentials were changed.

Task 2 makes category saving awaited and publishes browser cache/events after remote success, with UUID-keyed durable summary reads and explicit error states. Parent review caught the omitted `oral_exam` projection; a successful correction added the column, projection-aware original-total regressions, and deferred-upsert tests proving no pending/rejected save publication. Parent independently verified 52/52 targeted/existing tests, TypeScript, and zero-warning scoped ESLint, then included these tests in the final full src run. The 130-point rollup and separate written-exam conversion are unchanged.

Task 3 restores same-email promotion visibility and saved summary totals, removes read-side applicant upserts, and shows summary-read errors. Review caught browser-only evaluations overriding original-applicant ranking; the accepted correction limits real UUID originals to persisted evaluations with durable-summary fallback. Coverage includes account-only matching, remote terminal/deleted rows over stale local candidates, filled slots, reservations and revoked selections. The builder's corrected targeted run passed 29 tests; parent independently verified the corrected revision in the final full src suite. Promotion ranking uses the saved five-category assessment total, retains the separate written exam requirement and does not invent oral scores. The score header now reads “Assessment / Interview Score”; layout and tokens are unchanged.

Read-only boolean schedule inspection found a cause for Task 3A: the scheduled promotion has a valid date/time, active assigned rater and Open posting/slot, but both interviewer screens' `@example.com` demo-email heuristic excludes it. The plan now requires a synthetic persisted-UUID regression for that exclusion before changing the display logic. No live email, schedule or assignment was changed.

## Task 3A: scheduled promotional interviews (resumed 2026-10-30)

Shipped as `180c831` on `fix/interviewer-scheduled-promotions`, stacked on `fix/applicant-status-score-writes`. Not pushed. It was built inline in a Claude Code cloud session rather than through the approved OpenAI/DeepSeek route, which isn't available there. The plan records this as a deviation.

Planned vs. shipped: the plan allowed changes to schedule, assignment, posting and evaluation code "as evidence requires". The evidence pointed only at the `@example.com` demo filter in `InterviewerDashboard.tsx` and `InterviewerApplicantsList.tsx`, and that is the only product change. `EvaluationForm.tsx` already read the persisted application type, so it got a regression test but no edit. Closed-posting reachability, realtime and rescheduling, assignment changes, same-title postings across offices, read-failure reporting and the submit round trip were not covered. The plan lists them as follow-ups. The submit round trip moves to Step 3 of `2026-10-30-applicant-status-and-score-writes.md`, which now owns `EvaluationForm.tsx`.

Checks: the new tests fail without the fix and pass with it. Results: `npx vitest run src/lib/applicantSchedule.scheduled.test.ts src/modules/interviewer` gives 8 files / 54 tests passed; `npx tsc --noEmit` and `npm run lint` pass. The full `npm test` run gives 1,266 of 1,268 tests passed. The 2 failures are pre-existing: the live-data seed test and `trainingProgress.test.ts`, which also fails on the base commit when the clock is in UTC. Live data was read with the publishable key using GET only; nothing was written.

## Checks observed before implementation

- `npm ci --ignore-scripts --no-audit --no-fund`: passed, installed 431 existing lockfile packages.
- `npx tsc --noEmit`: passed.
- `npx vitest run src --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` with synthetic localhost Supabase settings: **131 files and 1,178 tests passed**. Existing React act warnings and refused-localhost lookup warnings remain. No production `.env` was copied.
- The audit/approved plan context was committed as `22c42f2` (`docs(promotion): record approved hiring repair plan and audit`). No push occurred.

## Final checkpoint verification

Run on the corrected Tasks 1–3 code, with `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=local-test-placeholder` for Supabase-importing checks:

- Before the upstream merge: **136 files / 1,239 tests passed** in 109.20s. After merging `upstream/main` to clear the PR conflict (merge `7b115ef`): **139 files / 1,248 tests passed** in 99.73s, including the new smoke suite. Existing React act/refused-localhost warnings remain.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed repository-wide with zero warnings/errors.
- `npm run build`: passed; Vite transformed 3,145 modules. CJS API deprecation, outdated Browserslist data and large-chunk warnings remain; no failure.
- `git diff --check`: passed; Windows line-ending normalization notices only.

No production `.env` was copied. Live-data seed/script tests, backend/database tests, isolated browser end-to-end acceptance and mobile/tablet/desktop visual checks were not run. `DESIGN_IDENTITY.md` §16 was reviewed against the changed UI: existing layout/shared error/modal primitives and tokens were retained; rendered contrast, keyboard focus and cross-width behavior are not independently verified, so the full UI checklist is not claimed complete. No migrations were created or applied.

## Remaining work and limits

Cached Supabase CLI 2.122.0 is available, but `supabase status` reports Docker and Podman missing, and no local PostgreSQL installation was found. Task 4's transaction/rollback/concurrency verification and Task 8's database-backed acceptance need an isolated local/preview runtime. No remote writes or environment installation have been authorized to bypass that gate.

The atomic appointment transaction, shared hire entry points, account-preserving completion results, legacy-sync guard and end-to-end acceptance (Tasks 4–8) remain for a later session. Existing security findings remain outside scope. The DataTable snapshot's baseline line-ending-only status was left untouched and is not part of the task commits.

## Checkpoint smoke/sanity evidence

A fresh `deepseek/deepseek-flash#max` builder authored and ran the user-requested smoke/sanity checks, committed as `e483c55`. The parent reviewed the harness and independently reran them.

- `src/test/promotionEntry.smoke.test.tsx`: 3/3 passed. Empty-storage promotion login by username and employee number prefills the real wizard; a wrong password is rejected.
- `src/test/promotionPipeline.smoke.test.tsx`: 2/2 passed. The real scoring modal and real Task 2 save/summary services persist a complete promotional assessment; after a simulated hard reload, the real For Hiring and Applicant Ranking pages show the saved 80.00 total and 90/100 written exam, not stale `total_score`. A rejected save publishes no cache/event/row, keeps the modal editable with an error, and leaves only an existing reservation visible.
- Combined rerun: 2 files / 5 tests passed. TypeScript and scoped ESLint passed.
- Built-artifact preview: `npm run preview` served the index (200, root and module script present) and main JS asset (200, 3,333,754 bytes); the listener was stopped. Parent reproduced the check independently.

This is mocked jsdom evidence, not browser or database acceptance. The fake Supabase bypasses PostgREST projection and RLS; layout, focus, responsive behavior, print, real storage partitioning, migrations and concurrency remain unverified. Task 3A and Tasks 4–8 still require their own implementation and Task 8's isolated browser/database gate. Never run the legacy startup against production to satisfy this check.

The detailed task states, child session IDs, correction counters and review evidence remain in this plan's ignored `.superpowers/sdd/2026-10-30-promotional-hiring-fixes/progress.md`. The branch/worktree is preserved. It was pushed to the `Jayyoo07` fork and [PR #83](https://github.com/dehandenver/CICTrix/pull/83) is open against `dehandenver/CICTrix:main`; no merge, deployment, live database write or email was performed. Vercel reports the expected fork authorization failure.
