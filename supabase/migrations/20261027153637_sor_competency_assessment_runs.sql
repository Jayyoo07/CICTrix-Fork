-- competency_assessment_runs: Durable background work queue for matching and assessment.
--
-- Plan: docs/plans/2026-10-27-sor-previous-semester-competency.md (Step 3)
--
-- Why a queue:
--   Decouples user approvals from slow, rate-limited LLM API calls and avoids
--   lost work if a browser tab is closed. Retries and status tracking are durable.
--
-- Two stages:
--   1. 'matching'  - Enqueued on Phase 1 target settings approval. Mappings targets -> competencies.
--   2. 'assessing' - Enqueued on Phase 2 rating approval. Computes weighted scores and narrative.

create table if not exists public.competency_assessment_runs (
  id                 uuid primary key default gen_random_uuid(),
  target_setting_id  uuid not null references public.target_settings(id) on delete cascade,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  cycle_id           integer not null references public.performance_cycles(id) on delete cascade,
  stage              text not null check (stage in ('matching', 'assessing')),
  status             text not null check (status in ('pending', 'running', 'complete', 'failed')) default 'pending',
  attempts           integer not null default 0,
  last_error         text,
  requested_at       timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz,
  constraint competency_assessment_runs_ts_stage_key unique (target_setting_id, stage)
);

create index if not exists idx_competency_assessment_runs_status
  on public.competency_assessment_runs (status, requested_at);

create index if not exists idx_competency_assessment_runs_emp_cycle
  on public.competency_assessment_runs (employee_id, cycle_id);

alter table public.competency_assessment_runs enable row level security;

create policy "Allow read access to authenticated users on competency_assessment_runs"
  on public.competency_assessment_runs for select
  to authenticated
  using (true);

create policy "Allow all access to service_role on competency_assessment_runs"
  on public.competency_assessment_runs for all
  to service_role
  using (true)
  with check (true);

-- ── Enqueue Triggers ─────────────────────────────────────────────────────────

-- 1. Matching stage enqueue
create or replace function public.enqueue_competency_matching_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved'
     and new.cycle_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.competency_assessment_runs (
      target_setting_id, employee_id, cycle_id, stage, status, requested_at
    ) values (
      new.id, new.employee_id, new.cycle_id, 'matching', 'pending', now()
    )
    on conflict (target_setting_id, stage) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_competency_matching on public.target_settings;
create trigger trg_enqueue_competency_matching
  after insert or update of status on public.target_settings
  for each row
  execute function public.enqueue_competency_matching_run();

-- 2. Assessing stage enqueue
create or replace function public.enqueue_competency_assessing_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved'
     and new.cycle_id is not null
     and (new.phase2_approved_at is not null or new.phase2_status = 'completed')
     and (
       tg_op = 'INSERT'
       or (new.phase2_approved_at is not null and old.phase2_approved_at is null)
       or (new.phase2_status = 'completed' and old.phase2_status is distinct from 'completed')
       or old.status is distinct from 'approved'
     ) then
    insert into public.competency_assessment_runs (
      target_setting_id, employee_id, cycle_id, stage, status, requested_at
    ) values (
      new.id, new.employee_id, new.cycle_id, 'assessing', 'pending', now()
    )
    on conflict (target_setting_id, stage) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_competency_assessing on public.target_settings;
create trigger trg_enqueue_competency_assessing
  after insert or update of status, phase2_approved_at, phase2_status on public.target_settings
  for each row
  execute function public.enqueue_competency_assessing_run();

comment on table public.competency_assessment_runs is
  'Durable work queue tracking AI competency matching and assessment jobs.';
