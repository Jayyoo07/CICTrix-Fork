---
title: Verify the promotional hiring pipeline
date: 2026-10-30
status: Done
summary: Read-only audit of promotion applications, evaluation, selection, appointment, and employee updates. Approved in chat; no application code or live records will be changed.
---

## Goal

Determine which stages of the promotion hiring pipeline are verified, broken, or untested, with evidence from code, deployed schema, existing tests, and accessible UI.

## Approach

Trace the applicant/RSP hiring flow and distinguish it from the PM promotional-application module. Inspect service calls, database functions, access policies, and deployed objects. Run existing checks without submitting applications or making decisions.

## Steps

- [x] Trace internal application through screening, evaluation, selection, appointment, and employee-record update.
- [x] Compare deployed schema, functions, and permissions with application expectations; review logs/advisories.
- [x] Run TypeScript and existing tests. UI inspection was intentionally not performed: app startup invokes live database backfills, which conflicts with the read-only scope.
- [x] Record evidence, blockers, and verification limits in [the session summary](../session-summaries/2026-10-30-promotional-hiring-audit-summary.md).

## Risks

- Read-only inspection cannot prove write operations end to end; mark these as untested where appropriate.
- Distinct PM and RSP promotion flows may look connected without sharing data.
- Existing local work must remain untouched, including untracked run-queue.bat.
- No delegation, code fixes, commits, pushes, deployments, or live database writes are included.

## Checks to run

- `npx tsc --noEmit`
- Existing relevant Vitest tests (and full suite if practical).
- Read-only Supabase metadata, aggregate queries, logs, and advisors.
- Browser inspection if an accessible app/session is available.
