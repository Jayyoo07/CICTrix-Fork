---
title: Short imperative title
date: YYYY-MM-DD
status: Draft
summary: One or two sentences. What changes and why it matters.
# spec: optional link or path to the mockup, issue, or spec this implements
---

## Goal

What is true when this is done. One paragraph, in user-visible terms.

If a mockup or an earlier plan governs the design, name the file here and say whether this supersedes it.

## Approach

The shape of the solution and the root cause when there is a bug. Name the files and functions that carry the change. Note the alternatives you rejected only if the choice was close.

## Steps

1. Step with a verifiable end state.
2. Step with a verifiable end state.

## Risks

- What could break or be misread, and how it would be noticed.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Anything task-specific: the migration drift check, a manual pass through the affected screen, the DESIGN_IDENTITY.md §16 checklist for UI work.
