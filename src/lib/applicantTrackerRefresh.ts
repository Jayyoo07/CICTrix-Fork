import { refetchTrackerApplications, type TrackerAttachment, type TrackerLookup } from './applicantTracker';
import { fetchApplicantSlotLinksChecked, fetchSlotsByJobPostingChecked } from './plantillaSlots';
import { supabase } from './supabase';
import type { ApplicationSlotStatus, PlantillaSlot } from '../types/recruitment.types';

export const TRACKER_FALLBACK_INTERVAL_MS = 15_000;

export type TrackerSlotOutcome = { slot: PlantillaSlot; status: ApplicationSlotStatus };
export interface TrackerDetails {
  // Null is a failed read; [] is an authoritative empty result.
  attachments: TrackerAttachment[] | null;
  outcomesByApplicant: Map<string, TrackerSlotOutcome[]> | null;
}

/** One document snapshot supplies both the open row and every action-required flag. */
export const loadTrackerDetails = async (applicantIds: string[]): Promise<TrackerDetails> => {
  if (applicantIds.length === 0) return { attachments: [], outcomesByApplicant: new Map() };
  const attachmentsRead = async (): Promise<TrackerAttachment[] | null> => {
    try {
      const PAGE_SIZE = 1000;
      const IDS_PER_QUERY = 100;
      const attachments: TrackerAttachment[] = [];
      for (let chunk = 0; chunk < applicantIds.length; chunk += IDS_PER_QUERY) {
        let offset = 0;
        let more = true;
        while (more) {
          const { data, error, count } = await (supabase as any)
            .from('applicant_attachments')
            .select('id, applicant_id, file_name, file_path, document_type, created_at', { count: 'exact' })
            .in('applicant_id', applicantIds.slice(chunk, chunk + IDS_PER_QUERY))
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !Array.isArray(data)) return null;
          attachments.push(...data);
          offset += data.length;
          // Exact count also handles projects whose server cap is below PAGE_SIZE.
          more = data.length > 0 && (typeof count === 'number' ? offset < count : data.length === PAGE_SIZE);
        }
      }
      return attachments;
    } catch { return null; }
  };
  const [attachments, links] = await Promise.all([
    attachmentsRead(), fetchApplicantSlotLinksChecked(applicantIds),
  ]);
  if (!links.ok) return { attachments, outcomesByApplicant: null };
  const slotIds = [...new Set([...links.data.values()].flatMap((rows) => rows.map((link) => link.slotId)))];
  // A tracker only displays this person's linked slots, never the whole roster.
  const slotsByJob = await fetchSlotsByJobPostingChecked(slotIds);
  if (!slotsByJob.ok) return { attachments, outcomesByApplicant: null };
  const slots = new Map<string, PlantillaSlot>();
  slotsByJob.data.forEach((rows) => rows.forEach((slot) => slots.set(slot.id, slot)));
  const outcomesByApplicant = new Map<string, TrackerSlotOutcome[]>();
  links.data.forEach((rows, id) => {
    const outcomes: TrackerSlotOutcome[] = [];
    rows.forEach((link) => {
      const slot = slots.get(link.slotId);
      if (slot) outcomes.push({ slot, status: link.status });
    });
    outcomes.sort((a, b) => a.slot.slotNumber - b.slot.slotNumber);
    outcomesByApplicant.set(id, outcomes);
  });
  return { attachments, outcomesByApplicant };
};

export const loadTrackerRefresh = async (lookup: TrackerLookup, knownIds: string[]) => {
  // A failed record read must not prevent document/outcome catch-up.
  const rows = await refetchTrackerApplications(lookup).catch(() => null);
  const ids = rows === null ? knownIds : rows.map((row) => String(row.id ?? ''));
  return { rows, ...await loadTrackerDetails(ids) };
};

export type TrackerRefreshSnapshot = Awaited<ReturnType<typeof loadTrackerRefresh>>;

/** Scoped to one search. Serializes reads and never caches another person's data. */
export const startTrackerRefresh = (
  lookup: TrackerLookup,
  applicantIds: string[],
  onSnapshot: (snapshot: TrackerRefreshSnapshot) => void,
) => {
  let disposed = false;
  let running = false;
  let pending = false;
  let generation = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;

  const run = async () => {
    scheduled = undefined;
    if (disposed) return;
    running = true;
    pending = false;
    const currentGeneration = generation;
    try {
      const snapshot = await loadTrackerRefresh(lookup, applicantIds);
      if (!disposed && generation === currentGeneration) onSnapshot(snapshot);
    } catch { /* Keep last-good data on transient failures. */ }
    finally {
      running = false;
      if (pending && !disposed) request();
    }
  };
  const request = () => {
    if (disposed) return;
    if (running) { pending = true; return; }
    // Focus, visibility, online and realtime can arrive in the same turn.
    if (scheduled === undefined) scheduled = setTimeout(() => { void run(); }, 0);
  };
  const visibleCatchUp = () => {
    if (document.visibilityState === 'visible') request();
  };
  const setPolling = () => {
    clearInterval(interval);
    interval = undefined;
    if (document.visibilityState !== 'visible') return;
    interval = setInterval(() => {
      // Slow reads are already a catch-up; do not starve them with timer invalidations.
      if (!running && scheduled === undefined) request();
    }, TRACKER_FALLBACK_INTERVAL_MS);
  };
  const onVisibility = () => { setPolling(); visibleCatchUp(); };

  const ids = new Set(applicantIds);
  let subscribed = false;
  let interrupted = false;
  const channel = (supabase as any)
    .channel(`tracker_refresh_${applicantIds.join('_')}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applicants' }, (payload: any) => {
      if (ids.has(String(payload.new?.id ?? ''))) request();
    });
  // Realtime's IN filter permits at most 100 values. Scope document events to
  // this person's applications, including collapsed rows, without widening RLS.
  const REALTIME_FILTER_LIMIT = 100;
  for (let offset = 0; offset < applicantIds.length; offset += REALTIME_FILTER_LIMIT) {
    const chunk = applicantIds.slice(offset, offset + REALTIME_FILTER_LIMIT);
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'applicant_attachments',
      filter: `applicant_id=in.(${chunk.join(',')})`,
    }, request);
  }
  channel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      if (subscribed || interrupted) visibleCatchUp();
      subscribed = true;
      interrupted = false;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      interrupted = true;
    }
  });
  setPolling();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', visibleCatchUp);
  window.addEventListener('online', visibleCatchUp);

  return {
    request,
    // A read started before a completed upload cannot satisfy its refresh.
    invalidate: () => { generation++; },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(scheduled);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', visibleCatchUp);
      window.removeEventListener('online', visibleCatchUp);
      void (supabase as any).removeChannel(channel);
    },
  };
};
