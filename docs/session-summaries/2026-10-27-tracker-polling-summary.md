---
title: Applicant tracker fallback polling - session summary
date: 2026-10-27
status: Blocked
summary: Implement the approved 15-second visible tracker fallback and scoped refreshes; leave interviewer polling unchanged because realtime and server-side revocation gates fail.
plan: 2026-10-26-performance-followups.md
---

# Applicant tracker fallback polling

Plan: [performance follow-ups](../plans/2026-10-26-performance-followups.md), step 4 and read-only step 5 preflight. Steps 1–3 were already complete per the user and were not changed.

## Implemented versus planned

- A named 15-second tracker fallback runs only while visible. Return, focus, browser reconnect and realtime resubscription feed one coalescing coordinator. Polls do not overlap slow reads, and events during a read queue one follow-up.
- Realtime applicant updates and identity-filtered attachment events remain the primary path. Collapsed applications' document notices now refresh from the same attachment snapshot as the open application's documents.
- One paginated attachment read supplies documents and action-required flags. Stable timestamp/id ordering and exact counts handle a lower server row cap; a failed page is not treated as an empty successful result.
- Slot outcomes refresh even when record status/timestamps do not change. Checked slot/link service reads retain previous outcomes on failure, while existing non-tracker callers keep their legacy empty-map fallback.
- New searches dispose previous work; search, row and upload-attempt generations guard stale results and A → B → A races. Post-upload invalidation queues a fresh read rather than accepting an in-flight pre-write result. Initial automatic lookup still works under StrictMode effect replay.
- No markup, styles, tokens, routes, database objects or interviewer access behavior changed.

## Decisions and deviations

The user approved the tracker interval and a conditional 30-second interviewer fallback through a four-question grilling session. Interviewer checks must continue when hidden and run on return/focus/reconnect, but browser throttling prevents a hard hidden-tab latency guarantee.

Step 5 remains blocked and unimplemented. Read-only catalog checks show `raters` is absent from `supabase_realtime`; `evaluations` has RLS disabled with authenticated INSERT/UPDATE grants. `raters` also has unconditional public write policies. The proposed slower interval cannot meet the agreed realtime/server-authorization gates. `src/App.tsx` retains its three-second check. Fixing these security/publication issues is separate work, not authorization for a migration here. [Supabase RLS advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

The earlier 60 reads/minute estimate covers only the old record/open-document timers. Current multi-application code also queried attachment notices per poll. No old live baseline was measured in this run. Fake-clock tests verify four new refreshes/minute: eight record/document reads plus eight slot/link reads, 16 total for single-page results. Larger attachment histories require extra pages. Realtime/catch-up adds reads; hidden timer-driven reads are zero.

## Verification

- Targeted coordinator, lookup, checked slot-read and component tests pass, including pagination below the requested cap, failed versus empty reads, deferred searches/refreshes, row-switch and upload races, post-write freshness, collapsed-row updates and StrictMode.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass, zero warnings.
- `npm run build:verify`: pass; existing Vite CJS/Browserslist notices remain.
- Full branch-only Vitest suite: 734 tests / 85 files pass. The earlier run also passed 1,594 tests / 179 files but included older `.claude/worktrees/` checkouts; it is not the branch's test count. Existing fixture/React act warnings remain.
- One independent `openai/gpt-6.1-sol#high` reviewer found three issues (slot failures, pagination, upload ABA race). All were addressed; follow-up review found no remaining actionable issues and independently reran 26 targeted tests successfully.
- Live browser before/after captures and realtime delivery could not be completed: the configured client returned HTTP 401 for the reference resolver and tracker view. Existing live-reading tests independently logged the server error `Legacy API keys are disabled`. Normal local access needs a current publishable key, not re-enabling disabled legacy keys. No credentials were changed and no sign-in was bypassed. The temporary read-only harness was removed; there were no live writes. Do not treat mocked budgets as measured production speedups.
- DESIGN_IDENTITY §16 reviewed for scope: no rendered markup, color/type/spacing, controls, badges or breakpoints changed. Visual/responsive live checks were not certified.
- Existing nested checkouts live under both `.worktrees/` and `.claude/worktrees/`; the branch-only full-suite command is `npm test -- --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`. No worktree or test configuration was changed.

## Remaining acceptance

Restore normal configured client access, then verify live tracker status changes, document review and re-upload, silent slot changes, realtime-disconnected fallback, hidden return and reconnect. Capture comparable before/after REST totals, elapsed time and response bytes on the same lookup. Do not mark the overall plan Done or lengthen interviewer polling until its separate gates pass.
