---
title: Top scorer highlight summary
date: 2026-10-26
plan: docs/plans/2026-10-26-top-scorer-highlight.md
---

## What shipped

`topScorerIds()` and `<TopScorerBadge />` in `src/components/data-table/`. A top-scorer row gets a `--color-primary-50` tint, a 3px `--color-primary` left accent, and a "Top scorer" badge with a trophy icon, so the highlight never relies on colour alone. Ties are all marked. Nothing is marked when a group has no positive score, all zeros, or fewer than two applicants. Each table computes from its full group, so sorting, search, filters and pagination do not move the highlight, and it recomputes whenever scores change.

| RSP table | File | Group | Score basis |
|---|---|---|---|
| Applicant Score, per-applicant list | `src/components/QualifiedApplicantsSection.tsx` | position folder × Original/Promotional track (before search) | the overall score the list ranks by |
| Applicant Ranking, per position | `src/components/ApplicantRankingPage.tsx` | position | `total_score` |
| Applicant Ranking print popup | same file (`handlePrint`) | position | `total_score` (tint, accent and "★ Top scorer" label in print) |
| For Hiring, ranked applicants | `src/components/ForHiringPage.tsx` | plantilla | interview score, else exam score (the list's sort basis) |
| Qualified Applicants (Total Score) | `src/components/QualifiedApplicantsPage.tsx` | position, before search/tab/position filters | rounded total score |
| Ranking Report (printable) | `src/modules/admin/RSPDashboard.tsx` | position | total; replaces the fixed rank-1 yellow / ranks-2–3 blue tint and legend |
| RSP Archives, archived ranking | `src/modules/admin/rsp-archives/_internal/ArchiveListModal.tsx` | archived position | stored score |

## Not highlighted, and why

- Applicant Ranking positions overview and the Applicant Score folder table: rows are positions, not applicants.
- Point-based assessment form (print): one applicant per form, nothing to compare.
- Interviewer evaluation history: not an RSP table.
- No ranking is exported to CSV; the print popup and the printable report are the ranking exports, and both carry the highlight.

## Deviations

- Gold/silver/bronze rank medals on the Applicant Score, Applicant Ranking and For Hiring tables became one brand-blue rank chip, so "top" is signalled once (the highlight) and status colours are not used decoratively (§3.6).
- The ranking print popup now escapes applicant data before writing it into the window; it wrote names, emails and statuses from the public form into `innerHTML` unescaped.

## Checks run

`npx tsc --noEmit`, `npm run lint`, `npm test` (single top scorer, ties, no scores, single applicant, full group vs page, recompute after an edit, snapshot), `npm run build`, and a rendered check at 1100px and 375px.
