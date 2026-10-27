-- ipcr_department_publication: Tracks what semester is currently published for each department.
--
-- Plan: docs/plans/2026-10-27-sor-previous-semester-competency.md (Step 2)
--
-- Rules:
--   1. A department shows its most recent ended semester where 100% of employees who owed
--      an IPCR have approved Phase 2 ratings and final_score stamped.
--   2. Publication only ever advances to newer cycles; it never rolls back to older cycles.
--   3. If a published cycle stops qualifying because a record was reopened, status
--      becomes 'correction_pending' and the published data stays readable.

create table if not exists public.ipcr_department_publication (
  id                        uuid primary key default gen_random_uuid(),
  department_name           text not null,
  cycle_id                  integer not null references public.performance_cycles(id) on delete cascade,
  status                    text not null check (status in ('published', 'correction_pending')),
  required_count            integer not null default 0,
  approved_count            integer not null default 0,
  assessment_complete_count integer not null default 0,
  published_at              timestamptz not null default now(),
  computed_at               timestamptz not null default now(),
  constraint ipcr_dept_pub_dept_cycle_key unique (department_name, cycle_id)
);

create index if not exists idx_ipcr_dept_pub_dept on public.ipcr_department_publication (department_name);

alter table public.ipcr_department_publication enable row level security;

create policy "Allow read access to authenticated users on ipcr_department_publication"
  on public.ipcr_department_publication for select
  to authenticated
  using (true);

create policy "Allow all access to service_role on ipcr_department_publication"
  on public.ipcr_department_publication for all
  to service_role
  using (true)
  with check (true);

-- ── evaluate_sor_publication ───────────────────────────────────────────────────
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
      on conflict (department_name, cycle_id) do update
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

revoke all on function public.evaluate_sor_publication(text) from public;
grant execute on function public.evaluate_sor_publication(text)
  to authenticated, service_role;

comment on table public.ipcr_department_publication is
  'Records the single official published semester cycle for each department on Summary of Ratings.';
comment on function public.evaluate_sor_publication(text) is
  'Evaluates eligibility and returns the current published or correction_pending cycle for a department.';
