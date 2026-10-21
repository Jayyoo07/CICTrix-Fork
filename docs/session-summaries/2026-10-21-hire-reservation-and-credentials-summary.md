---
title: Unlimited applicants, one hire per plantilla, reserve-then-hire flow — summary
date: 2026-10-21
plan: docs/plans/2026-10-21-hire-reservation-and-credentials.md
---

## What shipped

- **Unlimited applicants.** The per-browser `cictrix_applied_plantilla` flag no longer marks a plantilla closed for the next person on the same device. The duplicate rule stays in the database (`uq_applicants_one_per_plantilla`, by email and plantilla).
- **Migration `20261021200100_hire_reservation_and_archive.sql`** (+ rollback). It adds a reservation on `plantilla_slots`, signing fields and `archived_at` on `applicants`, the `reserve_plantilla_slot` and `revoke_plantilla_reservation` functions, and three triggers. The first clears the reservation on fill. The second archives the other applicants on a filled plantilla as Not Selected. The third rejects a new application to a filled or closed plantilla. It also appends four columns to the tracker view.
- **Status `For Contract Signing`** with its message, transitions, funnel bucket, the forfeit sentence and the regret-letter builder (`applicantStatus.ts`).
- **For Hiring.** It has one folder per plantilla and a single select. The Select for Hiring button opens the other-applications notice, then the confirmation with the date, instructions and the required acknowledgement. A reserved banner blocks other selections. The hire, credentials and print code moved out to `src/lib/hiringFlow.ts`.
- **Generate Employee Credentials tab** (`/admin/rsp/credentials`). Layout B: grouped by department and position, with selection kept across departments and a running total. It has Did not report (revoke), Generate with a confirmation, and the credentials modal with a cut-out card printout (option A).
- **Tracker.** It shows the congratulation with the report-by date, the instructions and the forfeit warning. Archived applicants see the regret letter.
- **Landing.** A filled plantilla keeps its struck-through row with a disabled Filled button until the posting closes.
- **RSP Archives.** New Not Selected Applicants card and list.

## Deviations from the plan

- The CLI stamped the migration `20261021145909` (UTC), which sorts before `20261021200000`, the migration it depends on. It was renumbered by hand to `20261021200100`, the same fix used in 10cb1f8.
- The application-to-filled-plantilla guard trigger (acceptance test 6) was added on top of the plan.
- The date formatter lives in `scheduleSelection.ts`, so the public tracker doesn't bundle the hiring service.
- `main` was merged into the branch first. Its plantilla-picker removal conflicted with this branch's; main's version was kept.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 43 files, 394 tests pass. Run with placeholder `VITE_SUPABASE_*`, because the merge removed the tracked `.env` from this checkout.
- `npm run build`: builds. Only the existing chunk-size warning.
- `npm run check:migrations`: OK.
- The migration was run twice on PGlite against stub tables, together with the existing fill and withdraw triggers. Acceptance tests 1–7 pass as SQL (20 checks), and the rollback runs without error.
- `npm run lint`: not run. The repo has no ESLint config.
- Not verified in a browser: the For Hiring dialogs, the tracker notices, and phone/tablet widths. That needs an RSP sign-in and the migration applied.
