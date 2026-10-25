# PM dashboard submission card: summary

Plan: `docs/plans/2026-10-25-pm-submission-rate-merge.md` (D1–D4, then Revision R1–R5).

## What shipped vs. planned

- **D1, merged card (as planned).** The lone "IPCR submission rate" KPI card is gone. The department card is now "IPCR submission", with the rate, a segmented bar and a legend at the top, then the office table. Mockup: `docs/mockups/2026-10-25-pm-submission-rate-merged.html`.
- **D2, replaced by R1–R2.** The first build added ratings-based "submitted" to pipeline due dates and floored the remainder at 0. A critique (18/36, `.impeccable/critique/2026-10-25T14-21-06Z__src-modules-admin-pmdashboardoverview-tsx.md`) showed the legend did not match the rows and "submitted" was not an IPCR submission. The card now uses one source, `PMDashboard`'s per-employee tracker: each Active employee is Submitted (current IPCR "Forwarded to PM"), Overdue, Due in 30 days, or Not yet due. The four always add up to the total.
- **D3, sort (as planned)**, plus the "Unassigned or inactive office" row always sorts last.
- **D4, hero overlap: not applicable.** This dashboard never overlapped the hero.
- **R3.** Rows are active offices; employees with no office or an inactive one go to one "Unassigned or inactive office" row, so office totals equal the rows.
- **R4.** The card shows "Loading submissions…" until both the tracker and the active-office list load, and an error message (not zeros) if the tracker fails.
- **R5.** The hero sub-line no longer prints "January–June 2025". PR #29 (merged to main first) replaced `REPORT_PERIOD` with `RATED_PERIOD_LABEL = 'All rated periods'`; on rebase the IPCR results subtitle keeps that label, and the hero keeps no period because it sits above both cards, which cover different periods.

## Deviations and deferred

- Deferred: office-name variants in `groupByDept` (affects IPCR results and Summary of Ratings, not this card any more); critique P2 items (Status cell shows only overdue when both exist, "—" wording, the low-contrast "Not yet due" swatch).
- Warning badge contrast (`--warning-700`) is a separate session and PR.
- "Not yet due" swatch colour changed from `#EEF0FF` to `#C8D1FF` (`--pd-tint`); the mockup was updated to match.

## Checks run

- `npx tsc --noEmit`: pass.
- `npx vitest run src/modules/admin`: 8 files, 49 tests pass (overview: 9, including totals-equal-rows and the error state).
- `npm run lint`: not run; this checkout has no ESLint config file.
- Browser, via a temporary harness with stubbed data (the real route needs a login): legend totals equal the row sums (32 / 29 / 39 / 28 of 128); the department filter scopes the strip and table; 375px stacks the strip with no page overflow; 768px has no table overflow.
- Not verified: real Supabase data. Risk: regular employees' periods come from their hire anniversary ("1st Half 2026"); if `ipcr_submissions.period` uses other labels, everyone reads as not submitted. Same logic as the dashboard's IPCR Submissions table.
