---
title: Appoint Department Head Modal Redesign
date: 2026-10-21
status: Done
summary: Redesign the department head appointment modal in System Administration with executive hierarchy, office-first selection, search-first combobox, real-time title mapping preview, SSO reassurance, Option B confirmation dialog, and pill buttons.
---

# Appoint Department Head Modal Redesign Implementation Plan

Target User Role: Super Admin (`/admin/system-admin`)  
Target File: `src/modules/admin/SystemAdministrationPage.tsx`  
Test File: `src/modules/admin/SystemAdministrationPage.test.tsx`  

---

## 1. Goal & Context

Refactor the department head appointment modal (`AddPersonnelModal`) in the System Administration module to eliminate confusing legacy patterns, elevate visual hierarchy, provide search-first personnel selection, and ensure administrative certainty before committing executive role assignments.

Key requirements:
1. Executive Header: Rename dialog from "Add Personnel" to "Appoint Department Head" with descriptive subtitle and executive badge icon.
2. Office-First Selection: Move Office dropdown to the top. Display vacancy indicators (`Vacant` vs `Occupied`). Retain incumbent detection and transfer redirection.
3. Search-First Combobox: Replace native employee `<select>` with a searchable combobox featuring avatar initials, name, employee number, position, and departmental grouping (matching staff in the chosen office listed first).
4. Promotion & Title Preview Card: Replace the dead "Role" input with a live preview card showing the official office head position from `OFFICE_HEAD_POSITIONS` (e.g. `Head of Information Technology`, `City Engineer`) and database sync action note.
5. SSO Reassurance Copy: Remove temporary password generator text. Clearly state that the employee logs in with existing credentials and access is granted via the profile switcher.
6. Confirmation Dialog (Option B): Intercept the final submit with a 480px stacked confirmation dialog summarizing the appointment, mapped official title, and switcher access before executing `createAssignment()`.
7. Success State: Replace credentials copy box with a clean success notification and a single "Done" action button.
8. Design System Tokens: Implement CICTrix pill buttons (`border-radius: 999px`) across all actions in the modal.

---

## 2. Settled Decisions

| # | Topic | Decision | Details |
|---|---|---|---|
| D1 | Modal Identity | Executive Appointment | Rename dialog to "Appoint Department Head" with subtitle: "Assign executive leadership and activate department dashboard privileges." |
| D2 | Field Hierarchy | Office First, Staff Second | Office selection precedes employee selection. Office dropdown shows live status tags. |
| D3 | Staff Picker | Search-First Combobox | Replace `<select>` with combobox supporting text filtering, keyboard navigation (Up, Down, Enter, Esc), avatar initials, and department prioritization. |
| D4 | Promotion Preview | Title Mapping Card | Remove dead "Role" field. Display dynamic title lookup from `OFFICE_HEAD_POSITIONS[officeName]` and note that promotion is recorded in `position_history`. |
| D5 | Authentication | Single Identity Notice | Remove temporary password copy. State that existing credentials are used with the profile switcher. |
| D6 | Confirmation Layer | Option B Stacked Dialog | Modal-over-modal confirmation dialog (480px) displaying appointment details before calling API. |
| D7 | Action Styling | Pill Buttons | Apply CICTrix pill buttons (`border-radius: 999px`) for Cancel, Appoint, Back, and Done actions. |

---

## 3. Subagent Execution Strategy

In accordance with user preferences and model delegation rules:
- Model: Gemini 3.8 Flash
- Effort: High
- Three specialized subagent lanes:

### Subagent 1: UI Combobox & Office Selection Layer
- Target: `src/modules/admin/SystemAdministrationPage.tsx`
- Tasks:
  - Implement `SearchableEmployeeCombobox` component with input search, clear button, dropdown list filtered by query, avatar initials, position subtitle, and priority grouping for staff already in the selected office.
  - Implement selected employee chip with avatar, title, and "Change" action.
  - Reorder modal fields to place Office selection first with vacancy status badge.
  - Retain active incumbent warning and "Go to Transfer Flow" button.

### Subagent 2: Title Mapping Preview, SSO Copy, Confirmation Dialog & Success View
- Target: `src/modules/admin/SystemAdministrationPage.tsx`
- Tasks:
  - Remove dead non-editable "Role" input and temporary password copy.
  - Integrate live `Promotion & Database Sync Preview Card` reading `OFFICE_HEAD_POSITIONS[officeName]`.
  - Add Single Sign-On reassurance callout.
  - Implement `AppointmentConfirmDialog` (Option B stacked confirmation dialog) triggered on primary action click.
  - Implement post-submission success view (replaces username/password box with success banner and "Done" pill button).
  - Apply pill button styling (`border-radius: 999px`) across all modal actions.

### Subagent 3: Test Suite & Verification Layer
- Target: `src/modules/admin/SystemAdministrationPage.test.tsx`
- Tasks:
  - Test T1: Modal renders with "Appoint Department Head" title and Office field first.
  - Test T2: Selecting an occupied office displays incumbent warning and transfer flow trigger.
  - Test T3: Employee combobox filters staff and prioritizes office members.
  - Test T4: Dynamic official title from `OFFICE_HEAD_POSITIONS` appears in preview card.
  - Test T5: Clicking appoint triggers Confirmation Dialog (Option B) with appointee and title details.
  - Test T6: Confirming appointment calls `createAssignment` and renders single identity success view without password boxes.
  - Full verification: `npx tsc --noEmit` and `npm test`.

---

## 4. Verification Plan

1. Automated Tests:
   - Run `npm test -- src/modules/admin/SystemAdministrationPage.test.tsx`
   - Run `npm test -- src/lib/api/officeRoles.test.ts`
2. Static Analysis:
   - Run `npx tsc --noEmit`
3. UI Preview Verification:
   - Verify alignment with `docs/mockups/sessions/modal-critique/content/dept-head-modal-critique.html`.
