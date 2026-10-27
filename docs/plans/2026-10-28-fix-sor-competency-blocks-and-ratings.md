---
title: Fix Summary of Ratings 4 Competency Blocks and Non-Submission Ratings
date: 2026-10-28
status: Done
summary: Fix PostgreSQL schema error omitting final scores, correct department casing and position title mapping to resolve official ratings, and render all four competency stream blocks instead of collapsing into a dead-end unassessed card.
spec: docs/plans/2026-10-27-sor-previous-semester-competency.md
---

## Goal

Every employee in the Summary of Ratings displays their official IPCR score (e.g. 4.33 "Very Satisfactory") instead of "— NON-SUBMISSION", the department completion landing shows 0 "no sub" entries, and expanding any employee row displays the four competency blocks (Leadership, Technical, Employee Development, Cultural Transformation) with their required and possessed proficiency levels rather than collapsing into an empty "Never assessed" panel.

## Approach

### Root Cause Analysis

1. **Ratings Showing "— NON-SUBMISSION" and "24 no sub"**:
   - In `src/lib/api/sorSemesterSource.ts`, `getPublishedRecords` queries `performance_evaluations` selecting `employee_id, final_score, remarks, status`. The `remarks` column does not exist on `performance_evaluations`, causing PostgreSQL to return error `42703 (column performance_evaluations.remarks does not exist)`.
   - `rosterRows` was queried with `.eq('department_name', departmentName)`, which is case-sensitive. The database stores `'Office of The City Accountant'` (capital T), while the frontend passes `'Office of the City Accountant'` (lowercase t).
   - Because `evalRows` failed, `numericalRating` evaluated to `null` for all employees. In `SummaryOfRatings.tsx`, `getAdjectival(null)` returns `"Non-Submission"`, and `buildDeptCompletionRows` increments `nonSubmissionCount` for null ratings, producing "24 no sub".

2. **The 4 Competency Blocks Not Showing**:
   - In `sorSemesterSource.ts`, position titles from `employees_with_department` contain parenthetical functional assignments (e.g. `'Accountant II (Pre-Audit of Transactions)'`), while `position_competency_requirements` stores the base plantilla title (`'Accountant II'`). Direct match fails, returning an empty requirements map for employees with parenthetical roles.
   - When `competencies` is empty, `CompetencyGapPanel.tsx` sets `effectiveState = 'never_assessed'` and early-returns a single slate card (`<div data-testid="never-assessed">Never assessed...</div>`), hiding the entire competency breakdown.
   - When competencies are present, `CompetencyGapPanel.tsx` renders an unorganized grid rather than grouping competencies into the four established LGU training stream pillars (Leadership, Technical, Employee Development, Cultural Transformation).

### Solution

1. **Data Layer (`sorSemesterSource.ts`)**:
   - Omit non-existent `remarks` column from `performance_evaluations` select list.
   - Use case-insensitive matching (`.ilike('department_name', departmentName)`) for `ipcr_semester_roster`.
   - Normalize position titles by stripping parentheticals (e.g. `pos.replace(/\s*\([^)]*\)/g, '').trim()`) when looking up `position_competency_requirements`.
   - Attach `training_stream` (Leadership, Technical, Employee Development, Cultural Transformation) to each competency standard.

2. **UI & Competency Stream Grouping (`CompetencyGapPanel.tsx`)**:
   - Remove the early return for `'never_assessed'` or pending state. Render an informational notice banner when unassessed, while preserving and rendering all competency cards.
   - Group competencies into the four Training Stream Blocks:
     1. **Leadership** (`Knowledge of Local Governance`, `Public Administration Principles`, `Project Management in a Public Setting`)
     2. **Technical** (`Fiscal Management / Budgeting for LGU`, `Disaster Risk Reduction and Management`, `Digital Literacy for Government Services`, `Technical Writing for Government Documents`, `Data and Records Management and Organization`)
     3. **Employee Development** (`Community Engagement Skills`, `Public Communication Skills`)
     4. **Cultural Transformation** (`Transparency and Accountability Practices`, `Ethical Conduct and Public Service Standards`)
   - If a stream has no position requirements configured, show an empty state card for that stream rather than omitting the block.

3. **Ratings & Needs Attention Summary (`SummaryOfRatings.tsx`)**:
   - Official scores like 4.33 will map to "Very Satisfactory" and clear the "no sub" warning counter.

---

## Steps

1. Update `src/lib/api/sorSemesterSource.ts`:
   - Fix `performance_evaluations` select list and case-insensitive roster lookup.
   - Add parenthetical normalization for position titles when querying the Competency Map.
   - Include `stream` / `training_stream` in the mapped `IPCRRatingRecord.competencies`.
2. Update `src/modules/admin/pm/CompetencyGapPanel.tsx`:
   - Replace the early-exit `never_assessed` render with an alert banner above the blocks.
   - Group competencies into the four training stream blocks (Leadership, Technical, Employee Development, Cultural Transformation).
   - Render position required level and possessed status ("Not yet assessed" or numeric score) in each stream block.
3. Update and run test suites:
   - `src/lib/api/sorSemesterSource.test.ts`
   - `src/modules/admin/pm/SummaryOfRatings.test.ts`
   - `src/modules/admin/pm/CompetencyGapPanel.test.ts`
4. Run smoke tests:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
5. Commit and open PR against `dehandenver/CICTrix:main`.

---

## Risks

- **Position title over-stripping**: Removing parentheticals could map specialized roles incorrectly if two distinct positions share a prefix. Mitigated by checking exact match first, then parenthetical-stripped match.
- **Competency count mismatch**: Positions with fewer than 4 streams represented will have empty stream sections. Handled by rendering an explicit "No competencies required for this role in this stream" indicator so all 4 blocks remain visible.

---

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/lib/api/sorSemesterSource.test.ts src/modules/admin/pm/SummaryOfRatings.test.ts src/modules/admin/pm/CompetencyGapPanel.test.ts`
- Live query validation against Cycle 6 records across all 5 offices.
