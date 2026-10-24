-- Rollback for 20261024171047_deactivate_legal_and_it_offices.sql:
-- show the Legal and Information Technology offices again.

update public.departments
   set is_active = true
 where name in ('Legal', 'Information Technology');
