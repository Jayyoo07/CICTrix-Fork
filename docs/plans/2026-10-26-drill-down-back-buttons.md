---
title: In-page Back buttons on drill-downs, alongside browser Back
date: 2026-10-26
status: Done
summary: Add a visible Back button to every in-page drill-down that lost its back link in the 2026-10-07 change, keeping browser Back closing one level.
---

## Goal

Every in-page drill-down (an office, folder, department, position, archive
sub-view or detail panel shown in place of its list) shows a Back button that
returns to the view the user was just on. Browser Back keeps working the same
way. Users no longer have to open a new tab or re-click a rail item to get out.

## Approach

- Root cause: `6a5cf71` (plan `2026-10-07-history-back-nav.md`) removed the
  text back links and left browser Back as the only way out, which its own
  Risks section flagged as hard to discover.
- One shared `BackButton` (`src/components/BackButton.tsx`) built on the shared
  `Button`: Small secondary pill (§9.1), leading 16px `arrow-left`, label
  "Back" (§8.2 back navigation). It sits above the drill-down's title.
- `onClick` runs the view's existing close function. `useBackClosesView` already
  pops its history entry when the view closes from inside the page, so the
  button and browser Back stay in step and history gains no extra entries.
- Out of scope: modals and drawers (they have a close button), fixed-destination
  links, rail-item reset behaviour.

## Steps

1. Office Directory (shared section, L&D and PM): failing test, then the
   `BackButton`, then the section. Verify in the browser before going further.
2. The remaining drill-downs from the 2026-10-07 summary, each test-first:
   RSP Office Directory (office, employee details), RSP Archives sub-views,
   Application Ranking, For Hiring, Newly Hired, Applicant Score folder,
   System Administration, Employee Directory, L&D Archive, L&D and PM Summary
   of Ratings, PM Semester Summary, PM Archive, PM IPCR, Phase 2 rating, PM
   Promotional Applications, PM demo, Office Account Console, Interviewer
   applicant details.
3. Update DESIGN_IDENTITY.md §8.2: drill-downs get a Back button in addition to
   browser Back.

## Risks

- A nested view must close only its own level; the button calls the same close
  function its `useBackClosesView` level uses.
- Global `button`/`span` colours in `globals.css` can override the label colour;
  check the rendered colour, not just the class.

## Checks to run

- `npx tsc --noEmit`, `npm test`.
- Dev server: drill in, click Back (one level, history length unchanged), drill
  in again, press browser Back (one level).
