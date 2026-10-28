---
title: Populate TNA and L&D Dashboard Data Across Active Offices
date: 2026-10-28
status: Draft
summary: Seed employee competency matches from IPCR ratings and position framework requirements, and calibrate training enrollment records so all L&D dashboard cards reflect realistic data across all 5 active offices.
---

## Goal

Ensure the L&D Dashboard and Training Needs Assessment (TNA) modules display complete, realistic data across all 5 active LGU offices and 12 Civil Service competency standards. When completed:
- The TNA summary card (KPI 1), Heatmap, and Top Priority Gaps charts will reflect assessed employee competency gaps across all 5 active offices rather than only a single employee.
- The Trainings Done summary card (KPI 3), Year-to-Date Compliance bar chart, and "Still Needs Training" roster will reflect realistic attendance across the 32 completed training sessions in 2026.
- The IDP summary card (KPI 2) and Stacked Bar Chart will optionally reflect sample submission records for 2026 across departments.

## Approach

### Root Cause
1. **Competency Framework vs. TNA Separation**: The `position_competency_requirements` table (configured with 927 rows across 196 positions) sets benchmark expectations per position title. TNA, however, computes demand from `ipcr_competency_matches` (which links an individual employee's IPCR ratings to CSC competencies). Currently, `ipcr_competency_matches` contains only 4 rows for 1 single employee (`609a48a1...`). Consequently, 4 of 5 active offices show 0% need and 8 of 12 competencies show 0 affected employees.
2. **Missing Accomplishment Linkages**: `ipcr_performance` has 760 accomplishment rows, but 0 rows have `mapped_competency_standard` or `competency_id` populated because the AI Competency Assessor batch was never run across all staff.
3. **Sparse Training Enrollments**: `training_sessions` has 41 sessions (32 completed in 2026), but `training_enrollments` only covers 30 of 202 active employees (46 marked 'Present'), leaving 186 employees (92%) with zero recorded training.

### Solution
- Create a deterministic seeding and synchronization script [`scripts/seed-lnd-dashboard-data.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-lnd-dashboard-data.mjs) supporting `--dry` and `--apply` flags.
- **Stage 1: IPCR Competency Matching**: For active employees with IPCR accomplishment records in cycle 6 (Jan–Jun 2026), compare ratings against required competencies from `position_competency_requirements`. Identify genuine development gaps (ratings < 3.5 or explicitly targeted development areas) and insert records into `ipcr_competency_matches`, tagging each with `rating_period = 'Jan - Jun 2026'`. Also update `ipcr_performance.competency_id` for affected rows.
- **Stage 2: Training Attendance Calibration**: For the 32 completed 2026 training sessions in `training_sessions`, enroll attendees from departments relevant to each session's topic and mark attendance as `Present` to establish realistic compliance (targeting ~65% met, ~20% partial, ~15% none across the 202 active staff).
- **Stage 3: Optional IDP Submissions**: Seed realistic IDP submissions in `idp_submissions` for cycle year 2026 across the 5 departments to bring KPI 2 and the IDP stacked chart to life.

## Steps

1. **Develop Data Seeding Script**: Write [`scripts/seed-lnd-dashboard-data.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-lnd-dashboard-data.mjs) with `--dry` mode and `--sql` output options.
2. **Dry Run & Inspection**: Run `node scripts/seed-lnd-dashboard-data.mjs --dry` to inspect proposed counts for `ipcr_competency_matches`, `training_enrollments`, and `idp_submissions`.
3. **Database Write Approval**: Review the generated SQL and counts with the user, and obtain explicit confirmation before applying changes to the live database.
4. **Verification**:
   - Run verification queries against `ipcr_competency_matches`, `training_enrollments`, and `idp_submissions`.
   - Verify `computeNeedsAssessment()`, `trainingCompliance()`, and `tagSelectionsByOffice()` in a verification script.
   - Run type check (`npx tsc --noEmit`) and existing test suites (`npm test`).

## Risks

- **Semester Key Mismatch**: `computeNeedsAssessment` filters `ipcr_competency_matches` against `getLndSourcePeriodKey()`. If `semester_transition_state` is updated, the rating period key format (`Jan - Jun 2026`) must match `normalizeSemesterKey()`.
- **Foreign Key Constraints**: Ensure `competency` names in `ipcr_competency_matches` match exact string names in `competency_standards`.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `node scripts/verify-lnd-dashboard-data.mjs`
