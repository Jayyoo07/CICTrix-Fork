---
title: Enlarge Phase 2 achievements and remove employee remarks
date: 2026-10-29
status: In Progress
summary: Remove the employee Phase 2 Remarks column and provide a wider, four-line Achievement field with manual vertical resizing and internal scrolling, without automatic growth.
---

## Goal

Employees can read and edit achievements in My IPCR Workspace, Phase 2 without a cramped two-line field. Remove the entire Remarks column from this employee view only. The user approved the scope in conversation and requested implementation on another branch with a saved plan.

This supersedes the employee-facing column introduced by `2026-10-05-ipcr-remarks-column.md`; it does not remove stored remarks or change other portals.

## Approach

Modify `src/modules/employee/EmployeePhase2.tsx` and add a small, scoped `EmployeePhase2.css`. Use a fixed table layout with a 960px minimum width, 30% for frozen indicators, 96px each for Q/E/T, 64px for Average, and all remaining space for Achievement. Keep horizontal scrolling in the existing table wrapper instead of squeezing text on narrow screens.

Achievement starts with four visible lines, a minimum height sufficient for those lines, 14px text, token-based colors and focus styles, vertical-only manual resizing, and internal scrolling. Do not add automatic sizing or change height while typing. Manual resizing intentionally changes the row height. Preserve the 500-character limit and live counter, and label each field using its indicator text.

Remove only the Remarks header, textarea and counter. Keep remarks in load/cache/save handling so existing values are not cleared by saving an achievement. After removal there are six columns; the existing function-group span of five plus Average and MFO span of six become correct.

Alternatives: automatic growth was rejected because it would shift later rows while typing; retaining a read-only Remarks column was rejected by the user because the whole column should disappear.

## Steps

- [x] Create an isolated worktree and branch, preserving unrelated planning work in the original checkout.
- [x] Run the existing test suite as a baseline (1,120 passed; one unrelated live-data test requires a local `.env` and production fixtures).
- [x] Add `src/modules/employee/EmployeePhase2.test.tsx`. Verify editable and read-only sheets have six columns and no remarks input, Achievement shows four rows, edits retain ratings/limits/counters, and draft/submission saves preserve existing remarks. Run the new tests and observe the intended failures.
- [x] Remove Remarks UI, allocate column widths, enlarge Achievement, and add scoped styling. Run focused tests to green (seven passed).
- [ ] Run TypeScript, lint, the full test suite, production build, design checks, and a rendered responsive check if browser access is available. Review the complete diff.
- [ ] Write the session summary, mark this plan Done, regenerate the plans dashboard, and commit the focused changes. Do not push, merge or deploy.

## Risks

- Hidden remarks could accidentally be erased if removed from the save payload; regression tests must pin their preservation.
- Width allocation or stale spans could misalign averages; verify all rows occupy six columns and test all function groups.
- Long or prefilled achievements must scroll rather than grow automatically; check loaded and typed content at desktop, tablet, and mobile widths.
- Closed/completed sheets must remain non-editable, and rating/submission gating must remain unchanged.
- Shared table CSS overrides utility padding/font rules; use scoped styling without modifying shared tokens or unrelated screens.

## Checks to run

- `npx vitest run src/modules/employee/EmployeePhase2.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- Impeccable detector on changed UI files; distinguish pre-existing findings from introduced issues.
- `DESIGN_IDENTITY.md` §16: check applicable input, table, typography, token, focus, contrast and responsive rules. Navigation, buttons, badges and modals are outside this change.

## Execution record

- Approved design: wider Achievement, four visible lines, manual vertical resizing and internal scrolling; no automatic growth. Entire employee Remarks column removed; existing data retained.
- Workspace: separate worktree on `fix/ipcr-phase2-achievement-readability`, based on `6f5a399`. No external writes or database changes planned.
- Pre-flight: one implementation task; no shared interfaces between tasks. Keep the existing `EmployeePhase2` props and service interfaces unchanged.
- Baseline environment: local-only placeholder client configuration, not live credentials. The pre-existing `scripts/seed-training-attendance.test.mjs` test `runs generateTrainingAttendance dry run and matches target compliance percentages` requires a local `.env` and live fixtures; leave it unchanged. The full post-change suite reports 1,127 passed and that same one failure.
- Verified: TypeScript, lint, production build, seven focused tests, and design detector (no findings).
- Browser fixture uses the real component and shared CSS with local-only service doubles. At 1366/768/375px viewports, the page itself does not overflow; the table scrolls within its wrapper at narrow widths. Achievement stays 100px tall while editing 500 characters; the following row stays in place. A manual height change to 160px moves the following row by exactly 60px, as intended. Screenshots could not be captured because the browser tab was not visible, even after focusing it; focus-ring appearance therefore still needs a visible-window manual check.
