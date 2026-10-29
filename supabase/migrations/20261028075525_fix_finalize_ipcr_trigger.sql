-- Fix target_settings finalize IPCR triggers so they only fire when Phase 2 is actually approved.
-- Previously, updating phase2_status alone without approval triggered premature finalization
-- into ipcr_submissions, performance_evaluations, and ipcr_performance.

drop trigger if exists target_settings_finalize_ipcr_upd on public.target_settings;
create trigger target_settings_finalize_ipcr_upd
  after update on public.target_settings
  for each row
  when (
    new.phase2_status = 'completed'
    and new.phase2_approved_at is not null
    and (old.phase2_approved_at is null or old.phase2_status is distinct from 'completed')
  )
  execute function public.finalize_ipcr_surfaces_trigger();

drop trigger if exists target_settings_finalize_ipcr_ins on public.target_settings;
create trigger target_settings_finalize_ipcr_ins
  after insert on public.target_settings
  for each row
  when (
    new.phase2_status = 'completed'
    and new.phase2_approved_at is not null
  )
  execute function public.finalize_ipcr_surfaces_trigger();
