---
title: Highlight the top scorer in RSP tables
date: 2026-10-26
status: Done
summary: Every RSP table with scores or rankings highlights the highest scorer(s) per comparison group, computed from the full group, including print and export.
---

## Goal

The top scorer in each RSP comparison group is obvious at a glance.

## Approach

| # | Decision |
|---|---|
| D8 | Row gets a `--color-primary-50` tint, a 3px `--color-primary` left border and a "Top scorer" badge with a `trophy` icon (not colour alone). Brand blue, not status colours. |
| — | Ties are all highlighted. No highlight when there are no scores, all are zero, or the group has fewer than two applicants. |
| — | `topScorer(groups, scoreOf)` computes from the full group data, so sorting, filtering and pagination don't change the result. It recomputes on every score change. |
| — | Basis per table: total score, or written-exam percentage of the configured total points (Task 1). |

## Steps

1. List every RSP score/ranking table (inventory).
2. Build `topScorer()` + tests (single, tie, no scores, recompute after edit).
3. Apply via the shared table layer (Task 6), including print views and PDF exports.

## Risks

- Tables that mix vacancies must group per vacancy, not across the table.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`.
