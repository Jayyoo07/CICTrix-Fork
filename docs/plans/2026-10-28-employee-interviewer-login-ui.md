---
title: Align Employee and Interviewer login pages
date: 2026-10-28
status: Done
summary: Match the HRIS shared sign-in button and apply the design identity to both login pages without changing authentication or layouts.
spec: Approved scope in the 2026-10-28 conversation; DESIGN_IDENTITY.md sections 4, 5, 6, 9.1, 9.3, 13 and 16.
---

# Employee and Interviewer Login UI Implementation Plan

> **For agentic workers:** Use subagent-driven-development with the two explicitly requested GPT-6.1 Sol agents at high effort. Tasks have disjoint file ownership. Do not edit shared styles, HRIS login, App.tsx, or another agent's files.

Execution recovery: the two original agents completed implementation and cross-review. Their final button-state follow-up was interrupted by quota and a server restart; attempted DeepSeek routes lacked funds. At the user's request, GPT-6.1 Sol at high effort resumes only that unfinished follow-up and final verification.

## Goal

Employee and Interviewer login pages use the same full-width, 50px, primary pill-shaped **Sign in** button as HRIS, follow the existing design identity, and retain working sign-in behavior. The user approved this scope and the two-agent execution method in chat.

## Approach

Preserve the current split layout, branding assets, portal-specific content, authentication callbacks, access checks, session handling, redirects and demo mode. Replace custom submit markup with `Button` from `src/components/Button.tsx`, using `size="lg"`, `variant="primary"`, `loading`, and `className="w-full"` inside an `.abyan-ds` scope. Use existing `src/styles/abyan-tokens.css` values, not new tokens or hard-coded colors. Preserve scope boundaries: no new backend behavior, shared-component refactor, dependencies, credential changes, or live database writes.

Rendered verification refinement: legacy `components.css` overrides the shared button's intended hover with an off-token gradient and lets the disabled fill replace its loading fill. Apply page-local state rules for `:hover:not(:disabled)` (primary-700) and `.is-loading` (gradient-button, white text, existing 70% opacity) on these two pages only. Keep the shared component/HRIS/tokens unchanged. This follows the design identity over inherited CSS, without creating a new button implementation.

**Alternatives:** A button-only replacement is smaller but leaves form and typography inconsistencies. A full redesign changes a settled layout unnecessarily. The approved approach is local design-system alignment of both existing pages. HRIS is the button reference, not authority for its other legacy drift (including its Inter font).

**Visual authority:** `DESIGN_IDENTITY.md` controls tokens, Poppins typography, 40px white inputs with 8px radii, focus rings and 1.75px Lucide strokes. Existing page layouts remain. The only login mockup found, `docs/mockups/sessions/332-1792095275/content/admin-login-layouts.html`, contains alternative admin layouts, not a chosen Employee/Interviewer design; this plan does not select a new layout.

**Architecture / stack:** React 18, TypeScript, Tailwind utilities with existing scoped CSS tokens, shared Button and ActionFeedback, Vitest and Testing Library. Each page stays independently implemented; no new module is needed.

## Review focus

- Pending sign-in keeps the label visible, marks the button busy and disables inputs, toggle and repeated submits.
- Credential failures and network failures show useful recovery guidance and permit another attempt.
- Employee success preserves its callback and session-dependent loading behavior; App.tsx continues to own dashboard, initial-password and returnTo navigation.
- Interviewer access stays denied for missing/revoked accounts; successful connected and mock sign-in preserve normalized email, callback and replace navigation.
- Keyboard users can reach and operate labeled controls with visible focus; no inert recovery or session-persistence controls remain on Interviewer.

## Steps

### Task 1: Employee login (Agent 1)

**Files:** Modify `src/modules/employee/EmployeeLoginPage.tsx`; create `src/modules/employee/EmployeeLoginPage.test.tsx`.

**Interface:** Keep `onLogin: (username: string, password: string) => Promise<void> | void` and optional `isLoading?: boolean`; preserve `readEmployeeSession()` use. Consume the shared Button without modifying it.

- [x] Write regression tests for `.btn.btn-primary.btn-lg` with the exact `Sign in` label, username/current-password autocomplete, show/hide password without submitting, empty username/password validation, callback arguments, pending local/external loading, failed credentials, retry after failure, and callback success with/without an employee session.
- [x] Run `npx vitest run src/modules/employee/EmployeeLoginPage.test.tsx`; record the expected pre-change failures for the shared-button/autocomplete assertions.
- [x] Read the impeccable craft-floor reference immediately before UI editing. Align page-local colors, form controls, type scale, icon stroke, focus and disabled styling to the identity, keeping the layout and content. Add `autoComplete="username"`. Replace the custom button and remove now-unused spinner/event handlers. Keep authentication behavior unchanged; a local busy guard is allowed to block duplicate submission.
- [x] Run the focused test file and confirm it passes. Report files, results, limitations and any behavior change to the coordinator. Do not commit while the other agent is writing; the coordinator commits reviewed work.

### Task 2: Interviewer login (Agent 2)

**Files:** Modify `src/modules/interviewer/InterviewerLogin.tsx`; create `src/modules/interviewer/InterviewerLogin.test.tsx`.

**Interface:** Keep `onLogin: (email: string, name: string) => void`; preserve access-state localStorage, active-rater checks, connected Supabase authentication, best-effort last_login update, demo bypass, safe returnTo selection and replace navigation. Mock every external call in tests; do not sign into the live project.

- [x] Write regression tests for the shared primary/large `Sign in` button, autocomplete and show/hide password, empty fields, pending/duplicate-submit protection, missing/revoked access (local and database), lookup failure, invalid credentials, 429 and network errors, missing auth user, successful connected authentication, active demo-mode access and demo notice. Verify normal dashboard navigation, safe internal returnTo, rejection of external/protocol-relative returnTo and replace semantics.
- [x] Assert that `Remember me` and the inert `Forgot password?` button are absent, with visible guidance to contact HR for access/password help.
- [x] Run `npx vitest run src/modules/interviewer/InterviewerLogin.test.tsx`; record the expected pre-change failures for shared-button and removed-inert-control assertions.
- [x] Read the impeccable craft-floor reference immediately before UI editing. Apply the same design rules as Task 1. Use `autoComplete="username"` for the email login identifier and keep `current-password`. Replace only the inert controls with honest HR contact guidance; do not invent contact details or implement password-reset/session options. Preserve existing external-call placement rather than expanding this UI task into a service-layer refactor. Use tokens for the existing demo notice.
- [x] Run the focused test file and confirm it passes. Report files, results, limitations and any behavior change to the coordinator. Do not edit Agent 1 files or commit shared workspace changes.

### Task 3: Coordinator review and verification

- [x] Review both diffs against the approved scope, each other, and the HRIS button reference. Run both new tests together with `src/components/Button.test.tsx` and fix any integration defects.
- [x] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build:verify`; distinguish pre-existing failures from regressions. No live authentication attempts without explicit authorization and suitable test credentials.
- [x] Inspect rendered Employee and Interviewer pages at mobile (390px), tablet (768px) and desktop (1366px), using HRIS for button comparison. Check computed button height/radius/font/color, default/hover/focus/disabled/loading states, input focus, keyboard order, password toggle, empty-field errors, logo/text legibility, reduced motion and no horizontal overflow. Use mocked calls for credential-dependent flows.
- [x] Run the impeccable detector once over the two changed UI targets; assess findings without broad cleanup. Complete applicable `DESIGN_IDENTITY.md` section 16 items; record inapplicable table/sidebar/modal checks as such.
- [x] Review the whole branch locally. Commit only the task-owned plan, summary, source and tests; do not stage existing untracked handoff files, scripts, SQL or context. No push or PR without confirmation.
- [x] Mark this plan Done only after checks; write `docs/session-summaries/2026-10-28-employee-interviewer-login-ui-summary.md`, recording shipped scope, deviations and verification limits. Regenerate the dashboard after every plan/summary change with the existing script.

## Risks

- Legacy global text colors and component CSS can override inherited colors; verify computed styles and use the scoped design-system rules.
- Both agents share an isolated worktree; file ownership prevents conflicts. Coordinator owns plan, summary and generated dashboard. The original checkout had switched to an unrelated ratings task, so the login branch was checked out in a native OpenCode worktree before editing.
- The branch was created from the current local branch, which reported two commits behind upstream/main. Do not silently pull, rebase or discard unrelated work.
- Live credential authentication cannot be claimed from mocked tests alone. Report this explicitly if no authorized live check is performed.
- The dashboard generator and template were already untracked user files. Use them without staging them; generated dashboard output may include pre-existing local planning entries.

## Checks to run

- `npx vitest run src/modules/employee/EmployeeLoginPage.test.tsx src/modules/interviewer/InterviewerLogin.test.tsx src/components/Button.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build:verify`
- Rendered checks and applicable `DESIGN_IDENTITY.md` section 16 checklist above.
- `& 'C:\Users\ajcbu\.config\opencode\skills\impeccable\scripts\impeccable.cmd' detect --json src/modules/employee/EmployeeLoginPage.tsx src/modules/interviewer/InterviewerLogin.tsx`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
