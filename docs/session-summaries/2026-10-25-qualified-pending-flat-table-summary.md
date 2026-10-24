# Qualified Applicants: status fix and flat Pending Assignment table — summary

Plan: `docs/plans/2026-10-25-qualified-pending-flat-table.md`
Mockup: `docs/mockups/2026-10-25-qualified-pending-flat-table.html` (option A)
Branch: `feat/qualified-pending-flat-table`, commit `2a9d0f4`. Not pushed or merged.

## What shipped vs. planned

All five plan steps shipped as planned.

- **Status fix.** `isSchedulableApplicant` in `src/lib/scheduleSelection.ts` replaces the substring check in `PendingAssignmentList.tsx`. It lists Shortlisted (including legacy "Recommended for Hiring"), Interview/Exam Scheduled, For Evaluation and Qualified. It never lists a terminal status (Selected, Disqualified, Not Selected, Withdrawn - Hired Elsewhere), even with a completed evaluation. Blank or unrecognised statuses are left out. Both the Pending Assignment and Scheduled sub-tabs use it.
- **Flat table.** The department → position tree is replaced by one table with columns for checkbox, Applicant, Position, Department, Type and Shortlisted date. Pending now uses the same filter bar as Scheduled (search, department, position, type). The table has sortable headers and a header checkbox that selects every filtered row across pages, with an indeterminate state when only some are selected. It pages at 10 rows with numbered pages (§9.6) and scrolls sideways on narrow screens (§8.3). Selections survive filtering and paging.
- **Removed.** `src/components/SchedulingTree.tsx` and its tests. `groupByDepartmentAndPosition`, `groupCheckState`, `toggleGroup` and `toggleId` stay, because Generate Credentials and the Schedule Applicants modal still use them.
- **Token touch-up.** In the Pending view only, hard-coded hex and Tailwind colors were swapped for tokens, and the empty state uses `.btn`.

## Deviations

- **Table-header style.** The headers reuse the Scheduled table's `SortHeader` style (uppercase, grey) so the two sub-tabs match. §9.5 calls for 13px SemiBold `#040E6B`. Both tables still differ from §9.5 here, and that is left for a separate change.
- **Shared filter bar.** It keeps its existing classes (`rounded-xl`, `slate-300`). It is shared with Scheduled, and `rsp-design.css` overrides its focus class, so it wasn't swept.
- **Pagination helper.** The plan didn't mention one. A small local `pageItems` adds the §9.6 ellipsis past 7 pages.

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm test` | Pass: 53 files, 471 tests. New: 11 status cases in `scheduleSelection.test.ts` and 4 component tests in `BatchScheduling.test.tsx`: one table with no levels; Disqualified and Not Qualified excluded even when evaluated; header checkbox selects only filtered rows; selection kept across a filter change. |
| `npm run lint` | **Not run.** The repo has no ESLint config file, so ESLint fails before linting. This is pre-existing and not fixed here. |
| Browser check | **Not run, by the user's decision.** The local dev server points at live Supabase, there is no seeded test login, and real credentials were not entered. Mobile, tablet and desktop widths were not checked in a browser. |
| DESIGN_IDENTITY §16 | Reviewed in code only. The §8.3 horizontal-scroll gap was found and fixed. The header-style drift is noted above. |

## Note on the old screen

A screenshot taken after the commit still showed the tree and a Disqualified row. That build came from `main` or production, which don't have this branch yet. The change appears there only after the branch is merged and deployed.
