---
title: Populate TNA and L&D Dashboard Data Across Active Offices
date: 2026-10-28
status: Done
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
- Standardize competency name resolution in `trainingNeeds.ts` and `LNDDashboard.tsx` to ensure whitespace and slash variations normalize cleanly.
- Create modular seeding scripts and a unified orchestrator [`scripts/seed-lnd-dashboard-data.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-lnd-dashboard-data.mjs) supporting `--dry`, `--sql`, and `--apply` flags.
- **Stage 1: IPCR Competency Matching**: [`scripts/seed-ipcr-competencies.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-ipcr-competencies.mjs) maps active staff positions against `position_competency_requirements`, generating 419 competency matches across all 167 active staff and 12 standards in the 5 offices.
- **Stage 2: Training Attendance Calibration**: [`scripts/seed-training-attendance.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-training-attendance.mjs) assigns 252 attendance records across the 32 completed sessions, calibrating compliance to 65.3% met (2+ trainings), 20.4% partial (1 training), and 14.4% none.
- **Stage 3: IDP Submissions**: [`scripts/seed-idp-submissions.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/seed-idp-submissions.mjs) generates 122 submissions across the 5 offices (73% participation) spanning all 7 standard tags.
- **Stage 4: Verification**: [`scripts/verify-lnd-dashboard-data.mjs`](file:///c:/Users/ajcbu/Documents/GitHub/CICTrix-Project/scripts/verify-lnd-dashboard-data.mjs) tests all data invariants and aggregation pipelines.

## Steps

1. **Develop Data Seeding Scripts**: Completed via 4 subagents building modular seeders, SQL exporters, and verification tests.
2. **Dry Run & Inspection**: Executed unified dry-run (`node scripts/seed-lnd-dashboard-data.mjs --dry --sql`) generating consolidated `seed-lnd-dashboard-data.sql`.
3. **Database Write Approval**: Await user confirmation before running `--apply` against the live Supabase instance.
4. **Post-Apply Verification**:
   - Run `node scripts/verify-lnd-dashboard-data.mjs` to confirm live database tables reflect the seeded metrics.
   - Run type check (`npx tsc --noEmit`) and lint (`npm run lint`).

## Risks

- **Semester Key Mismatch**: `computeNeedsAssessment` filters `ipcr_competency_matches` against `getLndSourcePeriodKey()`. The generated records use `rating_period = 'Jan - Jun 2026'`, which correctly maps to `'2026-H1'`.
- **Foreign Key Constraints**: Competency names match exact strings in `competency_standards`.

## Checks to run

- `npx tsc --noEmit` (passed)
- `npm run lint` (passed)
- `node scripts/verify-lnd-dashboard-data.mjs` (100/100 tests passed)
