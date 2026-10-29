# Employee setup wizard dismissal

## Shipped

- Remember wizard dismissal for the current employee in the current tab's sessionStorage.
- Reloads and page remounts do not automatically reopen a dismissed wizard.
- All existing close paths (X, backdrop, Remind me later, Skip for Now, and final Save Changes) record dismissal.
- Keep the profile completion button available for manual reopening.
- Clear dismissal with the employee session on logout; another employee is not suppressed.

## Deviations

None. No layout, styling, profile-save, IPCR-storage, or live database changes. The approved plan is `docs/plans/2026-10-29-employee-setup-dismissal.md`.

## Checks

- Four relevant Vitest files: 40 tests passed. Includes seven wizard behavior cases and the existing IPCR hydration, login, and persistence regressions.
- `npx.cmd tsc --noEmit` and `npm.cmd run lint` passed.
- `git diff --check` passed.
- No browser visual verification was required for this behavior-only change; DOM interaction tests cover the existing controls. Design identity visual checklist is unchanged because no markup or styles were added.

## Limits

When sessionStorage is unavailable, dismissal closes the current wizard but cannot survive reloads. No live login/profile data was changed during testing.
