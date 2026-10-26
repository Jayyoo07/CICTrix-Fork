---
title: Add estimated question counts to grilling skills
date: 2026-10-26
status: Done
summary: Both local grilling skills now announce an estimated total and show progress on each question, with explicit estimate revisions.
plan: docs/plans/2026-10-26-grilling-question-count.md
---

## Shipped

Updated `.claude/skills/grilling/SKILL.md` to announce an estimated total before the first question, label each question with its running number and current estimate, and explicitly revise the estimate without restarting numbering. The estimate is neither a cap nor a target to fill. Updated `.claude/skills/grill-with-docs/SKILL.md` to explicitly inherit these rules while preserving domain modeling.

The one-question-at-a-time interview, recommended answers, code lookup, and confirmation-before-building safeguards remain unchanged. Both skill files are Git-ignored; changes remain local and are not included in the documentation commit. No ignore rules were changed.

## Deviations

The initial `npm test` run included nested worktrees and exceeded its 120-second timeout. Reran the current checkout's tests with `.claude` and `.worktrees` excluded; no test configuration was changed. No delegated evaluations were run for this instruction-only change.

The dashboard was regenerated as required, preserving the existing duplicate-close-button summary entry. Its pre-existing user changes remain uncommitted.

## Verification

- Ten static assertions passed for both skills' counting instructions and the preserved safeguards.
- Manually reviewed two example sequences against the instructions: a short session (`I expect about 2 questions`, then `Question 1 of ~2` and `Question 2 of ~2`), and an expanding session (`Question 2 of ~4`, an explicit revision to about 6 questions, then `Question 3 of ~6`). These are instruction reviews, not independent behavioral evaluations.
- `npx tsc --noEmit`: passed.
- `npm test -- --exclude '**/.claude/**' --exclude '**/.worktrees/**'`: 61 test files and 530 tests passed. The run emitted React `act(...)`, Vite deprecation, Browserslist age, and mock API error logs.
- `git diff --check`: passed.
