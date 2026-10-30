---
title: Promotional hiring implementation progress
date: 2026-10-30
summary: Tasks 1–3 are committed and verified with 1,239 passing src tests, TypeScript, repository-wide lint and build. Paused by user before Task 3A; the remaining appointment pipeline and isolated database/browser acceptance are not complete.
---

## Scope and current state

Implementation follows [the approved plan](../plans/2026-10-30-promotional-hiring-fixes.md), including scheduled promotional interviewer visibility. Remediation, live writes, emails, pushes and deployments remain excluded.

Paused after completing and reviewing Task 3 and running unit tests across Tasks 1–3, as requested. **Resume at Task 3A.** Task 3A and Tasks 4–8 are unstarted; fork push and upstream PR remain subject to separate authorization. This is a partial repair, not completion of the promotional appointment pipeline.

Worktree: `C:\Users\ajcbu\.local\share\opencode\worktree\6c6304\promotional-hiring-fixes-build`, branch `fix/promotional-hiring-pipeline`. Existing audit/plan documents were copied into this worktree without deleting the originals. The original checkout and `run-queue.bat` remain untouched.

Models/connections: `openai/gpt-6.1-sol#high` for coordination and review through existing OpenAI OAuth; `deepseek/deepseek-flash#max` (catalog identity DeepSeek V4.1 Flash 1017) for implementation/tests through the existing paid key connection. Accepted product commits: Task 1 `1dda88f`, Task 2 `c29adba`, Task 3 `20c24f1`. Each task had one successful review correction and zero unsuccessful corrective attempts. No builders remain active.

Task 1 resolves promotion entry from current remote username/employee-number credentials, independent of browser cache. Explicit soft-delete filtering, literal underscore matching, wildcard rejection and a missing-employee-number guard were added in a successful corrective round. Parent independently verified 22/22 targeted tests, TypeScript and zero-warning scoped ESLint, then included these tests in the final full src run. Existing post-auth profile-read error handling is unchanged and remains a review note. No account credentials were changed.

Task 2 makes category saving awaited and publishes browser cache/events after remote success, with UUID-keyed durable summary reads and explicit error states. Parent review caught the omitted `oral_exam` projection; a successful correction added the column, projection-aware original-total regressions, and deferred-upsert tests proving no pending/rejected save publication. Parent independently verified 52/52 targeted/existing tests, TypeScript, and zero-warning scoped ESLint, then included these tests in the final full src run. The 130-point rollup and separate written-exam conversion are unchanged.

Task 3 restores same-email promotion visibility and saved summary totals, removes read-side applicant upserts, and shows summary-read errors. Review caught browser-only evaluations overriding original-applicant ranking; the accepted correction limits real UUID originals to persisted evaluations with durable-summary fallback. Coverage includes account-only matching, remote terminal/deleted rows over stale local candidates, filled slots, reservations and revoked selections. The builder's corrected targeted run passed 29 tests; parent independently verified the corrected revision in the final full src suite. Promotion ranking uses the saved five-category assessment total, retains the separate written exam requirement and does not invent oral scores. The score header now reads “Assessment / Interview Score”; layout and tokens are unchanged.

Read-only boolean schedule inspection found a cause for Task 3A: the scheduled promotion has a valid date/time, active assigned rater and Open posting/slot, but both interviewer screens' `@example.com` demo-email heuristic excludes it. The plan now requires a synthetic persisted-UUID regression for that exclusion before changing the display logic. No live email, schedule or assignment was changed.

## Checks observed before implementation

- `npm ci --ignore-scripts --no-audit --no-fund`: passed, installed 431 existing lockfile packages.
- `npx tsc --noEmit`: passed.
- `npx vitest run src --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` with synthetic localhost Supabase settings: **131 files and 1,178 tests passed**. Existing React act warnings and refused-localhost lookup warnings remain. No production `.env` was copied.
- The audit/approved plan context was committed as `22c42f2` (`docs(promotion): record approved hiring repair plan and audit`). No push occurred.

## Final checkpoint verification

Run on the corrected Tasks 1–3 code, with `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=local-test-placeholder` for Supabase-importing checks:

- `npx vitest run src --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`: **136 files / 1,239 tests passed**, 109.20s. This includes all changed unit tests. Existing React act/refused-localhost warnings remain.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed repository-wide with zero warnings/errors.
- `npm run build`: passed; Vite transformed 3,145 modules. CJS API deprecation, outdated Browserslist data and large-chunk warnings remain; no failure.
- `git diff --check`: passed; Windows line-ending normalization notices only.

No production `.env` was copied. Live-data seed/script tests, backend/database tests, isolated browser end-to-end acceptance and mobile/tablet/desktop visual checks were not run. `DESIGN_IDENTITY.md` §16 was reviewed against the changed UI: existing layout/shared error/modal primitives and tokens were retained; rendered contrast, keyboard focus and cross-width behavior are not independently verified, so the full UI checklist is not claimed complete. No migrations were created or applied.

## Remaining work and limits

Cached Supabase CLI 2.122.0 is available, but `supabase status` reports Docker and Podman missing, and no local PostgreSQL installation was found. Task 4's transaction/rollback/concurrency verification and Task 8's database-backed acceptance need an isolated local/preview runtime. No remote writes or environment installation have been authorized to bypass that gate.

The scheduled-interview fix (Task 3A), atomic appointment transaction, shared hire entry points, account-preserving completion results, legacy-sync guard and end-to-end acceptance (Tasks 4–8) remain for a later session. Existing security findings remain outside scope. The DataTable snapshot's baseline line-ending-only status was left untouched and is not part of the task commits.

Before merging the partial Tasks 1–3 repair, a focused browser smoke/sanity pass is recommended: fresh-browser promotion entry; successful score save/reload and rejected-save feedback; same-email promotion visibility, reservation preservation and saved ranking totals. Run only against an isolated database or fully mocked browser harness, never production startup. That pass is outstanding, not implied by the unit/build results.

The detailed task states, child session IDs, correction counters and review evidence remain in this plan's ignored `.superpowers/sdd/2026-10-30-promotional-hiring-fixes/progress.md`. The branch/worktree is preserved. No push, PR, merge, deployment, live database write or email was performed.
