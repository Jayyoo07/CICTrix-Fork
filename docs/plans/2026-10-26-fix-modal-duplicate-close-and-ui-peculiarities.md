---
title: Fix duplicate modal close buttons and UI peculiarities
date: 2026-10-26
status: Done
summary: Unify IPCR phase open/close confirmation modals, eliminate duplicate X close buttons, fix non-existent Tailwind utility classes, and standardize modal patterns to ABYAN design tokens.
---

## Goal

Phase 1 and Phase 2 confirmation modals display a single, accessible close button, share a consistent ABYAN modal appearance across Probationary and Regular panels in `PMIPCRManagement`, eliminate broken/fabricated Tailwind color utilities across admin views, and retire browser-native blocking alerts in favor of in-app feedback.

## Approach

- **Double X Root Cause**: In `PMIPCRManagement.tsx`, `ProbationaryPanel` modals render custom header bars containing a `<button>✕</button>` inside the modal children, while `Dialog.tsx` automatically renders a `.dialog-close` button (`×`) whenever a `title` prop is passed. Furthermore, `ProbationaryPanel` and `RegularPanel` duplicate their modal logic and JSX with divergent styling (one with colored icon badges and manual ✕, the other with basic `Dialog` titles and non-existent `text-slate-650`).
- **Phase Modal Consolidation**: Lift phase open/close confirmation modals into a single shared component (`PhaseConfirmDialog`) in `PMIPCRManagement.tsx` used by both Probationary and Regular tabs. Ensure exactly one close button exists (relying on `Dialog`'s built-in header close button or a custom header, never both).
- **Tailwind Utility Corrections**: Replace non-existent classes (`text-slate-650` → `text-slate-600`, `border-slate-150` → `border-slate-200`, `text-slate-550` → `text-slate-500`, `text-slate-805`/`text-slate-850` → `text-slate-800`/`text-slate-900`, `hover:bg-slate-55/30` → `hover:bg-slate-50`, `text-slate-350`/`355` → `text-slate-400`) in `PMIPCRManagement.tsx`, `OfficeAccountConsole.tsx`, and `EmployeePage.tsx`.
- **Button & Color Token Alignment**: Align dialog buttons with `DESIGN_IDENTITY.md` tokens (`.btn .btn-primary`, `.btn .btn-secondary`) instead of ad-hoc hex styles (`bg-[#363EE8]`, `bg-rose-600`).
- **Browser Dialog Audit**: Replace raw `alert()` calls in phase toggles with `ActionFeedback` or toast notifications.

## Steps

1. Create a unified `PhaseConfirmModal` inside `PMIPCRManagement.tsx` (or extracted component) with single close action, clean icon badge, clear descriptive copy, and ABYAN button tokens.
2. Replace duplicated modal code in `ProbationaryPanel` and `RegularPanel` with the unified component.
3. Clean up non-existent Tailwind classes across `PMIPCRManagement.tsx`, `OfficeAccountConsole.tsx`, and `EmployeePage.tsx`.
4. Fix `InterviewerDashboard.tsx` delete confirmation dialog which also manually duplicates a modal header inside `<Dialog>`.
5. Run type checks, lint, and tests.

## Risks

- Removing duplicate buttons or lifting modal state must ensure ESC and backdrop clicks still dismiss cleanly.
- Tailwind class replacements must maintain contrast ratios per `DESIGN_IDENTITY.md` §16.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Manual inspection of Phase 1 and Phase 2 Open/Close modals on both Probationary and Regular tabs.
