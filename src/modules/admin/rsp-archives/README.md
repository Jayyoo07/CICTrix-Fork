# rsp-archives

The RSP → Archives page. It shows four tabs of finished history, one archive-wide search, a one-line toolbar, a four-column table, and a detail drawer that holds the record's single action.

Plan: `docs/plans/2026-10-25-rsp-archives.md`. Design: `docs/mockups/2026-10-25-rsp-archives.html`.

## Public interface

- `RspArchives` takes three props:
  - `records`: job posts and evaluation records, built by the caller from the data the dashboard already holds.
  - `onPurge(key)`: removes a deleted job post's preserved data.
  - `onOpenAssessment(position)`: opens the existing per-position assessment forms modal.
- Types: `ArchiveRecord`, `ArchiveAction`, `ArchivePerson`, `ArchiveFact`, `ArchiveGroup`.

The module loads employees and applicants itself through `src/lib/api/rspArchives.ts`:

- former employees: Resigned, Terminated, Separated
- previous positions, from `employee_history`: promoted and transferred
- closed applications: Disqualified, Not Selected, Withdrawn - Hired Elsewhere

Restore on a Disqualified application writes the chosen status through `restoreApplication`.

## What it does NOT handle

- **Retired.** It isn't an employee status yet. Adding it needs a migration.
- **The status before disqualification.** It isn't recorded anywhere, so Restore asks staff which status to return to.
- **The ranking report and hiring modal.** These stay in RSPDashboard. Ranking records here are read-only lists.
- **PDF export.** Export offers CSV and the browser's Print.

## Dependencies

- `src/lib/api/rspArchives.ts` and `src/lib/api/applicantStatus.ts`
- `src/hooks/useHistoryBack.ts` (`useBackClosesView`) and `src/lib/adminSession.ts`
- `.btn` and `.badge` classes from `src/styles/abyan-tokens.css`. These need an `.rsp-ds` or `.abyan-ds` ancestor.
- `lucide-react`
