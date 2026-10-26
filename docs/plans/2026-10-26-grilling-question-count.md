---
title: Add estimated question counts to grilling skills
date: 2026-10-26
status: Done
summary: Announce an estimated interview length and number each question in grilling and grill-with-docs, revising the estimate openly when needed.
---

## Goal

Both grilling entry points show an estimated total before the first question and progress on each question, without limiting the interview or changing its existing safeguards. The user approved this approach in the session before implementation.

## Approach

Add the counting instructions to `.claude/skills/grilling/SKILL.md` and make `.claude/skills/grill-with-docs/SKILL.md` explicitly inherit them while retaining domain modeling. Keep the skills local: the repository ignores `.claude/skills/`; do not change that policy or force-add the files.

## Steps

1. Add the opening estimate, per-question label, and explicit estimate revisions to grilling.
2. Explicitly carry the same counting behavior through grill-with-docs.
3. Check both files and the preserved safeguards, run the type-check and tests, then record results and regenerate the plans dashboard.

## Risks

- A total could be mistaken for a fixed limit. State that it is an estimate, not a cap or a target to fill.
- The wrapper could drift from grilling. Refer to the shared counting rules rather than creating a second independent procedure.
- Skill files are ignored, so a Git commit does not distribute these local skill changes.
- The plans dashboard already has user changes. Preserve its existing entries and keep it out of the task commit.

## Checks to run

- Inspect both skill files for opening estimates, question labels, estimate revisions, and unchanged one-at-a-time/recommendation/code-lookup/approval safeguards.
- Review a short-session and an expanding-session example inline; no delegated evaluations.
- `npx tsc --noEmit`
- `npm test`
- `git diff --check`
- Regenerate the plans dashboard using `docs/plans/build-plans-index.ps1` and verify the pre-existing summary entry remains.
