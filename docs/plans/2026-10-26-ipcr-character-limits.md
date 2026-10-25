---
title: Add character limits and live counters to IPCR text fields
date: 2026-10-26
status: Done
summary: Cap each IPCR free-text field at a limit sized from production data and show a live n/max counter that warns near and at the cap.
---

## Goal

Every editable IPCR text field stops accepting input at a field-specific limit and shows a live counter beside it. The counter is neutral until the last 10% of the limit, amber inside that band, and red at the cap, so an employee or reviewer can see the ceiling before reaching it.

Limits were sized from the 760-row production IPCR corpus, where the longest MFO was 94 characters, Success Indicator 150, Accomplishment 304 (average 257), and Remarks 200 or fewer. A single 280-character Twitter-style cap would have rejected every longer accomplishment already on file.

| Field | Limit |
| --- | --- |
| MFO / PAP title | 120 |
| Success Indicator | 280 |
| Actual Accomplishment | 500 |
| Employee remarks (Phase 2) | 200 |
| Reviewer return / revision comment | 500 |

Enforced in the UI only. The backing columns are unbounded `text`, so no migration or data rewrite is needed, and every existing row already fits.

## Approach

- `src/lib/ipcrLimits.ts` holds the limits as one frozen object so employee, office-account, PM, and demo screens cannot drift apart.
- `src/components/CharacterCount.tsx` renders `count/max`, switches tone in the final 10%, and announces only the reached-limit state to assistive tech so it does not read every keystroke.
- Each editable field gets `maxLength` plus the counter. Read-only rendering sites are untouched.
- Screens changed: employee Phase 1 targets and Phase 2 accomplishments/remarks, Office Account overrides and return reasons, PM Phase 2 edited accomplishments and return reason, and the PM demo Phase 1/2/review screens.
- Cycle notes and notification copy are out of scope.

## Steps

1. Add `ipcrLimits.ts` and `CharacterCount.tsx`; verify the counter renders neutral, amber, and red states.
2. Wire limits and counters into `EmployeePage.tsx` (Phase 1) and `EmployeePhase2.tsx`.
3. Wire limits and counters into `OfficeAccountConsole.tsx` and `Phase2RatingPanel.tsx`.
4. Wire the same limits into `demo/EmployeeIPCR.tsx` and `demo/SupervisorReview.tsx`.
5. Run the checks below and record the summary.

## Risks

- A limit could be lower than a legitimate future entry; the amber band gives warning before the hard stop, and raising a limit is a one-line change in `ipcrLimits.ts`.
- Counters add height to dense Phase 2 table rows; keep them on one line and 10px tall to limit the shift.
- `maxLength` is a UI guard only; direct API writes can still exceed the limits. Accepted for now because the columns are unbounded and the flows are UI-only.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Manual pass through employee Phase 1, employee Phase 2, Office Account approval/edit/return, PM Phase 2 edit/return, and the two demo screens.
- `DESIGN_IDENTITY.md` §16 checklist for the counter colors and form-control behavior.
