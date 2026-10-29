---
title: Remember employee setup wizard dismissal during a session
date: 2026-10-29
status: Done
summary: Keep the dismissed profile setup wizard closed across reloads and employee page navigation until logout.
---

## Goal

An employee can dismiss the profile setup wizard once per signed-in tab session. Reloading or changing employee pages does not reopen it automatically, while the profile completion button still opens it manually. Logout resets the dismissal.

## Approach

Store the dismissed employee ID in sessionStorage through employeeSession.ts. Use a shared close handler for every wizard dismissal/completion path and consult the dismissal before automatically opening. Clear the dismissal with the employee session. The user approved this plan. No visual layout or IPCR storage changes.

## Steps

1. Add session dismissal storage and reset on logout.
2. Connect the setup wizard's automatic opening and close actions.
3. Test dismiss/remount, manual reopen, employee isolation, logout reset, and existing IPCR behavior.

## Risks

- Unavailable browser storage cannot persist dismissal across reloads; closing still works for the current page.
- Remembering dismissal must not suppress another employee's setup prompt.

## Checks to run

- Relevant Vitest tests.
- `npx.cmd tsc --noEmit` and `npm.cmd run lint`.
- `git diff --check` and regenerate plans dashboard.
