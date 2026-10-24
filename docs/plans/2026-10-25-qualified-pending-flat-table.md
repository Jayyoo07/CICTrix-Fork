---
title: Qualified Applicants — status fix and flat Pending Assignment table
date: 2026-10-25
status: In Progress
summary: Stop Disqualified / Not Qualified / closed applicants from appearing on Qualified Applicants, and replace the department → position dropdown tree on Pending Assignment with one flat, filterable, sortable table.
---

## Goal

On RSP → Applicants → Qualified Applicants, only applicants who can still be scheduled or are awaiting evaluation appear, in both the Pending Assignment and Scheduled sub-tabs. Pending Assignment shows them in one flat table that RSP filters and selects from, instead of a three-level tree.

Mockup: `docs/mockups/2026-10-25-qualified-pending-flat-table.html` (option A). This supersedes the tree layout from `docs/plans/2026-10-11-batch-interview-scheduling.md` step 4. The Schedule Applicants modal, the batch save and the Scheduled tab are unchanged.

## Approach

**Logic (root cause).** `isQualified` in `src/components/PendingAssignmentList.tsx` uses `status.toLowerCase().includes('qualified')`, which is true for "Disqualified" and "Not Qualified". It also admits anyone with a completed evaluation, whatever their final status. The 2026-10-11 plan flagged this and left it out of scope.

The fix replaces the substring checks with `normalizeStatus` (from `src/lib/api/applicantStatus.ts`) and an explicit allow-list:

- Included: `Shortlisted` (which also covers legacy "Recommended for Hiring"), `Interview/Exam Scheduled`, `For Evaluation`, and `Qualified`.
- Always excluded: every `TERMINAL_STATUSES` value (Selected, Disqualified, Not Selected, Withdrawn - Hired Elsewhere), even with a completed evaluation.
- A completed evaluation still admits a non-terminal applicant whose status falls outside the list. This preserves today's behaviour for those rows.
- Unrecognised status values (`normalizeStatus` returns null) are excluded.

The predicate moves to a pure helper `isSchedulableApplicant` in `src/lib/scheduleSelection.ts`, so Vitest can test it directly. The predicate is shared by both sub-tabs, so the Scheduled tab loses the leaked rows too.

**Layout (option A).** Pending Assignment becomes one white card (§9.5 table, §9.4 toolbar, §9.6 pagination). The toolbar holds search plus the existing Department, Position and Type selects, which Pending currently ignores. Below the toolbar sits the selection bar ("N applicants selected", Clear all, Schedule Applicants). The table has these columns:

| Column | Content |
|---|---|
| ☐ | Row checkbox. The header checkbox selects every filtered row across all pages and shows an indeterminate state when partial. |
| Applicant | Name (Headline S `#040E6B`) over reference no. · email (Body S `#515F69`) |
| Position | Position title |
| Department | Office |
| Type | Original (neutral chip) / Promotional (tint chip), as categories per §10 |
| Shortlisted | `updated_at` → `MMM DD, YYYY`, default sort newest first (same approximation as the 2026-10-07 plan) |

Applicant, Position, Department and Shortlisted sort with the existing `useTableSort` / `SortHeader`. The table pages at 10 rows, following `NotSelectedArchive`'s pattern. Selected rows get the `#EEF0FF` background. Selections survive filtering and paging. No status column, since every row is schedulable.

The intro text changes to describe the table instead of "open a department…". `SchedulingTree.tsx` loses its only caller and is deleted along with its tests. The grouping and toggle helpers it used (`groupByDepartmentAndPosition`, `groupCheckState`, `toggleGroup`) stay if the modal or other code still imports them, and are removed only if unused.

## Steps

1. Add `isSchedulableApplicant(status, hasCompletedEvaluation)` to `scheduleSelection.ts` with Vitest cases: Shortlisted ✓, Interview/Exam Scheduled ✓, Qualified ✓, Disqualified ✗, "Not Qualified" ✗, Not Selected ✗, Withdrawn - Hired Elsewhere ✗, Selected ✗, Disqualified with a completed evaluation ✗, Submitted ✗, an unknown value ✗.
2. Swap `isQualified` in `PendingAssignmentList.tsx` for the helper.
3. Replace the `SchedulingTree` block with the flat table, toolbar, selection bar and pagination. Apply the shared filters to Pending as well.
4. Remove `SchedulingTree.tsx` and its `BatchScheduling.test.tsx` cases. Add component tests: a Disqualified applicant does not render, the header checkbox selects only the filtered rows, and a filter change keeps the existing selection.
5. Touch-up within this file only: replace the hard-coded hex values in the Pending view with token classes (§16).

## Risks

- **Rows disappear.** Applicants with statuses like For Contract Signing that were only listed through a completed evaluation stay listed, since they aren't terminal. Selected, Disqualified and the other terminal applicants disappear from both sub-tabs. That is the fix, but staff who relied on seeing them here will notice.
- **Cross-position batches become easier.** The tree nudged RSP to schedule one position at a time. The flat table allows a mixed selection, and the modal already summarises the selection by position, so the user can review it before confirming.
- `updated_at` as "Shortlisted" date is approximate (no `qualified_at` column).

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Browser check on `/admin/rsp/qualified`: Disqualified applicant from the screenshot is gone, filters, sort, select-all and Schedule Applicants work, at mobile, tablet and desktop widths.
- DESIGN_IDENTITY §16 checklist on the changed view.
