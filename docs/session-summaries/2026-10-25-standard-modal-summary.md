# Standard modal — session summary

Plan: `docs/plans/2026-10-25-standard-modal.md` (In Progress, phases 1–3 of 5 done).

## Phase 1 — Foundation (2026-10-25)

**Shipped as planned**

- **New module `src/components/modal/`** (index.ts, README.md, `_internal/`):
  - `Modal`: gradient header with white title, subtitle and close; a white body that scrolls inside the panel; footer actions; sizes sm 480, md 640 and lg 880; a full-screen sheet below 640px.
  - `ConfirmModal`: 480px, with `tone="destructive"` and the §9.1 loading state.
  - `useModalBehavior`: focus in, Tab trap, Esc on the top modal only, scroll lock, and focus returned to the opener.
- **Token `--gradient-modal-header`** in `src/styles/abyan-tokens.css`.
- **DESIGN_IDENTITY.md:**
  - §3.5 gradient row
  - §9.10 rewritten as the standard anatomy
  - §9.7.1 list modal is now `size="lg"` with an inner-scrolling body
  - §14.1 token
  - §15 Do/Don't row
  - §16 checklist line
  - §17 item 13, the migration note
- **`src/components/Dialog.tsx`** now renders `Modal` with its old props, so its 30 call sites in 12 files use the new shell. The legacy `.dialog-*` CSS in `components.css` is removed.

**Deviations**

- **Optional title.** `Modal` takes an optional `title` (plus `ariaLabel`) so the 14 untitled legacy `Dialog` calls keep their own heading for now. Those calls are in App, PMCompetencyFramework, PMIPCRManagement, PMPromotionalApplications, PMDashboard, ApplicantWizard, EvaluationForm and InterviewerDashboard. They get the full header in their portal's phase. New code should always pass a title.
- **Browser Back.** It is not built into `Modal`, because it can't assume a router. Callers use `useBackClosesView`.
- **Visible change in the Dialog modals.** Buttons inside them now take the §9.1 pill style, because the modal renders in an `.abyan-ds` scope. Titled ones get the gradient header and widths become 480px (from 500px).

**Checks**

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 55 files, 502 tests. The new `Modal.test.tsx` adds 7 tests: labelled dialog, first-field focus, Esc with focus return, overlay dismiss, non-dismissible, Tab trap, scroll lock, and stacked ConfirmModal with loading.
- `npm run build`: succeeds.
- `impeccable detect` on the module: no findings.
- **Temporary harness** (removed), at 1366×768:
  - the header title computes to white, 20px/700
  - the subtitle computes to `#C8D1FF`
  - the overlay is `rgba(4,14,107,.45)`
  - the panel is 640px with a 16px radius
  - the body scrolls with the footer kept visible
  - the 480px confirmation stacks with focus on Cancel, and Esc closes only the top modal
- **Same harness at 375px:** a full-screen sheet with the footer pinned.
- **Not checked:** the real portal pages, since they need a live sign-in.

## Phase 2 — Shared dialogs and RSP (2026-10-25)

**Migrated to `Modal` / `ConfirmModal` (21 modals)**

- **Shared**
  - ConfirmLogoutDialog: `ConfirmModal`, used in every portal.
  - DocumentPreviewModal: `xl` + `flush` viewer. Extra actions and Download move to the footer.
- **Jobs**
  - JobPostingsPage Create/Edit Position, the source modal. Its overlay is now blue, and "Saving…" is replaced by the §9.1 spinner with the label kept.
  - CloseVacancyDialog: destructive `ConfirmModal` with the reason form.
  - JobVacanciesPanel Open Vacancy.
- **Scheduling and scoring**
  - ScheduleApplicantsModal.
  - PendingAssignmentList Edit Schedule.
  - QualifiedApplicantsSection: Applicant Evaluation & Scoring, Files viewer, Written Examination Scores.
- **Hiring**
  - ForHiringPage Select for Hiring (notice → confirm steps).
  - GenerateCredentialsPage: Generate confirm, Revoke (destructive) and Employee Records Created (not dismissible, since passwords show once).
  - NewlyHiredPage Generated Employee Credentials.
- **Other RSP pages**
  - CriticalPositionPage: its local `Modal` now wraps the shared one.
  - RaterManagementPage: Remove rater (destructive).
  - Recruitment and Rater Management navigation guides. Their step chips use the brand tint, because §3.6 makes green status-only.
- **RSPDashboard**
  - Change Position (both copies).
  - Reset Employee Password.
  - Assessment Forms (`xl`, `flush`, `printable`).
- **rsp-archives**
  - The list modal and the Restore and Permanently Delete dialogs. `useFocusTrap` was deleted, and the toast now sits above modals.

**Shared component additions**

- **`size="xl"` (1024px) and `flush`.** An edge-to-edge body at a fixed 88vh, for document viewers. §9.10 is updated to match.
- **`printable`.** `window.print()` prints only the modal body. The print rules are in `abyan-tokens.css`.
- **Esc handling.** `useModalBehavior` ignores an Esc that a field already handled (`defaultPrevented`), so a combobox's Esc closes its menu, not the modal.

**Left as they are, with reasons**

- **SalaryGradesPage "Edit SG" drawer.** It's a side drawer chosen in the saved mockup `docs/mockups/2026-10-15-salary-grades-drawer.html`. It is a design decision for the user, since §15 now discourages side drawers for details.
- **Unreachable code** (no importer or trigger), deleted in no phase:
  - `QualifiedApplicantsPage` (6 modals; imported in App.tsx but never rendered)
  - `EmployeeDirectory` → `EmployeeDetailPage` / `ChangePositionModal`
  - RSPDashboard's Job dialog, Rater dialog and Bulk Request (their sections route to JobPostingsPage and RaterManagementPage, or there is no caller)
  - RSPDashboard's Ranking Report and Hire Applicants (`openRankingReport` has no caller)
- **Not a modal.** The applicant details workspace in `QualifiedApplicantsPage` is a full-screen detail page (and is unreachable anyway).

**Found, not fixed (out of scope)**

- **RSPDashboard Change Position.** "Apply Position Change" only closes the modal. It saves nothing, and did not before.

**Checks**

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 55 files, 502 tests, including CloseVacancyDialog (3) and BatchScheduling (8).
- `npm run build`: succeeds.
- `impeccable detect`: only `side-tab` warnings, on existing §9.9 warning callouts. These are pre-existing and sanctioned by the guide.
- **Harness at 1366×768** (real components: Logout, Close Vacancy, Recruitment guide, Document preview, Schedule Applicants):
  - header title computed white, gradient header, blue overlay
  - widths of 480, 480, 880, 1024 and 640px
  - footers as expected
  - focus on Cancel, the first field or the date
  - Esc closes each one
- **Not checked:** printing the assessment forms (print preview can't be driven here), and the live portal pages.

## Phase 3 — L&D and Super Admin (2026-10-25)

**Migrated (10 modals)**

- **AttendanceGrid: Excuse note.** Clear is aligned left in the footer. Save Excuse is primary instead of amber, because §3.6 makes orange status-only.
- **SeminarEnrollment: Add Attendees.** The selected count sits in the footer. The error and the over-capacity checkbox move to the end of the body.
- **TrainingCalendar**
  - New/Edit Training: the footer submit targets the form by id.
  - Training details: the category, status and lifecycle badges move into the body. Cancel Training (destructive outline), Edit or Locked, and Close sit in the footer.
- **TrainingPlan**
  - Planning Window
  - New/Edit Planned Training
  - Planned training details: the badges and department/year line are in the body. Delete, Edit and Close sit in the footer. Promote stays in its body section.
  - Dismiss This Suggestion
- **SystemAdministrationPage**
  - Confirm Department Head Appointment: `ConfirmModal`, with Back as the cancel label.
  - The Appoint Department Head `Dialog`'s success view now has a title, "Department Head Appointed". The duplicate in-body heading is gone, and the header icons lose their dark inline colours.

**Left as they are**

- **Unreachable** (no importer): `TrainingCourses` (3 modals) and `TrainingEnrollmentEmailModal`.
- **Already moved in phase 1:** Super Admin's other `<Dialog>` calls, and SupervisorAccess and CompetencyFramework.

**Checks**

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 56 files, 508 tests, including SystemAdministrationPage (7). The count grew from 502 because of other uncommitted work in this worktree, which is not part of this commit.
- `npm run build`: succeeds.
- `impeccable detect`: one `side-tab` on an existing callout.
- **Not checked visually.** The L&D modals live inside components that need live data, so they weren't checked in a harness. The Super Admin confirm is covered by its tests.
