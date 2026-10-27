-- Tag mirrored IPCR rows with the competency the AI matcher assigned to their target.
--
-- Plan: docs/plans/2026-10-27-sor-competency-breakdown.md
--
-- Why this exists
--   `finalize_ipcr_surfaces` writes `ipcr_performance.competency_id` as NULL because
--   it had no competency tagging to copy. The gap view groups by that column, so it
--   collapsed to one null-competency row per employee and the Summary of Ratings
--   could not build a per-competency breakdown for anyone (114 employees, 2026-10-27).
--
-- What this changes
--   * `finalize_ipcr_surfaces` resolves the competency for each success indicator
--     from `ipcr_competency_matches` (same cycle) and writes its standard id + name.
--     Highest confidence wins when a target is mapped more than once.
--   * `sync_ipcr_performance_competencies()` re-tags already-mirrored rows, for the
--     normal order of operations: an IPCR is finalized first, then assessed.
--   * A trigger calls that sync whenever a match is inserted or its competency
--     changes, so no manual step is needed after an assessment run.
--
-- Why the name bridge: matches store the assessor's competency label
-- ("Fiscal Management / Budgeting for LGU"), while `competency_standards` — the
-- integer id space `ipcr_performance.competency_id` and the Competency Map use —
-- spells the same 12 names slightly differently. Both sides are normalised to
-- lower-case alphanumerics before comparing.

-- ── Sync ────────────────────────────────────────────────────────────────────
-- Scope it to one employee / one success indicator when called from the trigger;
-- both null means "every mirrored row", which is the backfill.
create or replace function public.sync_ipcr_performance_competencies(
  p_employee_id uuid default null,
  p_success_indicator_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  with mapped as (
    select mat.employee_id,
           mat.success_indicator_id,
           mat.rating_period,
           si.description,
           cs.id             as competency_id,
           cs.competency_name,
           row_number() over (
             partition by mat.success_indicator_id
             order by mat.confidence desc nulls last, mat.created_at desc
           ) as rn
      from public.ipcr_competency_matches mat
      join public.success_indicators si on si.id = mat.success_indicator_id
      join public.competency_standards cs
        on lower(regexp_replace(cs.competency_name, '[^a-zA-Z0-9]', '', 'g'))
         = lower(regexp_replace(mat.competency, '[^a-zA-Z0-9]', '', 'g'))
     where (p_employee_id is null or mat.employee_id = p_employee_id)
       and (p_success_indicator_id is null or mat.success_indicator_id = p_success_indicator_id)
  ),
  best as (
    select * from mapped where rn = 1
  )
  update public.ipcr_performance p
     set competency_id             = b.competency_id,
         mapped_competency_standard = b.competency_name
    from best b
    join public.employees e on e.id = b.employee_id
    join public.performance_cycles c on c.id::text = b.rating_period
   where p.employee_num = e.employee_number
     and p.rating_period = to_char(c.start_date, 'Mon FMDD')
                       || '-' || to_char(c.end_date, 'Mon FMDD YYYY')
     and p.target_text = b.description
     and p.ipcr_id like 'IPCR-TS-%';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.sync_ipcr_performance_competencies(uuid, uuid) from public;
grant execute on function public.sync_ipcr_performance_competencies(uuid, uuid)
  to authenticated, service_role;

comment on function public.sync_ipcr_performance_competencies(uuid, uuid) is
  'Copy the AI matcher''s competency onto already-mirrored ipcr_performance rows (employee and success indicator optional). Idempotent.';

-- ── Trigger: assessment written after the IPCR was finalized ─────────────────
create or replace function public.sync_ipcr_performance_competencies_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A match with no success indicator cannot be tied to a mirrored row; syncing
  -- with a null indicator would rescan every match the employee has.
  if new.success_indicator_id is null then
    return null;
  end if;
  perform public.sync_ipcr_performance_competencies(new.employee_id, new.success_indicator_id);
  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

revoke all on function public.sync_ipcr_performance_competencies_trigger() from public;

drop trigger if exists ipcr_competency_matches_sync_performance
  on public.ipcr_competency_matches;

create trigger ipcr_competency_matches_sync_performance
  after insert or update of competency, success_indicator_id, rating_period
  on public.ipcr_competency_matches
  for each row
  execute function public.sync_ipcr_performance_competencies_trigger();

-- ── Mirror: write the competency at finalization time ───────────────────────
-- Body below is the 20261026023000 version with the `null, null` competency
-- columns replaced by the lateral lookup in section 1, and the same values put
-- into the locked_targets payload. Every other section is unchanged.
create or replace function public.finalize_ipcr_surfaces(p_target_setting_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ts             public.target_settings%rowtype;
  v_employee_num   text;
  v_employee_name  text;
  v_office_id      uuid;
  v_office_name    text;
  v_position       text;
  v_position_id    integer;
  v_plantilla_num  integer;
  v_title          text;
  v_period         text;
  v_final_score    numeric;
  v_targets        jsonb;
  v_untagged       boolean;
  v_indicators     int;
begin
  select * into v_ts from public.target_settings where id = p_target_setting_id;
  if not found then
    return;
  end if;
  -- `is distinct from`, not `<>`: a record with a null status would make `<>`
  -- evaluate to null and slip through the guard.
  if v_ts.status is distinct from 'approved'
     or v_ts.phase2_status is distinct from 'completed' then
    return;
  end if;
  if v_ts.cycle_id is null then
    raise notice 'finalize_ipcr_surfaces: % has no cycle; skipped', p_target_setting_id;
    return;
  end if;

  -- Employee identity. Verified present on the base table 2026-10-26; there is no
  -- department_id, so the office is resolved by name below.
  select e.employee_number,
         coalesce(e.last_name, '') || ', ' || coalesce(e.first_name, ''),
         e.department,
         e.position,
         e.position_id,
         e.plantilla_num
    into v_employee_num, v_employee_name, v_office_name, v_position, v_position_id, v_plantilla_num
    from public.employees e
   where e.id = v_ts.employee_id;

  if v_employee_num is null then
    raise notice 'finalize_ipcr_surfaces: employee % has no employee_number; skipped', v_ts.employee_id;
    return;
  end if;

  select d.id into v_office_id
    from public.departments d
   where d.name = v_office_name
   limit 1;

  -- The legacy period label is derived from the cycle's own dates, not from a
  -- hardcoded map, so a new semester needs no code change:
  --   2025-01-01 … 2025-06-30  →  Jan 1-Jun 30 2025
  select c.title,
         to_char(c.start_date, 'Mon FMDD') || '-' || to_char(c.end_date, 'Mon FMDD YYYY')
    into v_title, v_period
    from public.performance_cycles c
   where c.id = v_ts.cycle_id;

  if v_period is null then
    raise notice 'finalize_ipcr_surfaces: cycle % has no dates; skipped', v_ts.cycle_id;
    return;
  end if;
  v_title := coalesce(v_title, v_period);

  -- ── 1. Legacy flat rows (Summary of Ratings, archive, gap view) ────────────
  select exists (
    select 1
      from public.ipcr_performance p
     where p.employee_num = v_employee_num
       and p.rating_period = v_period
       and coalesce(p.ipcr_id, '') not like 'IPCR-TS-%'
  ) into v_untagged;

  if v_untagged then
    raise notice 'finalize_ipcr_surfaces: % already has untagged rows for %; mirror skipped',
      v_employee_num, v_period;
  else
    delete from public.ipcr_performance p
     where p.employee_num = v_employee_num
       and p.rating_period = v_period
       and p.ipcr_id like 'IPCR-TS-%';

    insert into public.ipcr_performance (
      ipcr_id, ipcr_row_id, employee_num, position_id, position, plantilla_num,
      rating_period, function_type, target_text, accomplishment_text,
      q_rating, e_rating, t_rating, ave_rating, competency_id, mapped_competency_standard
    )
    select 'IPCR-TS-' || v_period || '-' || v_employee_num,
           'ROW-' || lpad((row_number() over (order by m.sort_order, si.sort_order))::text, 4, '0'),
           v_employee_num,
           v_position_id,
           v_position,
           v_plantilla_num,
           v_period,
           upper(m.function_type),
           si.description,
           r.accomplishment,
           r.quality,
           r.efficiency,
           r.timeliness,
           round((r.quality + r.efficiency + r.timeliness)::numeric / 3, 2),
           mc.competency_id,
           mc.competency_name
      from public.mfos m
      join public.success_indicators si on si.mfo_id = m.id
      join public.success_indicator_ratings r on r.success_indicator_id = si.id
      left join lateral (
        select cs.id as competency_id, cs.competency_name
          from public.ipcr_competency_matches mat
          join public.competency_standards cs
            on lower(regexp_replace(cs.competency_name, '[^a-zA-Z0-9]', '', 'g'))
             = lower(regexp_replace(mat.competency, '[^a-zA-Z0-9]', '', 'g'))
         where mat.success_indicator_id = si.id
           and mat.rating_period = v_ts.cycle_id::text
         order by mat.confidence desc nulls last, mat.created_at desc
         limit 1
      ) mc on true
     where m.target_setting_id = v_ts.id
       and r.quality is not null
       and r.efficiency is not null
       and r.timeliness is not null;
  end if;

  -- ── 2. Evaluations (PM dashboard, reports, 2.4, succession transfer) ───────
  select round(avg((r.quality + r.efficiency + r.timeliness)::numeric / 3), 2),
         count(*)
    into v_final_score, v_indicators
    from public.mfos m
    join public.success_indicators si on si.mfo_id = m.id
    join public.success_indicator_ratings r on r.success_indicator_id = si.id
   where m.target_setting_id = v_ts.id
     and r.quality is not null
     and r.efficiency is not null
     and r.timeliness is not null;

  if v_indicators > 0 then
    insert into public.performance_evaluations (
      employee_id, cycle_id, status, final_score, period,
      supervisor_id, submitted_at, reviewed_at, approved_at
    )
    values (
      v_ts.employee_id, v_ts.cycle_id, 'Approved', v_final_score, v_title,
      v_ts.approved_by, v_ts.phase2_submitted_at, v_ts.phase2_approved_at, v_ts.phase2_approved_at
    )
    on conflict (employee_id, cycle_id) do nothing;
  end if;

  -- ── 3. Submission tracker rows (2.2, and RSP's closed-IPCR gate) ───────────
  insert into public.ipcr_submissions (
    employee_id, employee_name, office_id, office_name, period, phase, stage, forwarded_at, updated_by
  )
  values
    (v_ts.employee_id, v_employee_name, v_office_id, v_office_name,
     v_title, 'target', 'Forwarded to PM', v_ts.approved_at, v_ts.approved_by::text),
    (v_ts.employee_id, v_employee_name, v_office_id, v_office_name,
     v_title, 'rating', 'Forwarded to PM', v_ts.phase2_approved_at, v_ts.phase2_approved_by::text)
  on conflict (employee_id, period, phase) do update
    set stage        = excluded.stage,
        employee_name = excluded.employee_name,
        office_id    = excluded.office_id,
        office_name  = excluded.office_name,
        forwarded_at = coalesce(excluded.forwarded_at, public.ipcr_submissions.forwarded_at),
        updated_by   = coalesce(excluded.updated_by, public.ipcr_submissions.updated_by),
        updated_at   = now();

  -- ── 4. Locked Targets vault (2.3 "In Vault") ───────────────────────────────
  if not exists (
    select 1 from public.locked_targets lt
     where lt.employee_id = v_ts.employee_id and lt.period = v_title
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'function_type', upper(m.function_type),
             'target_text', si.description,
             'competency_id', mc.competency_id,
             'mapped_competency_standard', mc.competency_name
           ) order by m.sort_order, si.sort_order), '[]'::jsonb)
      into v_targets
      from public.mfos m
      join public.success_indicators si on si.mfo_id = m.id
      left join lateral (
        select cs.id as competency_id, cs.competency_name
          from public.ipcr_competency_matches mat
          join public.competency_standards cs
            on lower(regexp_replace(cs.competency_name, '[^a-zA-Z0-9]', '', 'g'))
             = lower(regexp_replace(mat.competency, '[^a-zA-Z0-9]', '', 'g'))
         where mat.success_indicator_id = si.id
           and mat.rating_period = v_ts.cycle_id::text
         order by mat.confidence desc nulls last, mat.created_at desc
         limit 1
      ) mc on true
     where m.target_setting_id = v_ts.id;

    insert into public.locked_targets (
      employee_id, employee_name, office_id, office_name, period, targets,
      verified_by, verified_at, locked_by, locked_at
    )
    values (
      v_ts.employee_id, v_employee_name, v_office_id, v_office_name, v_title, v_targets,
      coalesce(v_ts.approved_by::text, 'system'), coalesce(v_ts.approved_at, now()),
      coalesce(v_ts.approved_by::text, 'system'), coalesce(v_ts.approved_at, now())
    );
  end if;
end;
$$;

revoke all on function public.finalize_ipcr_surfaces(uuid) from public;
grant execute on function public.finalize_ipcr_surfaces(uuid) to authenticated, service_role;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- No-op on the current data (no matches exist yet); the batch run re-syncs after
-- it writes them. Present so a fresh environment converges in one pass.
select public.sync_ipcr_performance_competencies();
