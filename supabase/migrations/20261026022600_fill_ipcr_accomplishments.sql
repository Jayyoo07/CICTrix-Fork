-- Fill the Phase 2 accomplishment text for the seeded semester IPCRs.
--
-- Plan: docs/plans/2026-10-26-ipcr-surface-sync.md
-- Data map: docs/ipcr-data-map.md
--
-- Why this exists
--   The seed migration (20261024174932_seed_semester_ipcrs.sql) wrote targets
--   and Q/E/T ratings but never `success_indicator_ratings.accomplishment`. The
--   Phase 2 panel and IPCR Management 2.3 therefore render the literal fallback
--   "No accomplishments encoded." for every seeded IPCR. The column was added
--   later (20261001_ipcr_remarks_column.sql) and is nullable, so nothing failed;
--   the text was simply never written.
--
-- What it writes, and only where `accomplishment` is null
--   <target statement>. <evidence a person in that line of work would point at>. <outcome by score>.
--
--   Tailoring is three-part and all of it comes from data already stored:
--     1. The target statement is the office's own success indicator, which the
--        seed already tailored per position family.
--     2. The evidence clause follows the employee's position, because a nurse
--        and an accountant verify work differently.
--     3. The outcome clause follows the row's own mean of quality, efficiency
--        and timeliness, so the sentence and the number never disagree.
--
-- Idempotent: only null accomplishments are touched, so a second run is a no-op.
-- The trailing assertion fails the migration if any seeded row is left null.

with work as (
  select r.id                                                     as rating_id,
         si.description                                           as target_text,
         lower(e.position)                                        as position,
         (r.quality + r.efficiency + r.timeliness)::numeric / 3.0 as mean_score
    from public.success_indicator_ratings r
    join public.success_indicators si on si.id = r.success_indicator_id
    join public.mfos m                on m.id  = si.mfo_id
    join public.target_settings t     on t.id  = m.target_setting_id
    join public.employees e           on e.id  = t.employee_id
    join public.performance_cycles c  on c.id  = t.cycle_id
   where r.accomplishment is null
     and t.status = 'approved'
     and t.phase2_status = 'completed'
     and c.title in ('January–June 2025', 'July–December 2025', 'January–June 2026')
)
update public.success_indicator_ratings r
   set accomplishment = w.target_text || ' ' ||
                        case
                          when w.position ilike any (array[
                                 '%engineer%', '%architect%', '%electrician%', '%plumber%',
                                 '%mechanic%', '%foreman%', '%heavy equipment%', '%driver%',
                                 '%utility%', '%building official%', '%inspection%'])
                            then 'Verified through inspection reports, work orders and maintenance records.'
                          when w.position ilike any (array[
                                 '%health%', '%nurse%', '%midwife%', '%dentist%', '%medical%',
                                 '%nutritionist%', '%sanitation%', '%laboratory%', '%pharmacist%'])
                            then 'Supported by clinical records, laboratory results and program reports.'
                          when w.position ilike any (array[
                                 '%accountant%', '%bookkeeper%', '%payroll%', '%budget%',
                                 '%revenue%', '%cashier%', '%auditor%', '%financial%'])
                            then 'Verified through ledgers, journal entries and financial statements.'
                          when w.position ilike any (array[
                                 '%social welfare%', '%early childhood%', '%day care%'])
                            then 'Documented in case files, assistance records and program reports.'
                          when w.position ilike any (array[
                                 '%attorney%', '%legal%', '%prosecutor%', '%clerk of court%'])
                            then 'Supported by filed pleadings, legal opinions and case records.'
                          when w.position ilike any (array[
                                 '%information technology%', '%programmer%', '%systems analyst%',
                                 '%computer%', '%data%'])
                            then 'Verified through system logs, release notes and output reviews.'
                          when w.position ilike any (array[
                                 '%general services%', '%property%', '%supply%', '%storekeeper%',
                                 '%procurement%', '%buyer%'])
                            then 'Verified through property records, supply issuances and service requests.'
                          when w.position ilike any (array[
                                 '%administrative officer%', '%human resource%', '%hrmo%',
                                 '%personnel%', '%records officer%', '%clerk%', '%assistant%',
                                 '%aide%', '%stenographer%', '%bookbinder%'])
                            then 'Verified through office records, transmittals and submitted reports.'
                          else   'Verified through office records and submitted reports.'
                        end || ' ' ||
                        case
                          when w.mean_score >= 4.50
                            then 'Completed ahead of the prescribed deadlines, with no revisions required.'
                          when w.mean_score >= 4.00
                            then 'Completed within the prescribed deadlines and standards, with no revisions required.'
                          when w.mean_score >= 3.00
                            then 'Completed within the prescribed deadlines, with minor revisions that were raised and closed.'
                          else   'Completed with shortfalls against the agreed timeline, which the reviewer noted.'
                        end,
       updated_at = now()
  from work w
 where r.id = w.rating_id
   and w.mean_score is not null;

-- Nothing seeded may be left without an accomplishment. A null here means a
-- rating row was missing Q/E/T or the joins above missed it, and the screen
-- would keep showing the fallback.
do $$
declare
  v_missing int;
begin
  select count(*)
    into v_missing
    from public.success_indicator_ratings r
    join public.success_indicators si on si.id = r.success_indicator_id
    join public.mfos m                on m.id = si.mfo_id
    join public.target_settings t     on t.id = m.target_setting_id
    join public.performance_cycles c  on c.id = t.cycle_id
   where r.accomplishment is null
     and t.status = 'approved'
     and t.phase2_status = 'completed'
     and c.title in ('January–June 2025', 'July–December 2025', 'January–June 2026');

  if v_missing > 0 then
    raise exception 'accomplishment fill: % seeded rating row(s) still have no accomplishment', v_missing;
  end if;

  raise notice 'accomplishment fill: every seeded rating row now carries accomplishment text';
end
$$;
