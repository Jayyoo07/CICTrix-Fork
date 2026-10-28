---
title: Configure PM Competency Framework for All Positions
date: 2026-10-28
status: Done
summary: Map all active employee and plantilla/job posting positions into the PM Competency Framework across the 12 LGU competency standards using base-title inheritance and Philippine Civil Service functional archetypes.
---

## Goal

Every position in the system—spanning active employees in `employees_with_department` and open vacancies in `job_postings` (195 unique active positions)—has a configured benchmark in `position_competency_requirements`. The Competency Map grid in PM Module 3 displays complete coverage across all 12 LGU standards with no blank rows, and the Summary of Ratings gap analysis displays accurate Required vs. Possessed evaluations without falling back to "Required level not configured".

## Approach

The backfill combines direct inheritance with standard Philippine Civil Service Commission (CSC) LGU job family archetypes:

1. **Hierarchy of Sources**:
   - **Stage 1 (Direct & Qualification Standards)**: Preserve all existing 57 curated Map rows. Apply real levels from `qualification_standards` (29 rows) to matching titles.
   - **Stage 2 (Base Title Inheritance)**: Employee and plantilla titles with parenthetical qualifiers or standardized variations (e.g. `Accountant II (General Fund Accountant)`, `Engineer II (Civil Engineer)`, `Administrative Officer IV (HRMO II)`) inherit requirements from their normalized base titles (`Accountant II`, `Engineer II`, `Administrative Officer IV`).
   - **Stage 3 (CSC LGU Functional Archetypes)**: Unmapped positions are classified into 5 functional tiers and assigned targeted competency requirements from the 12 standards:
     - *Executive / Department Head / Assistant Head*: Standards 1, 2, 4, 5, 6, 9, 12 at Advanced; Standard 10 at Intermediate.
     - *Supervisory / Division Chief*: Standards 1, 2, 4, 6, 10, 11 at Intermediate; Standard 9 at Advanced; plus department-specific stream competencies.
     - *Professional & Technical*: Health/Social Work (3, 7, 9, 11, 12 at Intermediate); Engineering/Architecture (1, 4, 7, 9, 10, 11 at Basic/Intermediate); Finance/Supply (1, 5, 6, 9, 10, 11 at Basic/Intermediate); IT (4, 8, 9, 11 at Intermediate/Advanced); Legal (2, 6, 9, 10, 11 at Intermediate/Advanced).
     - *Administrative Support & Clerical*: Standards 8, 9, 10, 11, 12 at Basic/Intermediate.
     - *Trades, Crafts, Labor & Protective Services*: Standards 6, 7, 9 at Basic; Standards 7 & 12 at Basic for Drivers and Security.

2. **Delivery & Audit**:
   - Deliver `scripts/configure-competency-framework.mjs` supporting `--dry` reporting and live upserting.
   - Generate `configure-competency-framework.sql` containing idempotent insert statements (`ON CONFLICT (position_title, competency_id) DO NOTHING`).
   - All newly generated rows are tagged `source='auto-synced'`, leaving existing `manual` rows untouched and allowing PM Admins to review and curate in the UI.

## Steps

1. **Write `scripts/configure-competency-framework.mjs`**:
   - Load existing `position_competency_requirements`, `qualification_standards`, `competency_standards`, `employees_with_department` (status = 'Active'), and `job_postings`.
   - Implement the normalizer, inheritance resolver, and archetype classifier.
   - Support `--dry` outputting detailed position-by-position statistics.
   - Export SQL file generation (`configure-competency-framework.sql`).
2. **Run dry-run audit and generate report**:
   - Run `node scripts/configure-competency-framework.mjs --dry`.
   - Verify that 100% of the active 195 positions receive valid competency mappings.
3. **User confirmation gate for database write**:
   - Present the dry-run summary artifact and SQL script to the user for explicit write confirmation.
4. **Execute live backfill**:
   - Execute the live insertion via script or generated SQL.
5. **Verify live database and UI**:
   - Verify row count in `position_competency_requirements`.
   - Run read queries confirming 0 unmapped active positions remain.
   - Check PM Competency Framework and Summary of Ratings gap panels.

## Risks

- **Overwriting curated rows**: Mitigated by `ON CONFLICT DO NOTHING` / `ignoreDuplicates: true` and preserving any existing `source='manual'` rows.
- **Inappropriate levels for specific specialist roles**: Mitigated by tagging all generated rows with `source='auto-synced'`, which highlights them in the UI for PM review and flips to `manual` on PM save.

## Checks to run

- `node scripts/configure-competency-framework.mjs --dry`
- `node scripts/audit-competency-map-sync.mjs`
- `npx tsc --noEmit`
- `npm test`
