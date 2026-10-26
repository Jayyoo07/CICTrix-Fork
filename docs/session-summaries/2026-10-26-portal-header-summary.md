---
title: One shared portal header summary
date: 2026-10-26
plan: docs/plans/2026-10-26-portal-header.md
---

## Differences found before the change

| | Admin (RSP, L&D, PM, Super Admin) | Interviewer | Department Head (office console) | Employee |
|---|---|---|---|---|
| Component | `AdminHeader` | `InterviewerNavBar` (`.ivd-nav` CSS) | inline in `OfficeAccountConsole` | inline in `EmployeePage` |
| Background | solid `#363EE8` | solid `--color-primary` | solid `#363EE8` | **gradient** `#363EE8 → #040E6B` |
| Height | 56 / 64px | 56 / 64px | padding-based, about 60–70px | padding-based, plus a tab row |
| Lockup | single line | single line | **stacked** ABYAN over the system name | **"Employee Self-Service Portal"** title, "Human Resources…" subtitle |
| Width | full | full | full | centred `max-w-6xl` |
| Notifications | none | none | bell + dropdown | bell + dropdown (different markup) |
| Account switch | none | none | avatar button + popover | separate circle button + popover |
| User block | avatar, name, role | avatar, name, role | name, position | "Welcome, {name}", Employee ID, no avatar |
| Logout | glass pill (`rounded-full`) | glass rectangle, 12px radius (§9.1) | glass pill | 8px-radius button, label colour inherited |
| Mobile | label hides, 44px target | label hides, 44px target | label hides | label always shown |

## What shipped

- New module `src/components/portal-header/` (`index.ts`, `README.md`, `_internal/`): `PortalHeader`, a shared `NotificationBell`, the Switch Account popover and a dismiss hook (outside click, Escape returns focus). The root carries `.abyan-ds`, so all values are tokens and the Logout label stays white (§17 item 8).
- `AdminHeader` (21 call sites) and `InterviewerNavBar` (2) are thin wrappers, so no call site changed. The Department Head console and the Employee portal render `PortalHeader` directly; the Employee tabs are its `nav` row.
- Removed the now-unused `LogoutConfirmPopover` and the `.ivd-nav` / `.ivd-brand` / `.ivd-user` / `.ivd-logout` rules.
- `DESIGN_IDENTITY.md` §17 item 9 marked resolved.

## Deviations

- The Employee header changes from a gradient to the solid §8.2 bar, full width, with the portal name replaced by the ABYAN lockup and the name/ID moved into the standard user block. The tab buttons keep their existing look as the bar's second row.
- The public site header (Landing, About, Contacts, Job Portal, applicant flow) follows §8.1, a different design with Home/About/Login links, and was not merged into `PortalHeader`. The PM demo (`/pm-demo`) is out of scope.
- On phones the notifications panel spans the viewport under the bar, because a 320px panel anchored to the bell ran off the left edge.

## Visual check

A temporary harness rendered each portal's real header configuration (admin, mock-data admin, interviewer, Department Head with bell and switch, Employee with bell, switch and tabs). Headless Edge screenshots at 1280px, 768px and 375px (in fixed-width iframes so media queries apply) confirmed: one-line lockup with the system name only at 1024px and up; name, role and divider hidden and Logout icon-only (44×44) under 640px; nothing overflows at 375px; the bell panel fits the viewport on phones; the Employee tabs wrap inside the bar. The harness was deleted afterwards.

## Checks run

`npx tsc --noEmit`, `npm run lint`, `npm test` (580 passed, 7 new for `PortalHeader`), `npm run build`.
