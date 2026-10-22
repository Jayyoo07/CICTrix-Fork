---
title: One plantilla per position; vacant/filled derived from current employees
date: 2026-10-21
status: Deferred
summary: Undo the same-title posting merge so every position holds exactly one plantilla, derive vacant/filled from current employees through one position_occupancy view, and make the Job Vacancies tab, public vacancy table, Job Positions list and RSP dashboard read only from it. Opening a filled position is blocked in the database.
---

> **Deferred 2026-10-22.** `docs/plans/2026-10-22-vacant-jobs-exclude-filled.md` keeps `plantilla_slots.status = 'filled'` as the rule for now (frontend only). D2 below ("filled/vacant is never stored") does not apply until this plan is picked up again.

## Goal

A filled position never shows as a vacancy anywhere. A position is **filled** when a current employee (status `Active` or `On Leave`, `deleted_at` null) has its plantilla number in `employees.plantilla_num`; otherwise it is **vacant**. A **Job Vacancy** is a vacant position whose posting is `Open` with a deadline that has not passed. Each position holds exactly one plantilla.

## Decisions

| # | Decision |
|---|---|
| D1 | One position = one `job_postings` row = one `plantilla_slots` row. Enforced by `unique (job_posting_id)` on `plantilla_slots`, plus a unique index on the plantilla number so no two positions share one. The number stays on the slot because applications link to slots. |
| D1a | The plantilla number is the `<n>` in the slot label `Plantilla <n>`. `item_number` is an internal `PLT-…` key on every live slot (audit 2026-10-21: 155 of 155) and never matches an employee. `employees.plantilla_num` is `varchar(50)`; both sides are trimmed and lose leading zeros before comparing. Audit: 110 of 110 current employees match on the label number. |
| D2 | Filled/vacant is never stored. `plantilla_slots.status` and posting `Closed` no longer decide it. |
| D3 | Current employee = `status in ('Active','On Leave')` and `deleted_at is null`. No `plantilla_num` = fills nothing. No matching on title or office. |
| D4 | One view, `position_occupancy` (security invoker), is the only definition. The employee lookup sits in `plantilla_is_filled(text)`, a SECURITY DEFINER function returning only a boolean, so the anonymous portal learns "filled or not" without being able to read `employees`. |
| D5 | Deadlines compare against the Manila date, not the server's UTC date, so a posting doesn't stay listed for eight hours past its last day. |
| D6 | Opening a filled position is rejected by a BEFORE trigger on `job_postings` with `position_filled: This position is already filled and cannot be opened as a vacancy.` A duplicate open vacancy can't exist under D1 (one row per position). |
| D7 | Reserving (For Contract Signing, migration 20261021200100) doesn't fill a position. A reservation on a filled plantilla is rejected by a trigger. Revoking a reservation reopens nothing because reserving closed nothing. |
| D8 | When a current employee takes a plantilla (insert or update of `plantilla_num`, `status`, `deleted_at`), an AFTER trigger closes that position's open posting. If the employee row is a hire (its id is an applicant id, as `syncNewlyHiredToEmployees` writes it), the trigger also marks the slot filled by that applicant, which fires `trg_archive_others_on_slot_fill` from 20261021200100: other applicants are archived as Not Selected and see the regret letter. A direct assignment with no applicant closes the posting but archives nobody. |
| D9 | Applicant limits are unchanged. The only uniqueness stays one application per person per plantilla (`uq_applicants_one_per_plantilla`, `uq_application_plantilla_pair`), which under D1 is one per person per position. |
| D10 | The hire path writes the plantilla number of the hired applicant's slot (from its label, D1a) onto the new employee's `plantilla_num` in the same insert (`src/lib/hiredApplicantSync.ts`). `newly_hired.plantilla_item_number` holds the internal key, so it isn't used. |
| D11 | Posting writes for open/close go through a single-row service call, not the whole-list upsert, so one rejected row can't fail every other save. |

## Approach

Two migrations, committed straight to `main` (user's instruction, 2026-10-21) as two sequential commits and deploys. A push to `main` applies the migration and deploys Vercel.

1. **Split** (`split_merged_postings`): data only. Writes the backup tables first, moves each extra plantilla back to the soft-deleted posting it came from, repoints that plantilla's applications, restores those postings. One transaction; aborts on any ambiguity. **Gate 1:** audit blocks 4 and 4b show no ambiguous rows.
2. **Occupancy** (`position_occupancy`): the unique index, the view, the triggers, and closing filled positions left `Open` (previous status kept in `_occupancy_backup_postings`). This switches the rule on. **Gate 2:** audit blocks 2 and 5a–5c show the incumbents are linked. It also needs 20261021200100 on `main` first.

The frontend ships with commit 2. Audit queries: `scripts/audit-position-occupancy.sql`.

## Steps

1. Wait for the other session's work in this worktree (20261021200100, `LandingPage.tsx`, `ForHiringPage.tsx`) to be committed. Commits go from a detached worktree at `origin/main`, so no branch and none of this branch's unrelated work is pushed.
2. `npx supabase migration new split_merged_postings`; paste Appendix A. Rollback file in `supabase/rollbacks/` (Appendix B). Tested on a local Postgres copy (PGlite): split, re-run, exact rollback, both aborts, rollback refusal after new activity.
3. Gate 1; then commit, push `main`, check the deploy, and run audit blocks 2–4 again to confirm.
4. `npx supabase migration new position_occupancy`; paste Appendix C.
5. `src/lib/positionOccupancy.ts`: read `position_occupancy`; `loadJobPostings` attaches `occupancy` to each `JobPosting`. Service calls `openPositionAsVacancy(id, deadline)` and `closePositionVacancy(id)` write one row and return the database message.
6. `vacancySearch.ts`: `isOpenVacancy`, `vacancyEligibility` and a `sortPositionsVacantFirst` helper read `job.occupancy`. Drop `'Filled'` from `JobPosting['status']` and the `Filled → Closed` mapping in `recruitmentData.ts`; fix the callers (`JobPostingsPage`, `RSPDashboard.tsx:413`).
7. Job Vacancies tab and badge: `isOpenVacancy` only.
8. Job Positions list: Status badge (§10 Success "Vacant" / Neutral "Filled"), "Open for applications" when it is an open vacancy, otherwise an "Open as Vacancy" Small primary button, disabled on filled with the tooltip "An employee currently holds this plantilla". Vacant first, then title. Status filter All / Vacant / Filled. Search by title or plantilla unchanged. Layout follows `docs/mockups/2026-10-19-job-post-split.html`.
9. Public table (`LandingPage.tsx`): `isOpenVacancy` only, one row per position; remove the struck plantilla and the disabled Filled button. Pagination total comes from the filtered list.
10. Dashboard (`RspDashboardOverview.tsx`): open vacancies, "Per vacancy" and vacancies by department count `isOpenVacancy`.
11. `hiredApplicantSync.ts`: D10.
12. Tests, type-check, lint, build; post-apply audit.

## Risks

- **Unlinked incumbents.** If `employees.plantilla_num` is mostly empty, PR 2 makes nearly every position vacant. PR 2 is held until audit block 1b shows the filled positions are linked.
- **`plantilla_num` type.** The code writes it with `Number()`. If the column is numeric, non-numeric plantilla numbers (placeholders like `UNASSIGNED-…`) can never be filled, and D10 must skip them. Audit block 1 settles the type.
- **Unrecoverable merge values.** The merge overwrote each survivor's status and deadline with its group's "most open" values. The split can't restore them; it reports survivors left `Open` for RSP to review. Under PR 2 a filled survivor is hidden regardless.
- **Rows tied to a merged posting but not to an applicant** (any table with a `job_posting_id` and no `applicant_id`) can't be split; they stay on the survivor. The migration reports them per table.
- **Rollback window.** The undo script is clean only before new activity lands on restored postings; applications filed after the split stay on postings the undo would re-hide. The undo script reports that count before changing anything.
- **Concurrent work.** 20261021200100 and its plan are still uncommitted from another session in this worktree. Its reservation RPC returns text messages; the D7 trigger raises an error instead, which the reserve UI must show.
- **Stale client cache.** The whole-list upsert can still write an old status back over a trigger's `Closed`. D11 removes this for open/close; other edits keep the existing behaviour.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run check:migrations`.
- Vitest: `isOpenVacancy` / eligibility from occupancy; Vacancies tab and badge exclude filled; public list excludes filled and paginates on the filtered total; open action disabled for filled and shows the database error; positions sorted vacant first with the Vacant/Filled filter; hire sync writes `plantilla_num`.
- Database behaviour (view, triggers, unique index) has no test harness here; it is verified by the post-apply audit: positions ≈ 128, no position with more than one plantilla, vacant = expected count, badge = public rows = open vacancies (≤ 5).

---

## Appendix A — migration `split_merged_postings`

```sql
-- Split postings merged by 20261021100000 back to one position per plantilla.
--
-- Each extra plantilla on a merged posting returns to the soft-deleted posting
-- it came from (same title, office and plantilla number), that posting is
-- restored, and the applications for that plantilla follow it. Applicant
-- counts are untouched: nothing here limits how many people may apply.
--
-- Backups are written first and kept after commit:
--   _split_backup_slots    every slot on an affected posting, before/after
--   _split_backup_refs     every repointed reference (table, row, old, new)
--   _split_backup_postings every posting whose deleted_at or headcount changed
-- Undo: supabase/rollbacks/<this version>_split_merged_postings_rollback.sql
--
-- Aborts (changes nothing) when a plantilla has no original to return to, or
-- an application is tied to plantillas that would land on different positions.

begin;

set local search_path = public, pg_temp;

-- ── 0. Backup tables ─────────────────────────────────────────────────────────
-- They hold applicant ids, so RLS is on with no policies: staff tooling and
-- the service role only.
create table if not exists public._split_backup_slots (
  slot_id            uuid primary key,
  posting_before     uuid not null,
  posting_after      uuid not null,
  slot_number_before integer not null,
  label_before       text,
  split_at           timestamptz not null default now()
);
create table if not exists public._split_backup_refs (
  id          bigserial primary key,
  table_name  text not null,
  column_name text not null,
  row_id      text not null,
  old_value   text not null,
  new_value   text not null
);
create table if not exists public._split_backup_postings (
  posting_id                 uuid primary key,
  deleted_at_before          timestamptz,
  number_of_positions_before integer
);
alter table public._split_backup_slots    enable row level security;
alter table public._split_backup_refs     enable row level security;
alter table public._split_backup_postings enable row level security;

-- ── 1. What moves where ──────────────────────────────────────────────────────
create temp table _merged on commit drop as
select ps.job_posting_id as posting_id
  from public.plantilla_slots ps
  join public.job_postings jp on jp.id = ps.job_posting_id and jp.deleted_at is null
 group by ps.job_posting_id
having count(*) > 1;

create temp table _split on commit drop as
select ps.id as slot_id, ps.job_posting_id as from_posting_id, orig.id as to_posting_id
  from public.plantilla_slots ps
  join public.job_postings sv   on sv.id = ps.job_posting_id
  join public.job_postings orig on orig.deleted_at is not null
   and lower(btrim(orig.title)) = lower(btrim(sv.title))
   and lower(btrim(coalesce(orig.department, ''))) = lower(btrim(coalesce(sv.department, '')))
   and lower(btrim(orig.item_number)) = lower(btrim(ps.item_number))
 where ps.job_posting_id in (select posting_id from _merged)
   and not exists (select 1 from public.plantilla_slots o where o.job_posting_id = orig.id);

-- Every merged posting must keep exactly one plantilla of its own.
do $$
declare
  bad integer;
begin
  select count(*) into bad
    from _merged m
   where (select count(*) from public.plantilla_slots ps
           where ps.job_posting_id = m.posting_id
             and ps.id not in (select slot_id from _split)) <> 1;
  if bad > 0 then
    raise exception 'split_merged_postings: % merged posting(s) have plantillas with no original posting to return to. Nothing was changed.', bad;
  end if;
end $$;

-- Applications that follow a moved plantilla.
create temp table _split_apps on commit drop as
select distinct a.id as applicant_id, s.from_posting_id, s.to_posting_id
  from public.applicants a
  join _split s on s.slot_id = a.plantilla_slot_id
union
select distinct aps.applicant_id, s.from_posting_id, s.to_posting_id
  from public.application_plantilla_slots aps
  join _split s on s.slot_id = aps.plantilla_slot_id;

do $$
declare
  ambiguous integer;
begin
  select count(*) into ambiguous from (
    select applicant_id from _split_apps group by applicant_id having count(distinct to_posting_id) > 1
    union
    -- also linked to the plantilla that stays on the survivor
    select sa.applicant_id
      from _split_apps sa
      join public.application_plantilla_slots aps on aps.applicant_id = sa.applicant_id
      join public.plantilla_slots ps on ps.id = aps.plantilla_slot_id
     where ps.job_posting_id = sa.from_posting_id
       and ps.id not in (select slot_id from _split)
  ) x;
  if ambiguous > 0 then
    raise exception 'split_merged_postings: % application(s) are tied to plantillas that would land on different positions. Nothing was changed.', ambiguous;
  end if;
end $$;

-- ── 2. Back up ───────────────────────────────────────────────────────────────
insert into public._split_backup_slots (slot_id, posting_before, posting_after, slot_number_before, label_before)
select ps.id, ps.job_posting_id, coalesce(s.to_posting_id, ps.job_posting_id), ps.slot_number, ps.label
  from public.plantilla_slots ps
  left join _split s on s.slot_id = ps.id
 where ps.job_posting_id in (select posting_id from _merged)
on conflict (slot_id) do nothing;

insert into public._split_backup_postings (posting_id, deleted_at_before, number_of_positions_before)
select jp.id, jp.deleted_at, jp.number_of_positions
  from public.job_postings jp
 where jp.id in (select posting_id from _merged) or jp.id in (select to_posting_id from _split)
on conflict (posting_id) do nothing;

-- ── 3. Repoint the moved applications' references ────────────────────────────
-- Every column that points at job_postings.id (a foreign key, or a column named
-- job_posting_id), found the same way 20261021100000 found them. Only rows
-- that identify an application are moved: applicants by id, other tables by
-- applicant_id. Rows with no applicant stay on the survivor and are reported.
do $$
declare
  ref record;
  key_col text;
  col_type text;
  moved bigint;
  left_behind bigint;
begin
  for ref in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
      from pg_constraint k
      join pg_class c     on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f' and k.confrelid = 'public.job_postings'::regclass
       and array_length(k.conkey, 1) = 1
    union
    select table_schema, table_name, column_name
      from information_schema.columns
     where table_schema = 'public' and column_name = 'job_posting_id'
       and table_name in (select table_name from information_schema.tables
                           where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
    continue when ref.table_name in ('plantilla_slots', '_split_backup_slots');

    key_col := case
      when ref.table_name = 'applicants' then 'id'
      when exists (select 1 from information_schema.columns
                    where table_schema = ref.schema_name and table_name = ref.table_name
                      and column_name = 'applicant_id') then 'applicant_id'
    end;

    if key_col is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = ref.schema_name and table_name = ref.table_name
                         and column_name = 'id') then
      execute format('select count(*) from %I.%I where %I::text in (select from_posting_id::text from _split)',
                     ref.schema_name, ref.table_name, ref.column_name) into left_behind;
      if left_behind > 0 then
        raise notice 'Left on the survivor: % row(s) in %.%.% (no applicant to follow).',
          left_behind, ref.schema_name, ref.table_name, ref.column_name;
      end if;
      continue;
    end if;

    select format_type(a.atttypid, a.atttypmod) into col_type
      from pg_attribute a
     where a.attrelid = format('%I.%I', ref.schema_name, ref.table_name)::regclass
       and a.attname = ref.column_name;

    execute format(
      'with moved as (
         update %1$I.%2$I t
            set %3$I = m.to_posting_id::text::%4$s
           from _split_apps m
          where t.%5$I::text = m.applicant_id::text
            and t.%3$I::text = m.from_posting_id::text
         returning t.id::text as row_id, m.from_posting_id::text as old_value, m.to_posting_id::text as new_value)
       insert into public._split_backup_refs (table_name, column_name, row_id, old_value, new_value)
       select %6$L, %7$L, row_id, old_value, new_value from moved',
      ref.schema_name, ref.table_name, ref.column_name, col_type, key_col,
      ref.table_name, ref.column_name);
    get diagnostics moved = row_count;
    if moved > 0 then
      raise notice 'Repointed % row(s) in %.%.%', moved, ref.schema_name, ref.table_name, ref.column_name;
    end if;
  end loop;
end $$;

-- ── 4. Move the plantillas and restore their postings ────────────────────────
-- The restored posting is empty, so slot 1 and the label are free there. The
-- " (duplicate n)" suffix the merge added is dropped.
update public.plantilla_slots ps
   set job_posting_id = s.to_posting_id,
       slot_number    = 1,
       label          = regexp_replace(ps.label, ' \(duplicate \d+\)$', '')
  from _split s
 where ps.id = s.slot_id;

update public.plantilla_slots ps
   set slot_number = 1,
       label       = regexp_replace(ps.label, ' \(duplicate \d+\)$', '')
 where ps.job_posting_id in (select posting_id from _merged);

update public.job_postings jp
   set deleted_at = null, number_of_positions = 1
 where jp.id in (select to_posting_id from _split);

update public.job_postings jp
   set number_of_positions = 1
 where jp.id in (select posting_id from _merged);

-- ── 5. Report ────────────────────────────────────────────────────────────────
do $$
declare
  restored integer;
  still_multi integer;
  open_survivors integer;
begin
  select count(*) into restored from _split;
  select count(*) into still_multi from (
    select ps.job_posting_id from public.plantilla_slots ps
      join public.job_postings jp on jp.id = ps.job_posting_id and jp.deleted_at is null
     group by 1 having count(*) > 1) x;
  select count(*) into open_survivors from public.job_postings
   where id in (select posting_id from _merged) and status = 'Open';
  raise notice 'Restored % position(s). Positions still holding more than one plantilla: %.', restored, still_multi;
  raise notice '% former merge survivor(s) are Open; their own status before the merge is unknown, so RSP should review them.', open_survivors;
end $$;

commit;
```

## Appendix B — rollback `split_merged_postings_rollback.sql`

```sql
-- Undo split_merged_postings from its backup tables. Safe only before new
-- activity on restored postings; the first block reports that and stops.
begin;

set local search_path = public, pg_temp;

do $$
declare
  newer integer;
begin
  select count(*) into newer
    from public.applicants a
   where a.created_at > (select min(split_at) from public._split_backup_slots)
     and a.plantilla_slot_id in (select slot_id from public._split_backup_slots
                                  where posting_after <> posting_before);
  if newer > 0 then
    raise exception 'Rollback stopped: % application(s) were filed on restored positions after the split. Decide where they go first.', newer;
  end if;
end $$;

-- References back to the survivor.
do $$
declare
  r record;
  col_type text;
begin
  for r in select distinct table_name, column_name from public._split_backup_refs loop
    select format_type(a.atttypid, a.atttypmod) into col_type
      from pg_attribute a
     where a.attrelid = format('public.%I', r.table_name)::regclass and a.attname = r.column_name;
    execute format(
      'update public.%1$I t set %2$I = b.old_value::%3$s
         from public._split_backup_refs b
        where b.table_name = %4$L and b.column_name = %2$L and t.id::text = b.row_id',
      r.table_name, r.column_name, col_type, r.table_name);
  end loop;
end $$;

-- Slots: park every ordinal, then put each slot back on its posting.
update public.plantilla_slots ps
   set slot_number = 100000 + r.park
  from (select slot_id, row_number() over (order by slot_id) as park from public._split_backup_slots) r
 where ps.id = r.slot_id;

update public.plantilla_slots ps
   set job_posting_id = b.posting_before,
       slot_number    = b.slot_number_before,
       label          = b.label_before
  from public._split_backup_slots b
 where ps.id = b.slot_id;

update public.job_postings jp
   set deleted_at          = b.deleted_at_before,
       number_of_positions = b.number_of_positions_before
  from public._split_backup_postings b
 where jp.id = b.posting_id;

-- Backups are kept; drop them by hand once you're sure:
-- drop table public._split_backup_slots, public._split_backup_refs, public._split_backup_postings;

commit;
```

## Appendix C — migration `position_occupancy`

```sql
-- Vacant/filled is derived from current employees; one plantilla per position.
--
-- position_occupancy is the only definition of vacant, filled and open
-- vacancy. Nothing stores it. A position's plantilla number is the <n> in its
-- slot label "Plantilla <n>"; item_number is an internal PLT-… key.
-- Requires split_merged_postings (one plantilla per position) and
-- 20261021200100 (reservations, archive on fill).
-- Rollback: supabase/rollbacks/<this version>_position_occupancy_rollback.sql

begin;

set local search_path = public, pg_temp;

-- ── 1. Plantilla numbers ─────────────────────────────────────────────────────
-- Trimmed, leading zeros dropped: "042" and "42" are the same plantilla.
create or replace function public.normalize_plantilla_number(raw text)
returns text
language sql immutable
as $$ select nullif(regexp_replace(btrim(coalesce(raw, '')), '^0+(?=\d)', ''), '') $$;

create or replace function public.plantilla_number_of_label(label text)
returns text
language sql immutable
as $$ select public.normalize_plantilla_number(substring(label from '(?i)^\s*plantilla\s+(\d+)\s*$')) $$;

-- ── 2. One plantilla per position, one position per plantilla number ─────────
do $$
begin
  if exists (select 1 from public.plantilla_slots group by job_posting_id having count(*) > 1) then
    raise exception 'position_occupancy: some positions still hold more than one plantilla. Apply split_merged_postings first.';
  end if;
  if exists (select 1 from public.plantilla_slots
              where public.plantilla_number_of_label(label) is not null
              group by public.plantilla_number_of_label(label) having count(*) > 1) then
    raise exception 'position_occupancy: a plantilla number is used by more than one position (audit block 5b). Nothing was changed.';
  end if;
end $$;

create unique index if not exists uq_plantilla_slots_one_per_posting
  on public.plantilla_slots (job_posting_id);

create unique index if not exists uq_plantilla_slots_plantilla_number
  on public.plantilla_slots (public.plantilla_number_of_label(label))
  where public.plantilla_number_of_label(label) is not null;

-- ── 3. Who holds a plantilla ─────────────────────────────────────────────────
-- Active and On Leave hold their plantilla. Resigned, Terminated, Separated
-- and soft-deleted rows don't. No plantilla_num holds nothing.
create or replace function public.is_current_employee(p_status text, p_deleted_at timestamptz)
returns boolean
language sql immutable
as $$ select p_deleted_at is null and lower(btrim(coalesce(p_status, ''))) in ('active', 'on leave') $$;

create index if not exists idx_employees_plantilla_num
  on public.employees (public.normalize_plantilla_number(plantilla_num))
  where deleted_at is null;

-- SECURITY DEFINER so the public portal can learn "filled or not" without
-- being able to read employees. Returns a boolean and nothing else.
create or replace function public.plantilla_is_filled(p_plantilla text)
returns boolean
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from employees e
     where normalize_plantilla_number(e.plantilla_num) = normalize_plantilla_number(p_plantilla)
       and is_current_employee(e.status, e.deleted_at)
  )
$$;

grant execute on function public.plantilla_is_filled(text) to anon, authenticated, service_role;

-- ── 4. The one definition ────────────────────────────────────────────────────
-- Deadlines are dates in Manila; the server runs in UTC.
create or replace view public.position_occupancy with (security_invoker = true) as
select
  jp.id                                       as posting_id,
  ps.id                                       as plantilla_slot_id,
  public.plantilla_number_of_label(ps.label)  as plantilla_number,
  o.is_filled,
  not o.is_filled                             as is_vacant,
  (ps.reserved_by_applicant_id is not null)   as is_reserved,
  (not o.is_filled
     and jp.status = 'Open'
     and (jp.application_deadline is null
          or jp.application_deadline::date >= (now() at time zone 'Asia/Manila')::date))
                                              as is_open_vacancy
from public.job_postings jp
join public.plantilla_slots ps on ps.job_posting_id = jp.id
cross join lateral (
  select public.plantilla_is_filled(public.plantilla_number_of_label(ps.label)) as is_filled
) o
where jp.deleted_at is null;

grant select on public.position_occupancy to anon, authenticated, service_role;

-- ── 5. A filled position can't be opened or reserved ─────────────────────────
create or replace function public.block_open_on_filled_position()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Open'
     and (tg_op = 'INSERT' or old.status is distinct from 'Open')
     and exists (select 1 from public.plantilla_slots ps
                  where ps.job_posting_id = new.id
                    and public.plantilla_is_filled(public.plantilla_number_of_label(ps.label))) then
    raise exception using
      errcode = 'P0001',
      message = 'position_filled: This position is already filled and cannot be opened as a vacancy.',
      hint    = 'An employee currently holds this plantilla.';
  end if;
  return new;
end $$;

drop trigger if exists trg_block_open_on_filled_position on public.job_postings;
create trigger trg_block_open_on_filled_position
  before insert or update of status on public.job_postings
  for each row execute function public.block_open_on_filled_position();

-- The same rule when an open position's plantilla number is changed to one an
-- employee holds, or a reservation is made on a filled plantilla.
create or replace function public.block_filled_plantilla_on_open_position()
returns trigger
language plpgsql
as $$
begin
  if public.plantilla_is_filled(public.plantilla_number_of_label(new.label)) then
    if exists (select 1 from public.job_postings jp where jp.id = new.job_posting_id and jp.status = 'Open')
       and (tg_op = 'INSERT' or new.label is distinct from old.label) then
      raise exception using
        errcode = 'P0001',
        message = 'position_filled: This position is already filled and cannot be opened as a vacancy.',
        hint    = 'An employee currently holds this plantilla.';
    end if;
    if new.reserved_by_applicant_id is not null
       and (tg_op = 'INSERT' or old.reserved_by_applicant_id is null) then
      raise exception using
        errcode = 'P0001',
        message = 'position_filled: An employee currently holds this plantilla, so it cannot be reserved.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_block_filled_plantilla_on_open_position on public.plantilla_slots;
create trigger trg_block_filled_plantilla_on_open_position
  before insert or update of label, reserved_by_applicant_id on public.plantilla_slots
  for each row execute function public.block_filled_plantilla_on_open_position();

-- ── 6. An employee taking a plantilla closes its vacancy ─────────────────────
-- A hire carries the applicant's id as the employee id (hiredApplicantSync).
-- Marking the slot filled by them fires trg_archive_others_on_slot_fill
-- (20261021200100): everyone else who applied is archived as Not Selected and
-- sees the regret letter. A direct assignment closes the posting only.
-- SECURITY DEFINER: the admin editing employees may not hold RSP's policies.
create or replace function public.close_vacancy_when_plantilla_taken()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plantilla text := normalize_plantilla_number(new.plantilla_num);
  is_hire   boolean;
begin
  if plantilla is null or not is_current_employee(new.status, new.deleted_at) then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and normalize_plantilla_number(old.plantilla_num) is not distinct from plantilla
     and is_current_employee(old.status, old.deleted_at) then
    return null;  -- already held; nothing changed
  end if;

  select exists (select 1 from applicants a where a.id = new.id) into is_hire;

  update plantilla_slots ps
     set status                 = 'filled',
         filled_by_applicant_id = case when is_hire then new.id else ps.filled_by_applicant_id end
   where plantilla_number_of_label(ps.label) = plantilla
     and ps.status <> 'filled';

  update job_postings jp
     set status = 'Closed'
   where jp.deleted_at is null
     and jp.status = 'Open'
     and jp.id in (select ps.job_posting_id from plantilla_slots ps
                    where plantilla_number_of_label(ps.label) = plantilla);

  return null;
end $$;

drop trigger if exists trg_close_vacancy_when_plantilla_taken on public.employees;
create trigger trg_close_vacancy_when_plantilla_taken
  after insert or update of plantilla_num, status, deleted_at on public.employees
  for each row execute function public.close_vacancy_when_plantilla_taken();

-- ── 7. Close filled positions still marked Open ──────────────────────────────
-- Their previous status is kept so the rollback can put it back.
create table if not exists public._occupancy_backup_postings (
  posting_id    uuid primary key,
  status_before text not null,
  closed_at     timestamptz not null default now()
);
alter table public._occupancy_backup_postings enable row level security;

create temp table _closing on commit drop as
select po.posting_id, jp.status
  from public.position_occupancy po
  join public.job_postings jp on jp.id = po.posting_id
 where po.is_filled and jp.status = 'Open';

insert into public._occupancy_backup_postings (posting_id, status_before)
select posting_id, status from _closing
on conflict (posting_id) do nothing;

update public.job_postings jp
   set status = 'Closed'
  from _closing c
 where jp.id = c.posting_id;

-- ── 8. Report ────────────────────────────────────────────────────────────────
do $$
declare
  filled integer;
  vacant integer;
  open_vacancies integer;
  closed_now integer;
begin
  select count(*) filter (where is_filled), count(*) filter (where is_vacant),
         count(*) filter (where is_open_vacancy)
    into filled, vacant, open_vacancies
    from public.position_occupancy;
  select count(*) into closed_now from _closing;
  raise notice 'Positions: % filled, % vacant, % open vacancies. Closed % filled position(s) that were still Open.',
    filled, vacant, open_vacancies, closed_now;
end $$;

notify pgrst, 'reload schema';

commit;
```

## Appendix D — rollback `position_occupancy_rollback.sql`

```sql
-- Undo position_occupancy. Reopens only the postings it closed, then drops
-- the triggers, view, functions and indexes it added. Slots it marked filled
-- on a hire stay filled, because the archive that hire triggered is real.
begin;

set local search_path = public, pg_temp;

drop trigger if exists trg_close_vacancy_when_plantilla_taken on public.employees;
drop trigger if exists trg_block_filled_plantilla_on_open_position on public.plantilla_slots;
drop trigger if exists trg_block_open_on_filled_position on public.job_postings;

update public.job_postings jp
   set status = b.status_before
  from public._occupancy_backup_postings b
 where jp.id = b.posting_id
   and jp.status = 'Closed';

drop view if exists public.position_occupancy;
drop function if exists public.close_vacancy_when_plantilla_taken();
drop function if exists public.block_filled_plantilla_on_open_position();
drop function if exists public.block_open_on_filled_position();
drop function if exists public.plantilla_is_filled(text);
drop index if exists public.idx_employees_plantilla_num;
drop index if exists public.uq_plantilla_slots_plantilla_number;
drop index if exists public.uq_plantilla_slots_one_per_posting;
drop function if exists public.is_current_employee(text, timestamptz);
drop function if exists public.plantilla_number_of_label(text);
drop function if exists public.normalize_plantilla_number(text);

-- Kept: public._occupancy_backup_postings. Drop it by hand once you're sure.

notify pgrst, 'reload schema';

commit;
```
