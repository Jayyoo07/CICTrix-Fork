---
title: Job Posts — two tabs, Open/Closed status, manual and automatic vacancy closing (summary)
date: 2026-10-22
plan: docs/plans/2026-10-22-vacancy-open-close.md
---

## What shipped

- **Migration `20261022131331_vacancy_open_close`** (+ rollback): `job_vacancies` history table with one active row per position; `open_vacancy`, `close_vacancy` (RSP only), `close_expired_vacancies` (pg_cron every 5 minutes); a trigger that pins a posting's status and deadline to its active vacancy so stale client upserts can't reopen or move it; a trigger that records a vacancy for postings inserted as Open; the application insert trigger now also rejects a closed or past-deadline vacancy; backfill of every Open posting.
- **`src/lib/vacancies.ts`**: service calls for open, close and active vacancies. **`src/lib/vacancySearch.ts`**: Open/Closed derived from status and the Manila date; search by title or plantilla number.
- **Job Posts page**: two tabs, new subtitle, status filter All/Open/Closed, Open/Closed badges on positions and plantilla rows, delete blocked while Open, open/close through the database.
- **Job Vacancies tab**: open vacancies only; Plantilla(s), Date Opened, Applicants columns; office filter; Details / Applicants / Close Vacancy actions; new empty state. Open dialog adds Date Opened and Remarks, lists open positions as "Already open", and links to Create Job Position when nothing matches.
- **Close Vacancy dialog** (new), on the Job Vacancies rows and the position's Details page.
- **Removed**: Filled Positions tab and panel, the `Filled` posting status, Edit Deadline and Reopen.
- `.btn-destructive` and `.btn-destructive-outline` classes (§9.1) in `abyan-tokens.css`.

## Deviations from the plan

- D4: open/close are **RSP only**, not RSP or ADMIN. `create-admin-accounts.mjs` describes ADMIN as the read-only Super Admin.
- `listVacancyHistory` was not built; nothing in the UI reads history yet. The data is recorded.
- Job Vacancies drops the Monthly Salary column, following the brief's column list.
- The Details page (`JobDetailsPage.tsx`) still shows filled plantilla counts and hire names in its admin plantilla list. It records hires and was left alone.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm test` (with placeholder `VITE_SUPABASE_*`, since this worktree has no `.env`): 44 files, 408 tests pass.
- `npm run build`: passes.
- `npm run check:migrations`: OK (110 files).
- Migration in PGlite against stub tables: 31 scenarios pass (backfill, role checks, open, double open, stale upserts, applications before/after close and past deadline, admin re-save of existing applicants, manual close with reason, reopen, cron sweep, unique active index). Rollback applies cleanly. pg_cron itself was not exercised.
- `npm run lint`: could not run; the repo has no ESLint config file.
- Browser check: not done. The RSP route needs a real Supabase Auth session.
