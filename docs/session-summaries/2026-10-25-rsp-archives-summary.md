# RSP Archives — session summary (2026-10-25)

Plan: `docs/plans/2026-10-25-rsp-archives.md`. Mockup: `docs/mockups/2026-10-25-rsp-archives.html`.

## What shipped vs. planned

Everything in the plan's steps shipped:

- **New module `src/modules/admin/rsp-archives/`.** It has four tabs (Employees, Applicants, Job posts, Evaluation records), one archive-wide search, and a one-line toolbar with Type, Filters (department and date range), Sort and Export (CSV, Print). The table has four columns, numbered pagination, and a detail drawer. Restore (Disqualified applicants) and Permanently Delete (deleted job posts) live in the drawer behind confirmation dialogs.
- **New service `src/lib/api/rspArchives.ts`.** It covers former employees, previous positions from `employee_history`, closed applications, and `restoreApplication`.
- **`RSPDashboard.tsx`.** The five archive cards, their sub-views and the separate Deleted Job Archives card are replaced by `<RspArchives>`. Unused state is removed, and the section subtitle is updated. Temporary Employee Account Generation is no longer in Archives; the same applicants are in Newly Hired.
- **`NotSelectedArchive.tsx`** is deleted. Its test mock now mocks the new module.

## Deviations

- **Restore note.** No column records the status before disqualification. Restore asks staff for the target status, and saves "Restored <date> by <admin>: <reason> | Earlier: <old reason>" in `disqualification_reason`. The applicant doesn't see it once the status is live.
- **Ranking records are read-only.** The drawer lists the ranked applicants instead of opening the hiring ranking modal. That modal closes itself for positions outside the active ranking list.
- **Export is CSV and Print.** There is no PDF option.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 54 files and 493 tests passed before the final cleanup. The admin suite (7 files, 41 tests) passed again after it. `model.test.ts` adds 10 tests.
- `npm run build`: succeeds.
- `npm run lint`: **could not run**. The repo has no ESLint config file, on `origin/main` too.
- **Browser.** The live admin route needs a Supabase sign-in, and the local anon key is disabled. The component was therefore checked in a temporary Vite harness with sample records (since removed):
  - tabs and arrow keys
  - search counts per tab
  - the Type filter, Filters popover and chip
  - the empty state
  - the drawer
  - the Restore dialog's disabled-until-reason behaviour and Esc
  - Purge's type-to-confirm and its callback
  - no horizontal overflow at 375px

  The Supabase reads failed soft with 401 and the page still rendered.
- **Not checked.** A real Restore write, and the employee and applicant data on production.
