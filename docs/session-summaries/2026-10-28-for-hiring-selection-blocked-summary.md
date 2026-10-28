---
title: For Hiring selection unblocked and plantilla resolution hardened — summary
date: 2026-10-28
plan: docs/plans/2026-10-28-for-hiring-selection-blocked.md
---

## What shipped

All plan steps shipped on `fix/for-hiring-selection-blocked`:

- **UUID sanitization & query protection**:
  - `src/lib/hiringFlow.ts`: Exported `isUuid` regex validator and filtered `applicantIds` to valid UUIDs before querying Supabase `applicants` and `application_plantilla_slots`. Updated `HiringContext` return type to `{ ok: boolean, slotByApplicant, revokedAt, error?: unknown }`.
  - `src/lib/plantillaSlots.ts`: Updated `fetchApplicantSlotLinksChecked` and `fetchSlotsByJobPostingChecked` to filter IDs using `isUuid` before constructing queries, preventing Postgres `22P02: invalid input syntax for type uuid` crashes from mock applicant IDs (e.g. `test-app-001`).
- **UI Error & Blocked State Handling**:
  - `src/components/ForHiringPage.tsx`: Inspected `context.ok` from `fetchHiringContext`. On lookup failures, triggers `ErrorBanner` with retry button instead of failing silently.
  - Distinguishes missing links from closed plantillas: when `row.slot.status === 'closed'`, radio button is disabled with tooltip `"This plantilla is closed. Reopen the vacancy from Job Vacancies to select this applicant."`.
  - Hardened `handleSelectClick`, `canConfirm`, and `handleConfirmSelect` so closed plantillas cannot be selected or confirmed.
- **Database Migration**:
  - `supabase/migrations/20261028045455_for_hiring_vacancy_backfill.sql`: Idempotently backfills missing `job_vacancies` records for `Open` job postings and reopens associated `closed` plantillas (leaving filled and reserved plantillas intact).
  - `supabase/rollbacks/20261028045455_for_hiring_vacancy_backfill_rollback.sql`: Matching rollback script.
- **Automated Tests**:
  - `src/lib/hiringFlow.context.test.ts`: 7 unit tests verifying UUID filtering, graceful query failure handling, and result contract.
  - `src/components/ForHiringPage.context.test.tsx`: 3 component tests verifying closed plantilla disabled states, open plantilla selection, and lookup error banner display.
  - `src/lib/plantillaSlots.reads.test.ts`: Updated to verify UUID filtering during slot queries.

## Deviations from the plan

- None. Both subagent lanes (Service & Migration, UI & Component) completed without architectural divergence.

## Checks run

- `npx tsc --noEmit`: exit 0 (clean).
- `npm run lint`: exit 0 (0 errors, 0 warnings).
- `npm test -- src/components/ForHiringPage src/lib/hiringFlow src/lib/plantillaSlots`: 17 test files passed, 34 tests passed.
- `npm run build:verify`: exit 0 (`dist/` production bundle rendered cleanly in 1m 11s).
- `npm run check:migrations`: exit 0 (126 migration files OK, unique versions validated).
- Live PostgREST smoke test: verified query execution with mixed mock and UUID applicant IDs against Supabase.
