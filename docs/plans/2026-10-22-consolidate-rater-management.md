---
title: One Rater Management surface, in the sidebar
date: 2026-10-22
status: Done
summary: Remove the Rater Management subtab from Qualified Applicants and bring its labelled Grant/Revoke control to the sidebar's Rater Management page, which keeps all of its existing columns and controls.
---

# One Rater Management surface, in the sidebar

## Goal

Rater Management exists twice and the two disagree. `RaterManagementSubsection`
(323 lines) is a subtab of Qualified Applicants; `RaterManagementPage` (1,013
lines) is the sidebar page at `/admin/rsp/raters`. An admin can grant or revoke
the same rater from either, and only one of them shows what positions that rater
is assigned to.

One surface, in the sidebar, with the subsection's clearer access control.

## Scope

**Qualified Applicants keeps Pending Assignment and Scheduled.** Only the
Rater Management pill and its panel are removed. The tab itself stays.

**The sidebar page keeps everything it has:** Active/Inactive KPI cards, search,
status filter, Download Rater List, Designation / Position, Access Role,
Assigned Job Position(s), Last Login, Add New Rater, and the pencil that opens
the assign-positions modal.

## What actually differs

Less than it first appears. Both already have Add Rater, a Rater Name column and
an activate/deactivate action. The difference is how that action is presented:

| | Subsection | Sidebar page |
|---|---|---|
| Access action | Labelled pill: **Grant Access** / **Revoke Access**, shield icon, colour-coded, shows "Granting…" while pending | Bare ✓ / ✗ icon, no label |
| Edit | none | pencil → assign positions |

## Approach

1. **`RaterManagementPage.tsx`** — replace the bare `XCircle`/`CheckCircle2`
   icon buttons with the subsection's labelled pill, including its pending
   state. The pencil stays beside it.
2. **`PendingAssignmentList.tsx`** — remove the Rater Management pill from the
   subtab row and the `<RaterManagementSubsection>` render. Pending Assignment
   and Scheduled are untouched.
3. **`RaterManagementSubsection.tsx`** — delete, once nothing imports it.
4. Check `RaterManagementNavigationGuide.tsx`, which mentions Rater Management
   and may point at the removed subtab.

## Risks

- ~~**`onAccessChange`**~~ **Resolved.** Both surfaces already dispatch
  `cictrix:raters-updated`, and `PendingAssignmentList` listens for it
  (lines 130–140), so the interviewer dropdown still refreshes after a grant or
  revoke made on the sidebar page. `onAccessChange` was a second, redundant
  path.
- Anyone used to granting access from Qualified Applicants now goes to the
  sidebar. One surface instead of two is the point, but it is a relearn.
- No migration, no schema change. Both components already read the same
  `raters` data through the same service layer.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- Manually: grant and revoke from the sidebar page; confirm the Qualified
  Applicants subtabs still work and the interviewer dropdown still populates.
