---
title: Readable table text and a uniform table design
date: 2026-10-26
status: Approved
summary: Fix low-contrast table text and move every table in every module onto a shared .abyan-table style layer modelled on the Succession Planning table, with shared loading/error/empty rows and the top-scorer option.
spec: docs/mockups/2026-10-07-succession-table.html
---

## Goal

Every table is readable (WCAG AA) and looks and behaves like the Succession Planning table.

## Approach

| # | Decision |
|---|---|
| D7 | A shared style layer (`.abyan-table`), `<TableStateRows>` (loading skeleton, error with Retry, empty) and `topScorer()`, not one generic `<DataTable>` component, so each table keeps its sorting, selection and actions. |
| D9 | Replace `text-slate-400` (#94A3B8) and text opacity in tables with `--neutral-600` (#515F69); body text at least 14px, weight 500. Before/after ratios from a script. |

## Steps

1. Document the Succession table specs.
2. Build `.abyan-table` styles, `<TableStateRows>`, tests.
3. Migrate every table, module by module; list any that can't be migrated with the reason.
4. Contrast script with before/after ratios.
5. Visual check at desktop and mobile widths.

## Risks

- ~108 tables in ~56 files; changes stay to classes and state rows, not structure.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`, contrast script.
