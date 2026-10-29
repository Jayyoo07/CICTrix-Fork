---
title: Preserve employee Phase 1 targets across saves and reloads
date: 2026-10-29
status: Done
summary: Verify Phase 1 persistence, report failed target reads, and keep each phase's saved state independent.
---

## Goal

Saving Phase 1 restores the same MFOs and indicators after reload. Saving Phase 2 preserves saved Phase 1 targets and does not mark unsaved targets as saved.

## Approach

Keep the existing relational target storage and workspace summary. Write and verify replacement children before deleting the previous draft; finish submission only after successful persistence. Propagate child-read errors instead of returning blank targets, verify persisted targets before reporting success, and update only the saved phase's dirty-state snapshot in EmployeePage. The user approved this scope on 2026-10-29. No live database changes are included.

## Steps

1. Add regression coverage for saving and reloading targets, failed child reads, and independent saved snapshots.
2. Fix target reads and saved-state tracking, preserving edits on failure.
3. Run targeted tests, TypeScript, lint, and build; record results.

## Risks

- Existing two-step relational/workspace writes can partially fail; failures must stay visible and must not mark the full form saved.
- Live database behavior cannot be established by mocked regression tests alone.

## Checks to run

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- Relevant Vitest tests and `npm.cmd run build`
- Regenerate the plans dashboard.
