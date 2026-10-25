---
title: One shared portal header
date: 2026-10-26
status: Approved
summary: Consolidate AdminHeader, the Dept Head console header, the Employee gradient header and InterviewerNavBar into one PortalHeader built to DESIGN_IDENTITY.md §8.2.
---

## Goal

Every module shows the same top bar with the same behaviour; module differences are props only.

## Approach

`PortalHeader` built to §8.2 (64px / 56px mobile, `#363EE8`, single-line lockup, avatar, name/role, divider, glass Logout with white label). Props: user name, role label, home URL, optional notifications slot, optional extra actions, logout handler (with `LogoutConfirmPopover`). Fixes §17 item 9 (stacked lockup).

## Steps

1. Document current differences between the four headers.
2. Build `PortalHeader`; make `AdminHeader` and `InterviewerNavBar` thin wrappers or replace their call sites.
3. Move Dept Head (`OfficeAccountConsole`) and Employee (`EmployeePage`) onto it, keeping notifications and Switch Account as props.
4. Verify at desktop and mobile widths for every module.

## Risks

- Employee header currently carries extra controls; they must survive as actions.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`, visual check at 1280px and 375px.
