---
title: Load Phase 2 from the approved Phase 1 record
date: 2026-10-29
status: Done
summary: Keep submitted targets locked during hydration and expose Phase 2 load failures with retry.
---

## Goal

Approved Phase 1 details and their Phase 2 sheet persist across navigation and reload; submitted content remains locked.

## Approach

Pass the resolved target setting ID to Phase 2 and constrain the service lookup to that employee's approved record. Show failed loads before empty-state rendering, prevent cached drafts replacing submitted ratings, and keep Phase 1 read-only until hydration succeeds. User approved this plan.

## Steps

1. Add exact-record loading and error propagation.
2. Connect the resolved record and loading lock; show retryable errors.
3. Verify with focused tests, TypeScript, lint and build.

## Risks

- No connected browser or live database connector; missing live rows and deployment drift cannot be repaired or verified locally.
- Historical records must not be substituted for the selected cycle.

## Checks to run

- Focused Vitest regressions, TypeScript, ESLint, build, diff check.
- Regenerate the plans dashboard.

## Follow-up diagnosis

The user reported Phase 2 still absent. The workspace entry effect depends on reloadIpcrIfSafe, which changes whenever hydration updates dirty-check inputs. This retriggers full hydration and can keep Phase 2 unmounted. Stabilize effect triggers while reading the current dirty check, separate profile/IPCR banners, and add a parent-level regression. The profile PATCH 400 is a separate request; its response details are needed before changing payload mappings.
