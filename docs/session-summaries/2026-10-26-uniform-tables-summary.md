---
title: Readable table text and uniform table design summary
date: 2026-10-26
plan: docs/plans/2026-10-26-uniform-tables.md
---

## Reference specs (Succession Planning table, as implemented)

Container `rounded-2xl border border-slate-200 bg-white`; header row `bg-slate-50`, `th` 12px semibold UPPERCASE `tracking-wider` `text-slate-500`, `px-5 py-3`; rows `px-5 py-4`, 14px, `border-b border-slate-100`, last row borderless, hover `bg-slate-50`, no zebra; primary text `font-semibold text-slate-900`, secondary `text-xs text-slate-500/400`; status as rounded-full pills; empty state centred `text-sm text-slate-500`; no pagination. The shared layer keeps that structure and moves it onto tokens: 12px radius (§5.2), `--bg-page` header, `--neutral-600` header and muted text, `--bg-row-hover`, and the `.badge-*` classes (§9.8).

## What shipped

- `src/components/data-table/` (`index.ts`, `README.md`, `_internal/`): `.abyan-table` / `.abyan-table-wrap` styles, `TableStateRows` and `getTableView` (skeleton, error with Retry, empty), plus the Task 5 top-scorer helpers. Loaded once from `App.tsx`.
- Readability: inside a table, `text-slate-300/400/500` and `text-gray-400/500` lift to `--neutral-600`, 9–13px text lifts to 14px, and light weights lift to 500; badges and pills keep their own size and colours. Low-contrast inline colours inside tables (`#9ca3af`) became `#515F69`; inline 11–13px table text became 14px. Qualified Applicants' emerald-600 / amber-500 status text became the §3.6 700 steps.
- Responsive: every table scrolls sideways inside its card on small screens (§8.3). The interviewer tables' phone-only stacked-card mode was removed so all modules behave the same.
- `rsp-design.css`'s legacy table remap now skips `.abyan-table`.

## Tables migrated (97, by file)

- `src/components/ApplicantRankingPage.tsx` (2)
- `src/components/ApplicationsListPage.tsx` (2)
- `src/components/CriticalPositionGapAnalysisPage.tsx` (1)
- `src/components/CriticalPositionPage.tsx` (1)
- `src/components/ForHiringPage.tsx` (3)
- `src/components/GenerateCredentialsPage.tsx` (1)
- `src/components/JobPortalPage.tsx` (1)
- `src/components/JobPostingsPage.tsx` (1)
- `src/components/JobVacanciesPanel.tsx` (1)
- `src/components/LandingPage.tsx` (1)
- `src/components/NewlyHiredPage.tsx` (1)
- `src/components/OfficeDirectorySection.tsx` (2)
- `src/components/PendingAssignmentList.tsx` (2)
- `src/components/QualifiedApplicantsPage.tsx` (1)
- `src/components/QualifiedApplicantsSection.tsx` (2)
- `src/components/RaterManagementPage.tsx` (1)
- `src/components/SalaryGradesPage.tsx` (1)
- `src/components/SuccessionPlanningPage.tsx` (2)
- `src/modules/admin/AttendanceGrid.tsx` (1)
- `src/modules/admin/CompetencyFrameworkPage.tsx` (2)
- `src/modules/admin/IPCRManagementPage.tsx` (3)
- `src/modules/admin/LNDDashboard.tsx` (1)
- `src/modules/admin/LndArchive.tsx` (2)
- `src/modules/admin/LndIdpFormSettings.tsx` (1)
- `src/modules/admin/LndTrainingNeeds.tsx` (2)
- `src/modules/admin/PMDashboard.tsx` (3)
- `src/modules/admin/PmDashboardOverview.tsx` (2)
- `src/modules/admin/RSPDashboard.tsx` (5)
- `src/modules/admin/RspDashboardOverview.tsx` (2)
- `src/modules/admin/SupervisorAccessPage.tsx` (1)
- `src/modules/admin/SystemAdministrationPage.tsx` (2)
- `src/modules/admin/TrainingCalendar.tsx` (1)
- `src/modules/admin/TrainingCourses.tsx` (2)
- `src/modules/admin/components/EmployeeListByPosition.tsx` (1)
- `src/modules/admin/components/TrainingEvaluationReport.tsx` (3)
- `src/modules/admin/pm/IpcrArchiveSemester.tsx` (1)
- `src/modules/admin/pm/OfficeAccountConsole.tsx` (3)
- `src/modules/admin/pm/OfficeTrainingCourses.tsx` (1)
- `src/modules/admin/pm/PMCompetencyFramework.tsx` (2)
- `src/modules/admin/pm/PMIPCRManagement.tsx` (3)
- `src/modules/admin/pm/PMMasterControlPanel.tsx` (2)
- `src/modules/admin/pm/PMPromotionalApplications.tsx` (3)
- `src/modules/admin/pm/PMReportsAnalytics.tsx` (6)
- `src/modules/admin/pm/demo/AccountManagement.tsx` (1)
- `src/modules/admin/pm/demo/PMWorkflow.tsx` (3)
- `src/modules/admin/pm/demo/SupervisorReview.tsx` (1)
- `src/modules/admin/prototypes/TrainingCoursesPrototype.tsx` (1)
- `src/modules/admin/rsp-archives/_internal/ArchiveListModal.tsx` (1)
- `src/modules/admin/rsp-archives/_internal/RspArchives.tsx` (1)
- `src/modules/employee/EmployeePage.tsx` (1)
- `src/modules/employee/EmployeePhase2.tsx` (1)
- `src/modules/interviewer/EvaluationForm.tsx` (2)
- `src/modules/interviewer/InterviewerApplicantsList.tsx` (1)
- `src/modules/interviewer/InterviewerDashboard.tsx` (2)
- `src/modules/interviewer/InterviewerDashboardParts.tsx` (1)

Mechanical changes (class names, wrapper card) were made with a codemod and reviewed per file; inline-styled tables (`moduleUi` `ui.th`/`ui.td` and the local `th`/`td` objects in Supervisor Access and System Administration), the bespoke `ivd-table`, `rd-table`, `pd-tbl`, `pcpt-table` and `oral-table`, and the RSP score tables were migrated by hand.

## Not migrated, and why

- Ranking print popup (`ApplicantRankingPage.handlePrint`) and the L&D training evaluation report (`LndTrainingEvaluation.exportReport`): HTML strings written into a print window with their own print stylesheet (black-bordered document layout). The ranking popup carries the top-scorer highlight.
- Loading, error and empty bodies: the score tables use `TableStateRows`; the other tables keep their existing `table-loading` skeletons and empty rows. Showing an error row needs the fetch layer to report failures instead of returning `[]`, which is the read-failure pass in Task 2 (shared with Jayyoo07's in-progress plan).

## Contrast (scripts/table-contrast.mjs)

| When | Text | Foreground | Background | Ratio | AA body (4.5:1) |
|---|---|---|---|---|---|
| before | Secondary text, text-slate-400 / #94a3b8 (emails, dates, positions) | `#94A3B8` | `#FFFFFF` | 2.56:1 | FAIL |
| before | Null-score dash, text-slate-300 | `#CBD5E1` | `#FFFFFF` | 1.48:1 | FAIL |
| before | Secondary text, text-gray-400 | `#9CA3AF` | `#FFFFFF` | 2.54:1 | FAIL |
| before | Header, text-slate-400 on bg-slate-50 (PM IPCR tables) | `#94A3B8` | `#F8FAFC` | 2.45:1 | FAIL |
| before | Header, text-slate-500 on bg-slate-50 (Succession, most tables) | `#64748B` | `#F8FAFC` | 4.55:1 | pass |
| before | Header, text-gray-500 on bg-gray-50 (L&D tables) | `#6B7280` | `#F9FAFB` | 4.63:1 | pass |
| before | Body, text-slate-500 on white | `#64748B` | `#FFFFFF` | 4.76:1 | pass |
| after | Muted text, --neutral-600 on white | `#515F69` | `#FFFFFF` | 6.58:1 | pass |
| after | Header, --neutral-600 on --bg-page | `#515F69` | `#F1F5F9` | 6.01:1 | pass |
| after | Muted text on row hover, --neutral-600 on --bg-row-hover | `#515F69` | `#F8FAFF` | 6.30:1 | pass |
| after | Muted text on top-scorer row, --neutral-600 on --color-primary-50 | `#515F69` | `#EEF0FF` | 5.81:1 | pass |
| after | Body, --neutral-800 on white | `#28343D` | `#FFFFFF` | 12.74:1 | pass |
| after | Body on top-scorer row, --neutral-800 on --color-primary-50 | `#28343D` | `#EEF0FF` | 11.25:1 | pass |
| after | Primary text, --color-primary-900 on top-scorer row | `#040E6B` | `#EEF0FF` | 14.48:1 | pass |
| after | Top scorer badge, white on --color-primary | `#FFFFFF` | `#363EE8` | 6.97:1 | pass |
| after | Error title, --error-700 on white | `#B42323` | `#FFFFFF` | 6.55:1 | pass |

## Visual check

A temporary harness rendered codemod output from legacy Tailwind markup, a legacy PM table (`text-xs`, `text-slate-400` headers), a migrated `moduleUi` inline-style table, a ranking with a tied top score, and the empty and error states, at 1100px and 375px (fixed-width iframes). It caught and fixed three issues: `.abyan-cell-primary`'s `display: block` overriding a flex name row, `rsp-design.css` keeping legacy grey headers at (0,4,0), and global `<p>` margins making legacy rows uneven. Each migrated screen was not opened signed-in: the portals need a live session, and every page load runs background writers against the live database (see the final report), so screens were checked through the harness, type-check and tests.

## Checks run

`npx tsc --noEmit`, `npm run lint`, `npm test` (592 passed), `npm run build`, `node scripts/table-contrast.mjs`.
