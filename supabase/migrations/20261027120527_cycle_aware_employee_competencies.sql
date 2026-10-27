-- employee_competencies is per employee, competency AND cycle.
--
-- The original unique key (employee_id, competency_id) left the cycle out, while
-- the assessor writes cycle_id on every row and upserts on that pair. Assessing a
-- later semester therefore overwrote the earlier one and re-stamped it with the
-- later cycle_id, so the Semester Summary of Ratings — which scopes possessed
-- scores by cycle_id — could never show more than one semester of history.
--
-- The table is empty as of 2026-10-27, so there is nothing to backfill; the old
-- key is dropped and the cycle-aware one takes its place.

alter table public.employee_competencies
  drop constraint if exists employee_competencies_employee_id_competency_id_key;

alter table public.employee_competencies
  add constraint employee_competencies_employee_id_competency_id_cycle_id_key
  unique (employee_id, competency_id, cycle_id);
