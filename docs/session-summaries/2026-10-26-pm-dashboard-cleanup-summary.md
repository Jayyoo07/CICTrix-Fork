---
title: PM dashboard cleanup summary
date: 2026-10-26
plan: docs/plans/2026-10-26-pm-dashboard-cleanup.md
---

## What shipped vs. planned

- **Removed:** the Competency & Succession Watchlist (Skill Gap Alerts by Department, Upcoming Retirements) from `src/modules/admin/PMDashboard.tsx`, with its state (`skillGaps`, `retirements`), its two load effects, and `src/lib/api/competencies.ts`, whose only consumer was this widget.
- **Kept, not planned:** the IPCR Submissions panel. Its Recent tab is the only PM screen listing `performance_evaluations` (272 live rows), so the safeguard applied and the user chose to keep it.
- **Layout:** the 50/50 bottom row is now one full-width IPCR Submissions card, so no grid gap is left.

## Deviations

- IPCR Submissions stays (see above).
- Older plans (`docs/plans/2026-10-16-pm-dashboard.md`) still mention the Watchlist. They are history and were not edited.

## Checks run

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
