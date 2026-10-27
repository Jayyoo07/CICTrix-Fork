-- Fix Summary of Ratings publication evaluation and roster eligibility
--
-- Plan: docs/plans/2026-10-28-fix-sor-publication-roster.md
--
-- Why:
--   1. In evaluate_sor_publication, PL/pgSQL variable 'cycle_id' clashed with
--      table column 'cycle_id' in ON CONFLICT (department_name, cycle_id),
--      causing runtime error 42702 (ambiguous column). Fixed by using
--      #variable_conflict use_column and targeting the unique constraint name
--      'on conflict on constraint ipcr_dept_pub_dept_cycle_key'.
--   2. build_ipcr_semester_roster filtered on date_hired <= cycle.end_date,
--      which captured mid-semester hires that never owed an IPCR for that
--      semester (seed migration 20261024174932 seeded date_hired <= start_date).
--      Fixed to check date_hired <= cycle.start_date.
--   3. Granted execute and select to anon and authenticated so the read-only
--      summary surface works reliably regardless of session auth state.

-- Clean out any previous partial roster/publication rows
delete from public.ipcr_department_publication;
delete from public.ipcr_semester_roster;

-- ── 1. Fix build_ipcr_semester_roster ──────────────────────────────────────────
create or replace function public.build_ipcr_semester_roster(p_cycle_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_start_date date;
  v_inserted integer := 0;
begin
  -- Idempotent: once a cycle is snapshotted, its roster is frozen.
  if exists (select 1 from public.ipcr_semester_roster r where r.cycle_id = p_cycle_id) then
    return 0;
  end if;

  select c.start_date into v_start_date
    from public.performance_cycles c
   where c.id = p_cycle_id;

  if v_start_date is null then
    return 0;
  end if;

  with eligible as (
    -- Active employees hired on or before the cycle start date
    select e.id as employee_id,
           coalesce(nullif(trim(e.department), ''), 'Unassigned') as department_name
      from public.employees e
     where e.deleted_at is null
       and e.status = 'Active'
       and (e.date_hired is null or e.date_hired <= v_start_date)
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

-- ── 2. Fix evaluate_sor_publication ───────────────────────────────────────────
create or replace function public.evaluate_sor_publication(p_department text)
returns table (
  cycle_id                  integer,
  status                    text,
  required_count            integer,
  approved_count            integer,
  assessment_complete_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_cycle record;
  v_req_count integer;
  v_app_count integer;
  v_ass_count integer;
  v_existing_status text;
  v_max_published_cycle integer;
  v_max_published_end_date date;
begin
  -- 1. Find the highest cycle ever published for this department so we never roll back
  select p.cycle_id, c.end_date
    into v_max_published_cycle, v_max_published_end_date
    from public.ipcr_department_publication p
    join public.performance_cycles c on c.id = p.cycle_id
   where p.department_name = p_department
   order by c.end_date desc, c.id desc
   limit 1;

  -- 2. Walk ended cycles from newest to oldest
  for v_cycle in
    select c.id, c.end_date, c.title
      from public.performance_cycles c
     where c.end_date <= current_date
     order by c.end_date desc, c.id desc
  loop
    -- Never walk past the highest cycle already published for this department
    if v_max_published_cycle is not null and (
      v_cycle.end_date < v_max_published_end_date
      or (v_cycle.end_date = v_max_published_end_date and v_cycle.id < v_max_published_cycle)
    ) then
      exit;
    end if;

    -- Build roster for this cycle if not yet frozen
    perform public.build_ipcr_semester_roster(v_cycle.id);

    -- Count required employees in this department
    select count(*) into v_req_count
      from public.ipcr_semester_roster r
     where r.cycle_id = v_cycle.id
       and r.department_name = p_department
       and r.owes_ipcr = true;

    if v_req_count = 0 then
      continue;
    end if;

    -- Count approved employees in this roster:
    -- Target setting approved + phase2 approved/completed + final_score recorded
    select count(distinct r.employee_id) into v_app_count
      from public.ipcr_semester_roster r
      join public.target_settings ts
        on ts.employee_id = r.employee_id
       and ts.cycle_id = v_cycle.id
      join public.performance_evaluations pe
        on pe.employee_id = r.employee_id
       and pe.cycle_id = v_cycle.id
     where r.cycle_id = v_cycle.id
       and r.department_name = p_department
       and r.owes_ipcr = true
       and ts.status = 'approved'
       and (ts.phase2_approved_at is not null or ts.phase2_status = 'completed')
       and pe.final_score is not null;

    -- Count employees with completed competency assessment
    select count(distinct r.employee_id) into v_ass_count
      from public.ipcr_semester_roster r
     where r.cycle_id = v_cycle.id
       and r.department_name = p_department
       and r.owes_ipcr = true
       and (
         exists (
           select 1 from public.employee_competencies ec
            where ec.employee_id = r.employee_id
              and ec.cycle_id = v_cycle.id
         )
         or exists (
           select 1 from public.competency_assessment_runs ar
            where ar.employee_id = r.employee_id
              and ar.cycle_id = v_cycle.id
              and ar.stage = 'assessing'
              and ar.status = 'complete'
         )
       );

    -- Check if this cycle is already in ipcr_department_publication
    select pub.status into v_existing_status
      from public.ipcr_department_publication pub
     where pub.department_name = p_department
       and pub.cycle_id = v_cycle.id;

    if v_existing_status is not null then
      -- It was previously published. If it no longer qualifies, mark correction_pending
      if v_app_count < v_req_count then
        update public.ipcr_department_publication pub
           set status = 'correction_pending',
               required_count = v_req_count,
               approved_count = v_app_count,
               assessment_complete_count = v_ass_count,
               computed_at = now()
         where pub.department_name = p_department
           and pub.cycle_id = v_cycle.id;

        return query
        select v_cycle.id, 'correction_pending'::text, v_req_count, v_app_count, v_ass_count;
        return;
      else
        -- Still qualifies as published
        update public.ipcr_department_publication pub
           set status = 'published',
               required_count = v_req_count,
               approved_count = v_app_count,
               assessment_complete_count = v_ass_count,
               computed_at = now()
         where pub.department_name = p_department
           and pub.cycle_id = v_cycle.id;

        return query
        select v_cycle.id, 'published'::text, v_req_count, v_app_count, v_ass_count;
        return;
      end if;
    end if;

    -- If this is a new cycle qualifying for publication:
    -- Only advance if it meets 100% approval and is not older than a previously published cycle
    if v_app_count >= v_req_count and (
      v_max_published_cycle is null
      or v_cycle.end_date > v_max_published_end_date
      or (v_cycle.end_date = v_max_published_end_date and v_cycle.id >= v_max_published_cycle)
    ) then
      insert into public.ipcr_department_publication (
        department_name, cycle_id, status, required_count, approved_count, assessment_complete_count, published_at, computed_at
      ) values (
        p_department, v_cycle.id, 'published', v_req_count, v_app_count, v_ass_count, now(), now()
      )
      on conflict on constraint ipcr_dept_pub_dept_cycle_key do update
        set status = 'published',
            required_count = excluded.required_count,
            approved_count = excluded.approved_count,
            assessment_complete_count = excluded.assessment_complete_count,
            computed_at = now();

      return query
      select v_cycle.id, 'published'::text, v_req_count, v_app_count, v_ass_count;
      return;
    end if;
  end loop;

  -- 3. If no cycle newly qualified during the walk, check if an existing published record exists
  if v_max_published_cycle is not null then
    return query
    select pub.cycle_id, pub.status, pub.required_count, pub.approved_count, pub.assessment_complete_count
      from public.ipcr_department_publication pub
     where pub.department_name = p_department
       and pub.cycle_id = v_max_published_cycle;
    return;
  end if;

  -- No qualifying semester found
  return;
end;
$$;

-- ── 3. RLS Policies & Grants ──────────────────────────────────────────────────
drop policy if exists "Allow read access to authenticated users on ipcr_semester_roster" on public.ipcr_semester_roster;
create policy "Allow read access to all users on ipcr_semester_roster"
  on public.ipcr_semester_roster for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow read access to authenticated users on ipcr_department_publication" on public.ipcr_department_publication;
create policy "Allow read access to all users on ipcr_department_publication"
  on public.ipcr_department_publication for select
  to anon, authenticated
  using (true);

grant select on table public.ipcr_semester_roster to anon, authenticated;
grant select on table public.ipcr_department_publication to anon, authenticated;
grant execute on function public.build_ipcr_semester_roster(integer) to anon, authenticated, service_role;
grant execute on function public.evaluate_sor_publication(text) to anon, authenticated, service_role;
