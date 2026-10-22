# Job Vacancies table and left-aligned RSP actions: summary

Plan: [docs/plans/2026-10-22-rsp-vacancy-table-buttons.md](../plans/2026-10-22-rsp-vacancy-table-buttons.md)

## Shipped

- Job Vacancies table: fixed layout with set column widths and a 1200px minimum; below that it scrolls with the Actions column pinned right. Office on line one, division muted on line two (no " · " join). Title clamped to 2 lines with hover text. Dates share one color and don't wrap. Header labels on one line.
- Row actions: "Applicants" (small secondary, count removed since it has its own column) and "Close Vacancy" (small destructive outline), kept on one line. The existing close confirmation is unchanged.
- "Open Vacant Job Position" moved to its own left-aligned row above the card, like "Create Job Position". Search (flex) and office select start at the card's left edge.
- For Hiring: "Select for Hiring" sits under the description, left-aligned.
- Generate Employee Credentials: "Select all" left of the search; selection bar reads count, Generate, Clear from the left.

## Deviations

- Applicants count kept right-aligned (§9.5) instead of the brief's left alignment.
- Toolbar left-aligned per the request, which departs from §9.4's right-aligned toolbar.
- Disabled-button contrast not changed: it already matches the §9.1 token; changing it is a separate token decision.

## Checks run

- `npx tsc --noEmit`: pass.
- `npm test`: JobVacanciesPanel and JobPostingsPage.tabs tests updated for the new button label; full suite 421 tests, all pass after the update.
- `npm run build`: pass.
- `npm run lint`: cannot run; the repo has no ESLint config on main (pre-existing).
- Not done: visual check at 1440/1280/1024/768.
