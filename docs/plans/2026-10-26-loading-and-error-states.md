---
title: Loading states and error handling across the system
date: 2026-10-26
status: In Progress
summary: Audit every fetch/action site, extend the shared loading/error building blocks, and fix every site module by module so failures say what went wrong, whether it completed, and what to do next.
---

## Goal

Users always see that the system is working, and every failed action is explained in plain language with a next step.

## Approach

- Audit in `docs/ux-feedback-audit.md` (location, loading state, error state, surfaced/logged/swallowed).
- Extend existing pieces: `src/lib/friendlyErrors.ts` maps network/timeout, 400 (field-level), 401/403 (path to log in), 404, 409, 5xx into a three-part message (what went wrong, whether it completed, what to do). Add a toast, `<LoadError onRetry>`, and a `useAsyncAction` hook that disables the button and shows a spinner. Reuse `table-loading`, `ErrorBanner`, `EmptyState`, `ErrorBoundary`; add module-level boundaries.
- Fix every site, committed module by module: RSP, PM, L&D, Dept Head, Employee, Interviewer, Applicant. Lint, type-check and tests pass before each module commit. A site that can't be fixed safely stays as a tracked audit row with the reason.
- Fix every empty catch; intentional localStorage-parse ignores get a comment.

## Steps

1. Audit (Explore inventory, verified) → `docs/ux-feedback-audit.md`.
2. Shared building blocks + tests.
3. Apply per module, one commit each, with at least one failing-request test per module.

## Risks

- Very large diff across big files (RSPDashboard.tsx is ~6.8k lines); keep each change local to the call site.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test` before each module commit.
