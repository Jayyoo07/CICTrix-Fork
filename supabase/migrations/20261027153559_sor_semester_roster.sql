-- ipcr_semester_roster: Frozen per-cycle roster of who owed an IPCR for each department.
--
-- Plan: docs/plans/2026-10-27-sor-previous-semester-competency.md (Step 1)
--
-- Why frozen:
--   Later hires, resignations, and transfers must not retroactively change the
--   denominator of an already-completed semester. The roster is populated once
--   per cycle and frozen; transfers across departments are not historically
--   tracked in the employees schema, so the snapshot records the department
--   as it stands at snapshot time.
--
-- Excluded reason:
--   Allows PMs to exempt an employee (e.g. study leave, secondment) with an
--   audit trail instead of having to delete or falsify records.

create table if not exists public.ipcr_semester_roster (
  id               uuid primary key default gen_random_uuid(),
  cycle_id         integer not null references public.performance_cycles(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  department_name  text not null,
  owes_ipcr        boolean not null default true,
  excluded_reason  text,
  created_at       timestamptz not null default now(),
  constraint ipcr_semester_roster_cycle_employee_key unique (cycle_id, employee_id)
);

create index if not exists idx_ipcr_semester_roster_cycle_dept
  on public.ipcr_semester_roster (cycle_id, department_name);

create index if not exists idx_ipcr_semester_roster_employee
  on public.ipcr_semester_roster (employee_id);

alter table public.ipcr_semester_roster enable row level security;

create policy "Allow read access to authenticated users on ipcr_semester_roster"
  on public.ipcr_semester_roster for select
  to authenticated
  using (true);

create policy "Allow all access to service_role on ipcr_semester_roster"
  on public.ipcr_semester_roster for all
  to service_role
  using (true)
  with check (true);

-- ── Snapshot builder ──────────────────────────────────────────────────────────
create or replace function public.build_ipcr_semester_roster(p_cycle_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_end_date date;
  v_inserted integer := 0;
begin
  -- Idempotent: once a cycle is snapshotted, its roster is frozen.
  if exists (select 1 from public.ipcr_semester_roster where cycle_id = p_cycle_id) then
    return 0;
  end if;

  select end_date into v_end_date
    from public.performance_cycles
   where id = p_cycle_id;

  if v_end_date is null then
    return 0;
  end if;

  with eligible as (
    -- Active employees hired on or before the cycle end date
    select e.id as employee_id,
           coalesce(nullif(trim(e.department), ''), 'Unassigned') as department_name
      from public.employees e
     where e.deleted_at is null
       and e.status = 'Active'
       and (e.date_hired is null or e.date_hired <= v_end_date)
    union
    -- Any employee who already has a target setting in this cycle
    select ts.employee_id,
           coalesce(nullif(trim(e.department), ''), 'Unassigned') as department_name
      from public.target_settings ts
      join public.employees e on e.id = ts.employee_id
     where ts.cycle_id = p_cycle_id
  )
  insert into public.ipcr_semester_roster (cycle_id, employee_id, department_name, owes_ipcr)
  select p_cycle_id,
         el.employee_id,
         el.department_name,
         true
    from eligible el
  on conflict (cycle_id, employee_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.build_ipcr_semester_roster(integer) from public;
grant execute on function public.build_ipcr_semester_roster(integer)
  to authenticated, service_role;

comment on table public.ipcr_semester_roster is
  'Frozen list of employees who owed an IPCR in a department for a specific cycle.';
comment on function public.build_ipcr_semester_roster(integer) is
  'Build and freeze the department roster for an ended cycle. Idempotent: returns 0 if already built.';
