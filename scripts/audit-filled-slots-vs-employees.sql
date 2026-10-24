-- Filled slots vs current employees. Read-only: one SELECT, nothing is written.
-- Plan: docs/plans/2026-10-22-vacant-jobs-exclude-filled.md (pre-build check).
--
-- Compares plantilla_slots.status = 'filled' with the plantilla numbers held by
-- current employees (status Active or On Leave, not soft-deleted). The slot's
-- plantilla number is the <n> in its label "Plantilla <n>"; both sides are
-- trimmed and lose leading zeros before comparing.
--
-- Mismatch kinds:
--   held_but_not_filled  an employee holds it, but the slot is open/closed,
--                        so it would still list as a vacancy
--   filled_but_unheld    the slot is filled, but no current employee holds it
--   held_no_slot         an employee holds a number no live slot has (info only)
-- Zero rows = no mismatches.

with live_slots as (
  select ps.id as slot_id,
         ps.status as slot_status,
         jp.title,
         jp.status as posting_status,
         regexp_replace(substring(ps.label from '(?i)^\s*plantilla\s+(\d+)\s*$'), '^0+(?=\d)', '') as plantilla
    from public.plantilla_slots ps
    join public.job_postings jp on jp.id = ps.job_posting_id
   where jp.deleted_at is null
),
holders as (
  select regexp_replace(btrim(e.plantilla_num::text), '^0+(?=\d)', '') as plantilla,
         count(*) as holders,
         string_agg(e.id::text, ', ') as employee_ids
    from public.employees e
   where e.deleted_at is null
     and e.status in ('Active', 'On Leave')
     and nullif(btrim(e.plantilla_num::text), '') is not null
   group by 1
)
select 'held_but_not_filled' as mismatch, s.plantilla, s.title, s.slot_status, s.posting_status, h.employee_ids
  from live_slots s join holders h on h.plantilla = s.plantilla
 where s.slot_status <> 'filled'
union all
select 'filled_but_unheld', s.plantilla, s.title, s.slot_status, s.posting_status, null
  from live_slots s left join holders h on h.plantilla = s.plantilla
 where s.slot_status = 'filled' and h.plantilla is null
union all
select 'held_no_slot', h.plantilla, null, null, null, h.employee_ids
  from holders h left join live_slots s on s.plantilla = h.plantilla
 where s.plantilla is null
 order by 1, 2;
