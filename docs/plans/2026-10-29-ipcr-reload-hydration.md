---
title: Restore both IPCR phases consistently on reload
date: 2026-10-29
status: Done
summary: Preserve partial Phase 1 drafts and resolve the cycle before loading Phase 2.
---

## Goal

Reload restores saved Phase 1 content and the Phase 2 sheet for the resolved cycle.

## Approach

Correct draft-content checks, use the resolved fallback cycle directly, and prevent Phase 2 from querying before parent hydration completes. The user approved investigation and a focused fix. Preserve existing persistence work.

## Steps

1. Reproduce partial-target recovery failures and add regression coverage.
2. Correct draft recovery and cycle hydration without changing layout.
3. Run TypeScript, relevant tests and lint; record limits.

## Risks

- No connected browser session or live DB connector is available; account-specific saved records cannot be verified.
- Submission validation must still require an indicator, even though drafts can contain titles alone.

## Checks to run

- TypeScript, relevant IPCR tests, ESLint and diff check.
- Regenerate plans dashboard.
