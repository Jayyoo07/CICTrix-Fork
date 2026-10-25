---
title: RSP Archives — quiet tabs with employee history
date: 2026-10-25
status: Done
summary: Replace the RSP Archives card list with one tabbed archive (Employees, Applicants, Job posts, Evaluation records), a single search, one-line toolbar, four-column table and a detail drawer that holds Restore and Permanently Delete.
spec: docs/mockups/2026-10-25-rsp-archives.html
---

## Goal

RSP → Archives shows everything that has ended, in one place, without the wall of controls:

- **Employees.** Former employees (Resigned, Terminated, Separated) and previous positions (the post someone held before a promotion or transfer).
- **Applicants.** Disqualified (shown as soon as they are disqualified), Not Selected, and Withdrawn – Hired Elsewhere.
- **Job posts.** Deleted posts whose applicants were kept. (Revised 2026-10-25: closed posts were dropped; they stay on Job Posts.)
- **Evaluation records.** Ranking reports and assessment forms per position.

Mockup: `docs/mockups/2026-10-25-rsp-archives.html` (layout B, quiet tabs; the "Outcome" column is named "Status"). It supersedes the five archive cards, the separate Deleted Job Archives card and the Not Selected list on that page.

**Revision 2 (2026-10-25), mockup `docs/mockups/2026-10-25-rsp-archives-position-rows.html`.** Every tab becomes a flat table with one row per department + position: Department, Position, a count of people or posts, the statuses present, and the latest date. Sorting is Department A–Z by default. Clicking a row opens a centered 880px list modal (§9.10) instead of the side drawer. The modal lists the people or posts under that position, with Restore or Permanently Delete on the row it applies to. Evaluation records have one row per position: Ranking and Assessment forms are merged, the modal shows the ranking, and its primary button opens the assessment forms. Tab counts count position rows.

## Approach

**New module `src/modules/admin/rsp-archives/`** (index.ts, README.md, `_internal/`).

- `_internal/model.ts`: pure types and helpers. Archive groups and their status types, search matching, filtering (type, department, date range), sorting, and CSV building. Covered by Vitest.
- `_internal/RspArchives.tsx`: the page. Header with title and archive-wide search, four tabs (§9.2, arrow keys, counts that follow the search), the one-line toolbar (Type select, Filters popover for department and date range, Sort, Export), removable chips for active filters, the §9.5 table (person or position, last position, Status, Date) and §9.6 pagination.
- `_internal/ArchiveDrawer.tsx`: the right-side detail panel. Row click or Enter opens it. It holds the record facts, the date and who archived it, and the one action that applies.
- `_internal/RestoreDialog.tsx` / `PurgeDialog.tsx`: §9.10 confirmations.

**Service layer `src/lib/api/rspArchives.ts`** (CLAUDE.md: Supabase calls live in `src/lib/`).

- `fetchFormerEmployees()`: reads `employees_with_department` where status is Resigned, Terminated or Separated.
- `fetchPreviousPositions()`: reads `employee_history` rows with action promoted or transferred, joined to the employee's name. `employee_history` has no migration in the repo, so the call fails soft and returns an empty list if the table is missing.
- `fetchClosedApplications()`: reads applicants whose normalised status is Disqualified, Not Selected or Withdrawn - Hired Elsewhere, plus rows with `archived_at`, excluding deleted rows.
- `restoreApplication(id, status, reason)`: sets the chosen status, and clears `disqualified_at` and `disqualification_reason`.

**RSPDashboard wiring.** The `reports` section renders `<RspArchives>` instead of the overview cards and the closed, temp, notSelected, ranking and assessment sub-views. It passes the records the dashboard already holds:

- `deletedJobReports`, with purge through `handleDeleteArchivePermanently`
- ranking positions from `rankingHistoricalData`, opening the existing ranking report through `openRankingReport`
- assessment positions from `assessmentPositionCards`, opening the existing forms modal through `openAssessmentForms`

The `documents` sub-view and every modal stay as they are. State, imports and the now-unused `NotSelectedArchive` component that only fed the removed views are deleted.

**Decisions made while planning**

- **Restore target.** Nothing records the status an applicant had before disqualification, so the Restore dialog asks staff to choose the status to return to (default For Evaluation) and requires a reason. Adding a column for the prior status would need a migration and is left out.
- **Retired.** It isn't an employee status (the employees CHECK allows Active, On Leave, Resigned, Terminated; Separated was added later). Adding it needs a migration and is out of scope.
- **Temporary Employee Account Generation.** It leaves Archives. The same applicants are already in RSP → Newly Hired.
- **Evaluation records are per position.** Assessment forms open through the existing per-position modal, so there's no per-applicant form row.
- **Buttons.** Filters and Export use `.btn-secondary`. The guide has no ghost button for white pages.

## Steps

1. Add `src/lib/api/rspArchives.ts` with the three fetchers and `restoreApplication`.
2. Add the module: `model.ts` + `model.test.ts`, the page, drawer and dialogs, `index.ts`, `README.md`.
3. Wire `RSPDashboard.tsx`: render the module in `reports` (except `documents`), remove the replaced views, state and imports, and update the section subtitle.
4. Run the checks, then verify in the browser at 1366×768 and 375px.
5. Commit on top of `origin/main` and push to `main` (the user asked for deploy from main, no new branch). Confirm cic-trix.vercel.app serves the new bundle.

## Risks

- `employee_history` may not exist or may be empty in production. In that case the Previous positions type shows an empty state; nothing breaks.
- Restore writes to the live `applicants` table. It changes one row, only after a reason is typed.
- The local `.env` anon key is disabled, so the dev server can't load live data. Browser checks run against mock or empty data, and the live check after deploy is limited to confirming that the page loads.
- Removing `RSPDashboard` views can leave unused state that fails type-check or lint. Run both.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (new `model.test.ts`, and existing RSPDashboard tests)
- Browser: tabs, search, Type select, Filters popover, drawer, Restore and Purge dialogs, and widths 1366 and 375
- DESIGN_IDENTITY §16 checklist
