-- Fan a finalized Phase 1/2 IPCR out to every store the rest of the app reads.
--
-- Plan: docs/plans/2026-10-26-ipcr-surface-sync.md
-- Data map: docs/ipcr-data-map.md
--
-- Why this exists
--   `target_settings` and its children are the record of truth. But the Summary
--   of Ratings, the IPCR archive and the gap view read `ipcr_performance`; the
--   tracker and RSP read `ipcr_submissions`; 2.3 reads `locked_targets`; the PM
--   dashboard, PM reports and 2.4 read `performance_evaluations`. Nothing in the
--   app writes those four, so a finalized IPCR leaves them empty. Today that is
--   why the Summary of Ratings shows 0 of 130.
--
-- What this creates
--   public.finalize_ipcr_surfaces(uuid)  — idempotent fan-out for one record
--   two triggers on target_settings      — so future finalizations fan out too
--   a backfill loop                      — so the 272 existing records do now
--
-- Ownership rules
--   * ipcr_performance rows written here are tagged `IPCR-TS-<period>-<emp num>`.
--     Only tagged rows are ever deleted; if untagged rows exist for the same
--     employee and period, the mirror writes nothing and the other filing wins.
--   * performance_evaluations is inserted `on conflict do nothing`, so an
--     existing row is never overwritten.
--   * locked_targets has no unique key, so existence is checked first.
--
-- Run with `set app.ipcr_dry_run = 'on';` first to roll everything back at the
-- final assertion and confirm the counts.

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
  if v_ts.status <> 'approved' or v_ts.phase2_status <> 'completed' then
    return;
  end if;
  if v_ts.cycle_id is null then
    raise notice 'finalize_ipcr_surfaces: % has no cycle; skipped', p_target_setting_id;
    return;
  end if;

  -- Employee identity. Only columns the employees_with_department view exposes
  -- are used, so this cannot break on schema drift in the base table.
  select e.employee_number,
         coalesce(e.last_name, '') || ', ' || coalesce(e.first_name, ''),
         e.department,
         e.position
    into v_employee_num, v_employee_name, v_office_name, v_position
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
           null,
           v_position,
           null,
           v_period,
           upper(m.function_type),
           si.description,
           r.accomplishment,
           r.quality,
           r.efficiency,
           r.timeliness,
           round((r.quality + r.efficiency + r.timeliness)::numeric / 3, 2),
           null,
           null
      from public.mfos m
      join public.success_indicators si on si.mfo_id = m.id
      join public.success_indicator_ratings r on r.success_indicator_id = si.id
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
             'competency_id', null,
             'mapped_competency_standard', null
           ) order by m.sort_order, si.sort_order), '[]'::jsonb)
      into v_targets
      from public.mfos m
      join public.success_indicators si on si.mfo_id = m.id
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
grant execute on function public.finalize_ipcr_surfaces(uuid) to anon, authenticated, service_role;

comment on function public.finalize_ipcr_surfaces(uuid) is
  'Fan one finalized Phase 1/2 IPCR out to ipcr_performance, performance_evaluations, ipcr_submissions and locked_targets. Idempotent; called by trigger and by the app at Phase 2 finalization.';

-- ── Triggers ────────────────────────────────────────────────────────────────
-- Two triggers rather than one, because an INSERT trigger cannot reference OLD
-- in its WHEN clause. Both paths are guarded on the record actually being final,
-- and the function is idempotent, so a double fire is harmless.

drop trigger if exists target_settings_finalize_ipcr_upd on public.target_settings;
create trigger target_settings_finalize_ipcr_upd
  after update of phase2_status on public.target_settings
  for each row
  when (new.phase2_status = 'completed' and old.phase2_status is distinct from 'completed')
  execute function public.finalize_ipcr_surfaces(new.id);

drop trigger if exists target_settings_finalize_ipcr_ins on public.target_settings;
create trigger target_settings_finalize_ipcr_ins
  after insert on public.target_settings
  for each row
  when (new.phase2_status = 'completed')
  execute function public.finalize_ipcr_surfaces(new.id);

-- ── Backfill the 272 already-finalized records ──────────────────────────────
do $$
declare
  r          record;
  v_records  int := 0;
  v_expected int;
  v_mirrored int;
  v_subs     int;
  v_locked   int;
  v_evals    int;
  v_bad      int;
begin
  for r in
    select t.id
      from public.target_settings t
      join public.employees e on e.id = t.employee_id
      join public.performance_cycles c on c.id = t.cycle_id
     where t.status = 'approved'
       and t.phase2_status = 'completed'
       and e.employee_number is not null
     order by t.created_at
  loop
    perform public.finalize_ipcr_surfaces(r.id);
    v_records := v_records + 1;
  end loop;

  select count(*)
    into v_expected
    from public.target_settings t
    join public.employees e on e.id = t.employee_id
   where t.status = 'approved'
     and t.phase2_status = 'completed'
     and e.employee_number is not null;

  select count(distinct (p.employee_num, p.rating_period))
    into v_mirrored
    from public.ipcr_performance p
   where p.ipcr_id like 'IPCR-TS-%';

  select count(distinct (s.employee_id, s.period, s.phase))
    into v_subs
    from public.ipcr_submissions s;

  select count(*)
    into v_locked
    from public.locked_targets lt
   where lt.period in (select title from public.performance_cycles);

  select count(*)
    into v_evals
    from public.performance_evaluations pe
   where pe.cycle_id is not null;

  -- Every finalized record must be mirrored once per (employee, period), and
  -- every store must hold one row per finalized record (two for the tracker).
  if v_mirrored <> v_expected then
    raise exception 'finalize_ipcr_surfaces: mirrored % of % records', v_mirrored, v_expected;
  end if;
  if v_subs <> v_expected * 2 then
    raise exception 'finalize_ipcr_surfaces: % tracker rows, expected %', v_subs, v_expected * 2;
  end if;
  if v_locked <> v_expected then
    raise exception 'finalize_ipcr_surfaces: % vault sets, expected %', v_locked, v_expected;
  end if;
  if v_evals < v_expected then
    raise exception 'finalize_ipcr_surfaces: % evaluation rows, expected at least %', v_evals, v_expected;
  end if;

  -- No mirrored row may be unrated, out of scale, or point at a missing employee.
  select count(*)
    into v_bad
    from public.ipcr_performance p
   where p.ipcr_id like 'IPCR-TS-%'
     and (p.ave_rating is null or p.ave_rating <= 0 or p.ave_rating > 5);

  if v_bad > 0 then
    raise exception 'finalize_ipcr_surfaces: % mirrored rows have an unusable ave_rating', v_bad;
  end if;

  select count(*)
    into v_bad
    from public.ipcr_performance p
   where p.ipcr_id like 'IPCR-TS-%'
     and not exists (select 1 from public.employees e where e.employee_number = p.employee_num);

  if v_bad > 0 then
    raise exception 'finalize_ipcr_surfaces: % mirrored rows have no matching employee', v_bad;
  end if;

  if current_setting('app.ipcr_dry_run', true) = 'on' then
    raise exception 'DRY RUN OK: % records fanned out, % mirrored pairs (rolled back)', v_records, v_mirrored;
  end if;

  raise notice 'finalize_ipcr_surfaces: % records fanned out, % mirrored pairs, % tracker rows, % vault sets, % evaluation rows',
    v_records, v_mirrored, v_subs, v_locked, v_evals;
end
$$;
