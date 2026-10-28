-- Remediate Angela Brown's IPCR Phase 2 rating state.
--
-- Why:
--   The old `target_settings_finalize_ipcr_upd` trigger fired prematurely upon
--   Phase 2 submission before supervisor approval (when phase2_approved_at was null).
--   This incorrectly set her submission stage to 'Forwarded to PM', created a premature
--   row in performance_evaluations, and mirrored unapproved ratings into ipcr_performance.
--
-- How to apply:
--   Run this in the Supabase Dashboard SQL Editor and confirm the "Potential issue detected" dialog.

begin;

-- 1. Reset ipcr_submissions stage to 'Submitted to Office'
update public.ipcr_submissions
   set stage = 'Submitted to Office',
       forwarded_at = null,
       updated_by = null,
       updated_at = now()
 where employee_id = 'af87c4b1-ee53-5ca1-91cb-f9117c97434d'
   and period in ('July–December 2026', 'July-December 2026')
   and phase = 'rating';

-- 2. Delete premature performance_evaluations row
delete from public.performance_evaluations
 where employee_id = 'af87c4b1-ee53-5ca1-91cb-f9117c97434d'
   and period in ('July–December 2026', 'July-December 2026')
   and approved_at is null;

-- 3. Delete premature rows from ipcr_performance
delete from public.ipcr_performance
 where employee_num = 'EMP-2026-182'
   and (
     ipcr_id like 'IPCR-TS-%July%2026%'
     or ipcr_id like 'IPCR-TS-%Jul%2026%'
   );

commit;

-- Verification queries
select id, employee_name, period, phase, stage, forwarded_at, updated_by
  from public.ipcr_submissions
 where employee_id = 'af87c4b1-ee53-5ca1-91cb-f9117c97434d';

select id, employee_id, period, status, final_score, approved_at
  from public.performance_evaluations
 where employee_id = 'af87c4b1-ee53-5ca1-91cb-f9117c97434d';

select count(*) as remaining_premature_ipcr_performance_rows
  from public.ipcr_performance
 where employee_num = 'EMP-2026-182'
   and (
     ipcr_id like 'IPCR-TS-%July%2026%'
     or ipcr_id like 'IPCR-TS-%Jul%2026%'
   );
