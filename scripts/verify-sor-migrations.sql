-- ============================================================================
-- scripts/verify-sor-migrations.sql
--
-- Verification test suite for Steps 1, 2, and 3 of Summary of Ratings plan:
--   - docs/plans/2026-10-27-sor-previous-semester-competency.md
--
-- Tests:
--   1. Table structure, constraints, unique keys, and index definitions
--   2. Idempotent execution of build_ipcr_semester_roster
--   3. evaluate_sor_publication logic: eligibility, newest-first, correction_pending, backward prevention
--   4. Trigger enqueue conditions on target_settings (matching & assessing)
--
-- Safe: Wrapped in a transaction that ends in ROLLBACK so no test artifacts remain.
-- ============================================================================

BEGIN;

DO $test_suite$
declare
  v_test_cycle_new integer;
  v_test_cycle_old integer;
  v_emp_a uuid := gen_random_uuid();
  v_emp_b uuid := gen_random_uuid();
  v_emp_c uuid := gen_random_uuid();
  v_emp_d uuid := gen_random_uuid();
  v_emp_old uuid := gen_random_uuid();
  v_emp_trg uuid := gen_random_uuid();
  v_ts_a uuid := gen_random_uuid();
  v_ts_c uuid := gen_random_uuid();
  v_ts_old_a uuid := gen_random_uuid();
  v_ts_old_emp uuid := gen_random_uuid();
  v_ts_trg uuid := gen_random_uuid();
  v_inserted_count integer;
  v_second_count integer;
  v_pub_rec record;
  v_count integer;
  v_dept text := '__TEST_DEPT_VERIFY__';
begin
  raise notice 'Starting SOR Migrations Verification Suite...';

  -- ──────────────────────────────────────────────────────────────────────────
  -- SECTION 1: Schema, Constraints, Indices & Functions Verification
  -- ──────────────────────────────────────────────────────────────────────────
  raise notice '[Test 1] Verifying table definitions, constraints, and indices...';

  -- 1.1 Tables exist
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ipcr_semester_roster') then
    raise exception 'Assertion failed: table ipcr_semester_roster does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ipcr_department_publication') then
    raise exception 'Assertion failed: table ipcr_department_publication does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'competency_assessment_runs') then
    raise exception 'Assertion failed: table competency_assessment_runs does not exist';
  end if;

  -- 1.2 Unique constraints exist
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'ipcr_semester_roster'
       and c.conname = 'ipcr_semester_roster_cycle_employee_key'
  ) then
    raise exception 'Assertion failed: unique constraint ipcr_semester_roster_cycle_employee_key missing';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'ipcr_department_publication'
       and c.conname = 'ipcr_dept_pub_dept_cycle_key'
  ) then
    raise exception 'Assertion failed: unique constraint ipcr_dept_pub_dept_cycle_key missing';
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'competency_assessment_runs'
       and c.conname = 'competency_assessment_runs_ts_stage_key'
  ) then
    raise exception 'Assertion failed: unique constraint competency_assessment_runs_ts_stage_key missing';
  end if;

  -- 1.3 Indices exist
  if not exists (select 1 from pg_indexes where tablename = 'ipcr_semester_roster' and indexname = 'idx_ipcr_semester_roster_cycle_dept') then
    raise exception 'Assertion failed: index idx_ipcr_semester_roster_cycle_dept missing';
  end if;

  if not exists (select 1 from pg_indexes where tablename = 'ipcr_department_publication' and indexname = 'idx_ipcr_dept_pub_dept') then
    raise exception 'Assertion failed: index idx_ipcr_dept_pub_dept missing';
  end if;

  if not exists (select 1 from pg_indexes where tablename = 'competency_assessment_runs' and indexname = 'idx_competency_assessment_runs_status') then
    raise exception 'Assertion failed: index idx_competency_assessment_runs_status missing';
  end if;

  if not exists (select 1 from pg_indexes where tablename = 'competency_assessment_runs' and indexname = 'idx_competency_assessment_runs_emp_cycle') then
    raise exception 'Assertion failed: index idx_competency_assessment_runs_emp_cycle missing';
  end if;

  -- 1.4 Functions and triggers exist
  if not exists (select 1 from pg_proc where proname = 'build_ipcr_semester_roster') then
    raise exception 'Assertion failed: function build_ipcr_semester_roster missing';
  end if;

  if not exists (select 1 from pg_proc where proname = 'evaluate_sor_publication') then
    raise exception 'Assertion failed: function evaluate_sor_publication missing';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_competency_matching') then
    raise exception 'Assertion failed: trigger trg_enqueue_competency_matching missing';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_competency_assessing') then
    raise exception 'Assertion failed: trigger trg_enqueue_competency_assessing missing';
  end if;

  raise notice '[Test 1] PASS: All tables, constraints, indices, functions, and triggers verified.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- SECTION 2: Idempotent Execution of build_ipcr_semester_roster
  -- ──────────────────────────────────────────────────────────────────────────
  raise notice '[Test 2] Testing build_ipcr_semester_roster snapshot logic and idempotency...';

  -- Create test cycle (ended in past)
  insert into public.performance_cycles (title, start_date, end_date, status)
  values ('__TEST_CYCLE_2024_H2__', '2024-07-01'::date, '2024-12-31'::date, 'Completed')
  returning id into v_test_cycle_new;

  -- Create synthetic employees with Filipino names
  -- Emp A: Active, hired before cycle end (eligible via hire date)
  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_a, 'EMP-TEST-0001', 'Juan', 'Dela Cruz', v_dept, 'Administrative Aide', 'Active', '2024-01-15'::date);

  -- Emp B: Active, hired AFTER cycle end, no target setting (NOT eligible)
  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_b, 'EMP-TEST-0002', 'Maria', 'Santos', v_dept, 'Administrative Assistant', 'Active', '2025-02-01'::date);

  -- Emp C: Active, hired AFTER cycle end, BUT already has a target setting (eligible via TS union)
  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_c, 'EMP-TEST-0003', 'Jose', 'Reyes', v_dept, 'Project Development Officer', 'Active', '2025-02-01'::date);

  insert into public.target_settings (id, employee_id, cycle_id, status, phase2_status)
  values (v_ts_c, v_emp_c, v_test_cycle_new, 'draft', 'not_started');

  -- Emp D: Resigned, hired before cycle end, no target setting (NOT eligible)
  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_d, 'EMP-TEST-0004', 'Luz', 'Bautista', v_dept, 'Clerk', 'Resigned', '2024-01-01'::date);

  -- First snapshot call
  v_inserted_count := public.build_ipcr_semester_roster(v_test_cycle_new);
  if v_inserted_count <> 2 then
    raise exception 'Assertion failed: expected 2 eligible employees inserted in roster, got %', v_inserted_count;
  end if;

  -- Verify exact members in roster
  if not exists (select 1 from public.ipcr_semester_roster where cycle_id = v_test_cycle_new and employee_id = v_emp_a and owes_ipcr = true) then
    raise exception 'Assertion failed: Emp A missing from roster';
  end if;
  if not exists (select 1 from public.ipcr_semester_roster where cycle_id = v_test_cycle_new and employee_id = v_emp_c and owes_ipcr = true) then
    raise exception 'Assertion failed: Emp C missing from roster';
  end if;
  if exists (select 1 from public.ipcr_semester_roster where cycle_id = v_test_cycle_new and employee_id = v_emp_b) then
    raise exception 'Assertion failed: Emp B should not be in roster';
  end if;
  if exists (select 1 from public.ipcr_semester_roster where cycle_id = v_test_cycle_new and employee_id = v_emp_d) then
    raise exception 'Assertion failed: Emp D should not be in roster';
  end if;

  -- Second snapshot call: must be idempotent and return 0
  v_second_count := public.build_ipcr_semester_roster(v_test_cycle_new);
  if v_second_count <> 0 then
    raise exception 'Assertion failed: second build_ipcr_semester_roster call must return 0, got %', v_second_count;
  end if;

  raise notice '[Test 2] PASS: Roster snapshot builder correctly filtered eligible employees and is idempotent.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- SECTION 3: Publication Evaluation Logic (evaluate_sor_publication)
  -- ──────────────────────────────────────────────────────────────────────────
  raise notice '[Test 3] Testing evaluate_sor_publication behavior...';

  -- 3.1 Incomplete department: Emp A has no IPCR yet, Emp C is in draft
  select * into v_pub_rec from public.evaluate_sor_publication(v_dept);
  if v_pub_rec.cycle_id is not null then
    raise exception 'Assertion failed: incomplete department must return no rows from evaluate_sor_publication';
  end if;

  -- 3.2 Fulfill 100% IPCR requirements for the department
  -- Emp A: target setting approved + phase2 completed + final_score recorded
  insert into public.target_settings (id, employee_id, cycle_id, status, phase2_status, phase2_approved_at)
  values (v_ts_a, v_emp_a, v_test_cycle_new, 'approved', 'completed', now());

  insert into public.performance_evaluations (employee_id, cycle_id, status, final_score, period)
  values (v_emp_a, v_test_cycle_new, 'Approved', 4.75, '__TEST_CYCLE_2024_H2__');

  -- Emp C: update target setting to approved + phase2 completed + final_score recorded
  update public.target_settings
     set status = 'approved',
         phase2_status = 'completed',
         phase2_approved_at = now()
   where id = v_ts_c;

  insert into public.performance_evaluations (employee_id, cycle_id, status, final_score, period)
  values (v_emp_c, v_test_cycle_new, 'Approved', 4.50, '__TEST_CYCLE_2024_H2__');

  -- 3.3 Call evaluate_sor_publication: department now qualifies!
  select * into v_pub_rec from public.evaluate_sor_publication(v_dept);
  if v_pub_rec.cycle_id <> v_test_cycle_new then
    raise exception 'Assertion failed: expected cycle % published, got %', v_test_cycle_new, v_pub_rec.cycle_id;
  end if;
  if v_pub_rec.status <> 'published' then
    raise exception 'Assertion failed: expected status published, got %', v_pub_rec.status;
  end if;
  if v_pub_rec.required_count <> 2 or v_pub_rec.approved_count <> 2 then
    raise exception 'Assertion failed: expected required=2, approved=2, got req=%, app=%', v_pub_rec.required_count, v_pub_rec.approved_count;
  end if;

  -- Confirm row was inserted in table ipcr_department_publication
  if not exists (
    select 1
      from public.ipcr_department_publication
     where department_name = v_dept
       and cycle_id = v_test_cycle_new
       and status = 'published'
  ) then
    raise exception 'Assertion failed: row missing from ipcr_department_publication';
  end if;

  -- 3.4 Reopening a record marks correction_pending
  -- Clear final_score for Emp A to simulate a reopened rating record
  update public.performance_evaluations
     set final_score = null
   where employee_id = v_emp_a and cycle_id = v_test_cycle_new;

  select * into v_pub_rec from public.evaluate_sor_publication(v_dept);
  if v_pub_rec.cycle_id <> v_test_cycle_new then
    raise exception 'Assertion failed: reopened cycle must still be returned, got %', v_pub_rec.cycle_id;
  end if;
  if v_pub_rec.status <> 'correction_pending' then
    raise exception 'Assertion failed: expected status correction_pending, got %', v_pub_rec.status;
  end if;
  if v_pub_rec.approved_count <> 1 then
    raise exception 'Assertion failed: expected approved_count=1 during correction, got %', v_pub_rec.approved_count;
  end if;

  -- Confirm table ipcr_department_publication is updated to correction_pending
  if not exists (
    select 1
      from public.ipcr_department_publication
     where department_name = v_dept
       and cycle_id = v_test_cycle_new
       and status = 'correction_pending'
  ) then
    raise exception 'Assertion failed: table ipcr_department_publication status not updated to correction_pending';
  end if;

  -- 3.5 Re-approving restores published status
  update public.performance_evaluations
     set final_score = 4.75
   where employee_id = v_emp_a and cycle_id = v_test_cycle_new;

  select * into v_pub_rec from public.evaluate_sor_publication(v_dept);
  if v_pub_rec.status <> 'published' or v_pub_rec.approved_count <> 2 then
    raise exception 'Assertion failed: expected restored published status with approved_count=2, got status=%, app=%',
      v_pub_rec.status, v_pub_rec.approved_count;
  end if;

  -- 3.6 Backward prevention: older completed cycle cannot replace newer published cycle
  insert into public.performance_cycles (title, start_date, end_date, status)
  values ('__TEST_CYCLE_2024_H1__', '2024-01-01'::date, '2024-06-30'::date, 'Completed')
  returning id into v_test_cycle_old;

  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_old, 'EMP-TEST-0005', 'Ana', 'Cruz', v_dept, 'Administrative Assistant', 'Active', '2023-01-01'::date);

  -- Provide 100% completed IPCRs for the older cycle (Emp Old and Emp A were hired <= 2024-06-30)
  insert into public.target_settings (id, employee_id, cycle_id, status, phase2_status, phase2_approved_at)
  values (v_ts_old_emp, v_emp_old, v_test_cycle_old, 'approved', 'completed', now());
  insert into public.performance_evaluations (employee_id, cycle_id, status, final_score, period)
  values (v_emp_old, v_test_cycle_old, 'Approved', 4.30, '__TEST_CYCLE_2024_H1__');

  insert into public.target_settings (id, employee_id, cycle_id, status, phase2_status, phase2_approved_at)
  values (v_ts_old_a, v_emp_a, v_test_cycle_old, 'approved', 'completed', now());
  insert into public.performance_evaluations (employee_id, cycle_id, status, final_score, period)
  values (v_emp_a, v_test_cycle_old, 'Approved', 4.60, '__TEST_CYCLE_2024_H1__');

  -- Call evaluate_sor_publication: must NOT roll back to older cycle v_test_cycle_old!
  select * into v_pub_rec from public.evaluate_sor_publication(v_dept);
  if v_pub_rec.cycle_id <> v_test_cycle_new then
    raise exception 'Assertion failed: publication rolled back to older cycle % instead of holding %',
      v_pub_rec.cycle_id, v_test_cycle_new;
  end if;

  raise notice '[Test 3] PASS: evaluate_sor_publication correctly handles qualification, correction_pending, and backward prevention.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- SECTION 4: Trigger Enqueue Conditions (competency_assessment_runs)
  -- ──────────────────────────────────────────────────────────────────────────
  raise notice '[Test 4] Testing trigger enqueue conditions for matching and assessing...';

  insert into public.employees (id, employee_number, first_name, last_name, department, position, status, date_hired)
  values (v_emp_trg, 'EMP-TEST-0006', 'Danilo', 'Mendoza', v_dept, 'Administrative Officer', 'Active', '2024-01-01'::date);

  -- 4.1 Insert target_settings as 'draft': no runs should be enqueued
  insert into public.target_settings (id, employee_id, cycle_id, status, phase2_status)
  values (v_ts_trg, v_emp_trg, v_test_cycle_new, 'draft', 'not_started');

  select count(*) into v_count
    from public.competency_assessment_runs
   where target_setting_id = v_ts_trg;
  if v_count <> 0 then
    raise exception 'Assertion failed: draft target setting should not enqueue any run, got %', v_count;
  end if;

  -- 4.2 Phase 1 approval: status becomes 'approved' -> enqueues 'matching'
  update public.target_settings
     set status = 'approved'
   where id = v_ts_trg;

  select count(*) into v_count
    from public.competency_assessment_runs
   where target_setting_id = v_ts_trg
     and stage = 'matching'
     and status = 'pending';
  if v_count <> 1 then
    raise exception 'Assertion failed: expected 1 matching run enqueued on Phase 1 approval, got %', v_count;
  end if;

  -- 4.3 Re-saving status 'approved' must not duplicate 'matching'
  update public.target_settings
     set updated_at = now()
   where id = v_ts_trg;

  select count(*) into v_count
    from public.competency_assessment_runs
   where target_setting_id = v_ts_trg
     and stage = 'matching';
  if v_count <> 1 then
    raise exception 'Assertion failed: duplicate matching run created on re-save';
  end if;

  -- 4.4 Phase 2 approval: phase2_approved_at set + phase2_status = 'completed' -> enqueues 'assessing'
  update public.target_settings
     set phase2_status = 'completed',
         phase2_approved_at = now()
   where id = v_ts_trg;

  select count(*) into v_count
    from public.competency_assessment_runs
   where target_setting_id = v_ts_trg
     and stage = 'assessing'
     and status = 'pending';
  if v_count <> 1 then
    raise exception 'Assertion failed: expected 1 assessing run enqueued on Phase 2 approval, got %', v_count;
  end if;

  -- 4.5 Re-saving Phase 2 approval must not duplicate 'assessing'
  update public.target_settings
     set updated_at = now()
   where id = v_ts_trg;

  select count(*) into v_count
    from public.competency_assessment_runs
   where target_setting_id = v_ts_trg
     and stage = 'assessing';
  if v_count <> 1 then
    raise exception 'Assertion failed: duplicate assessing run created on re-save';
  end if;

  raise notice '[Test 4] PASS: Target settings triggers enqueue matching and assessing stages without duplication.';
  raise notice 'ALL SOR MIGRATION TESTS PASSED SUCCESSFULLY!';
end;
$test_suite$;

ROLLBACK;
