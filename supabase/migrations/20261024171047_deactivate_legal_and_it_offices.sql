-- Deactivate the Legal and Information Technology offices.
--
-- They are not city offices in this deployment. Office Directory and every
-- department dropdown read active departments only, so marking them inactive
-- removes them from those lists. Nothing is deleted: employees, IPCR records
-- and job postings that name these offices are left as they are.
--
-- Plan: docs/plans/2026-10-23-plantilla-per-row.md (D4)
-- Rollback: supabase/rollbacks/20261024171047_deactivate_legal_and_it_offices_rollback.sql

update public.departments
   set is_active = false
 where name in ('Legal', 'Information Technology')
   and is_active;
