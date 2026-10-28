---
title: Show annual training progress on recommended employees
date: 2026-10-28
status: Done
summary: Show each recommended employee's recorded current-year training completions against the requirement of two, without changing recommendations or admin selection.
---

# Annual Training Indicator Implementation Plan

> Execute inline using the executing-plans skill; no subagents are authorized. Track execution with the checkboxes below.

## Goal

In L&D > Seminar Enrollment > Recommendation, show `N/2 Completed this year` immediately to the right of each employee's name. Give the admin context for prioritizing training opportunities, without imposing an enrollment limit.

### Approved design

- Each employee requires two completed trainings per calendar year.
- Count recorded historical completions from the same `employee_training` source as L&D Archive, not recommendations or calendar enrollments.
- Show actual totals: `0/2 Completed this year`, `1/2 Completed this year`, `2/2 Completed this year`, and `3/2 Completed this year` when applicable. Never cap the numerator.
- Change this subtab only. Do not alter recommendation eligibility, sorting, acceptance, rejection, routing, or other tabs.
- The user approved the scope and then requested building the saved plan on a new branch on 2026-10-28.

## Approach

**Architecture:** Add a focused, read-only batch count helper to `src/lib/api/lndArchive.ts`. Load counts for the distinct candidate employee IDs in `SeminarEnrollment.tsx`, independently of recommendation loading failures. Supply progress to `AttendeeRow` only from the Recommendation subtab.

**Tech stack:** Existing React 18, TypeScript, Supabase client, Vitest, and React Testing Library. No new dependency, module folder, schema change, or live database write.

**Approaches considered:** Archive-only counts follow the existing historical training inventory and were approved. Combining archive and calendar attendance would require a new completion policy and cross-source deduplication, and is outside this change. Lifetime counts were rejected in favor of current-year progress.

**Counting rules (implementation choices):**

- Use the Philippine calendar year and today's Philippine date (`Asia/Manila`), appropriate to this LGU.
- Effective completion date is `to_date`, falling back to `from_date` only when the end date is absent. Include dates from January 1 through today, inclusive.
- Exclude missing/invalid effective dates and future completion dates. A December-to-January course belongs to the year it ends.
- Read only the requested employee IDs and needed fields (`id`, `employee_id`, `from_date`, `to_date`, `enrollment_id`). Paginate rather than assuming the API's first response contains all records; batch employee IDs using existing project conventions.
- Count each archive record once; archive records sharing the same non-null enrollment ID for an employee count as one training. Do not merge unrelated historical records merely because their titles are similar.
- A successful read with no qualifying records returns zero. A failed read displays `Unavailable`, not a misleading zero. Loading displays a short loading label without hiding the candidate list.

**UI:** Preserve the existing name row and use existing neutral/info tokens, readable badge text, and wrapping for long names or narrow screens. Name, indicator, and Accept/Reject controls must remain readable. The placement and exact text are settled; no new layout exploration or token changes are needed. Name the annual requirement constant rather than repeating an unexplained `2`.

## Steps

### Task 1: Add the Archive count read model

**Files:** Modify `src/lib/api/lndArchive.ts`; create `src/lib/api/lndArchive.trainingCounts.test.ts`.

**Interface:** Export `getCurrentYearTrainingCounts(employeeIds: string[], now?: Date): Promise<{ ok: boolean; counts: Map<string, number>; error?: string }>`; `now` defaults to the actual date. A failure must not expose partial counts as complete.

- [x] Write failing mocked-database tests covering zero/one/two/three completions, multiple employees, empty IDs without a query, and repeated input IDs.
- [x] Add cases for prior year, future end date, December/January boundaries in Philippine time, absent end date, missing/invalid effective dates, duplicate linked records, pagination, and read/rejected-request failure.
- [x] Run `npm test -- src/lib/api/lndArchive.trainingCounts.test.ts`; confirm the tests fail because the helper does not exist.
- [x] Implement the helper with scoped, paginated reads and explicit failure results; do not modify existing Archive behavior.
- [x] Run the same test command and confirm it passes.

### Task 2: Display progress only on recommended employees

**Files:** Modify `src/modules/admin/SeminarEnrollment.tsx` and `src/modules/admin/SeminarEnrollment.test.tsx`.

**Interface:** Consume `getCurrentYearTrainingCounts` from Task 1. Add optional progress props to the private `AttendeeRow`; omit them in other subtabs. Keep the target `2` in a named `ANNUAL_TRAINING_REQUIREMENT` constant.

- [x] Write failing component tests with candidate fixtures and mocked Archive counts. Assert exact `0/2`, `1/2`, `2/2`, and `3/2 Completed this year` labels, correctly associated with each name.
- [x] Add tests that loading and failed counts leave candidates/actions visible, failed counts say `Unavailable` rather than `0/2`, and indicators do not appear in Sent/Returned views using the shared row.
- [x] Assert distinct candidate IDs are requested together, refresh updates progress, and Accept selection/routing still works without using completion counts as an eligibility filter.
- [x] Run `npm test -- src/modules/admin/SeminarEnrollment.test.tsx`; confirm the new assertions fail before implementing.
- [x] Implement count loading and the optional name-adjacent indicator. Prevent obsolete count responses from overwriting a newer refresh or updating state after unmount.
- [x] Run both targeted test files; confirm new and existing tests pass.

### Task 3: Verify and record the result

- [x] Run the commands in Checks to run and review the focused diff for scope and preserved user work.
- [x] Inspect a local rendered fixture at desktop and narrow widths, without triggering live recommendation writes. Check long names, wrapping, zero/over-target counts, loading/errors, and visible action controls against DESIGN_IDENTITY.md §16.
- [x] Run the Impeccable detector on the changed UI file; address only findings introduced by this change.
- [x] Self-review the count's date boundaries, failure isolation, query coverage, and unchanged recommendation behavior; do not dispatch agents without permission.
- [x] Mark the plan Done and write `docs/session-summaries/2026-10-28-lnd-annual-training-indicator-summary.md` with actual changes, deviations, and verification evidence. Regenerate the plan dashboard after each plan/summary update.
- [x] Commit only this task's files and generated dashboard at a logical stop, announcing the commit first. Do not push or deploy.

## Risks

- The Archive is a historical inventory, not a verified attendance/completion workflow. Trainings missing from it cannot be counted. The indicator must not imply a new attendance audit.
- `AttendeeRow` is shared: enabling the badge globally would expand scope into other subtabs.
- API row limits, timezone boundaries, future-dated records, and treating errors as zero can mislead prioritization; tests must cover these explicitly.
- The workspace contains unrelated user-owned untracked files. Leave them untouched and never stage them with this task.

## Checks to run

- `npm test -- src/lib/api/lndArchive.trainingCounts.test.ts src/modules/admin/SeminarEnrollment.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- DESIGN_IDENTITY.md §16 and local rendered inspection described above.
- `C:\Users\ajcbu\.config\opencode\skills\impeccable\scripts\impeccable.cmd detect --json src/modules/admin/SeminarEnrollment.tsx`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`

### Verification outcome

- `npx tsc --noEmit` and `npm run lint`: passed.
- Bare `npm test`: 679 files / 5,786 tests passed, including existing nested worktrees. A final run excluding nested worktrees passed all 118 files / 1,024 tests in this checkout after the pagination-loop lint correction.
- `npm run build`: blocked by the previously documented Windows esbuild temp-file removal permission error. The existing `npm run build:verify` passed; production build settings are unchanged.
- Actual component checked with mocked services at 1366px, 768px, and 375px. Badge contrast is 11.63:1, text is Poppins 12px, and progress/actions fit with long names. No Supabase requests were made during this check.
- The design detector reported only the pre-existing zero-match course's `border-l-4` accent. No new detector findings were introduced.
- Self-review only, as planned. See the linked session summary for limitations.

## Review focus

- A failed, incomplete, or stale count must never masquerade as a confirmed zero.
- Cross-year courses use completion date, with Philippine calendar boundaries.
- Duplicate enrollment links and paginated responses must not inflate or truncate counts.
- A long employee name must not crowd out progress or action controls.
- Over-target totals remain visible and never change recommendation eligibility or selection.
