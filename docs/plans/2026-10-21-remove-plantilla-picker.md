---
title: Remove the plantilla picker from Job Details
date: 2026-10-21
status: Done
summary: Each posting now has one assigned plantilla with its own description, so applicants no longer choose plantilla items. Step 1 selects the posting's open plantilla automatically, and the required-documents note gets new instruction copy.
spec: Chat decision 2026-10-21 (one plantilla per posting; slim Apply card, preview skipped)
---

## Goal

Applicants go from the posting straight to the application without choosing a plantilla, and see the updated submission instructions.

## Approach

| # | Decision |
|---|---|
| D1 | Every posting has exactly one plantilla. Step 1 passes the first open plantilla as the single `selectedChoices` entry, so the wizard is unchanged. |
| D2 | The right column becomes an "Apply for this position" card: closing date and Continue to Application. A closed or filled posting shows the existing empty state. Mobile keeps the bottom action bar. |
| D3 | The note under Required documents is replaced with the new instruction text. |
| D4 | The RSP admin view (plantilla breakdown) is unchanged. |

## Steps

1. `JobDetailsPage.tsx`: drop selection state, checkbox list, select-all and the discard-answers modal; add the Apply card; replace the note.
2. `npx tsc --noEmit`, `npm run lint`, related tests, browser check of `/job-details/:id`.

## Risks

- A posting that still carries several open plantillas (from the 2026-10-21 merge) applies to the lowest-numbered one only.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`.
