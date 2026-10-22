---
title: Match a rater to an employee account, and tell them
date: 2026-10-23
status: Done
summary: Add Rater suggests employee accounts as you type, says whether the typed account exists, and notifies the matched employee that they are now a rater/interviewer.
---

# Match a rater to an employee account, and tell them

## Goal

Ticket (ANGE): *"When adding a rater/interviewer in Rater Management, system
should state if the account is legitimate or not e.g. Account not found. Then,
system should automatically suggest name and email when typing a rater. Rater's
employee account should likewise be notified that they have been added as a
rater/interviewer."*

Three asks, one underlying problem: `addRater` currently inserts whatever name
and email are typed, with no link to an employee. Nothing can be validated and
nobody can be notified until that link exists.

## Approach

A new service, `src/lib/api/raterAccounts.ts`, owns the matching:

- `listRaterCandidates()` — active employees from `employees_with_department`
  (`id`, `employee_id`, `full_name`, `email`, `current_position`, `department`),
  loaded once when the panel opens.
- `matchRaterAccount(email, candidates)` — case- and space-insensitive email
  match, returning the employee or `null`.
- `notifyRaterAdded(employee)` — one `createNotifications()` row, type
  `rater_assigned`, linking to `/interviewer/dashboard`.

`RaterManagementPage` then:

1. **Suggests.** Both fields get a `<datalist>` of active employees. Picking a
   suggestion in either field fills the other. Typing freely still works.
2. **States legitimacy.** Under the email field, after a valid email is typed:
   matched shows the employee's name, position and department; unmatched shows
   **"Account not found. This rater has no employee account and won't be
   notified."** Per the decision of 2026-10-23, this **warns but does not
   block** — Add Rater stays enabled, so an interviewer who is not yet in the
   employees table can still be added.
3. **Notifies.** On a successful insert with a match, writes one
   `employee_notifications` row. Best-effort: a failed notification must not
   fail the add, since the rater is already created.

## Steps

1. `src/lib/api/raterAccounts.ts` with the three functions above.
2. `raterAccounts.test.ts` — matching is pure, so test it directly: casing,
   padding, no match, empty email, duplicate emails in the employee list.
3. Wire the datalist, the match line and the notify call into
   `RaterManagementPage`.

## Risks

- **RLS on `employees_with_department`.** If the RSP admin role cannot read it,
  suggestions come back empty and every email reads as "Account not found".
  Degrade quietly: when the candidate list is empty, show no verdict at all
  rather than claiming the account does not exist.
- **Email is the join key.** An employee whose `employees.email` differs from
  the address they interview under will not match. Nothing else in the data
  links a rater to an employee, so this is the only available key.
- **The notification lands in the Employee Portal inbox**, which is where
  `employee_notifications` is read. A rater who only ever opens the interviewer
  portal will not see it there.
- No migration, no schema change.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- Manually: type a known employee's name, confirm the email fills and the match
  line names their position; type a junk email, confirm the warning and that Add
  Rater still works; add a matched rater and confirm the notification row.
