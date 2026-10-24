import { supabase } from './supabase';
import type {
  ApplicationSlotStatus,
  PlantillaSlot,
  PlantillaSlotStatus,
} from '../types/recruitment.types';
import {
  internalPlantillaKey,
  isPlantillaHasApplicationsError,
  plantillaLabel,
  slotNumbersForLabels,
  validatePlantillaLabels,
} from './plantillaRules';

/**
 * Plantilla slots — the vacancies inside a job post.
 *
 * One Job Post used to mean one plantilla item number, so filling four
 * identical vacancies meant four postings. Since migration 20260922 the
 * vacancy lives in its own row (`plantilla_slots`) and an application is
 * linked to one or more of them through `application_plantilla_slots`.
 *
 * Everything here degrades quietly when the migration has not been applied
 * yet: reads return empty, writes report `{ ok: false, error }`. The Job Posts
 * page keeps working off `job_postings.item_number` in that state rather than
 * blanking out.
 */

// Flat result shape, matching the rest of src/lib/api (strict:false means a
// discriminated union would not narrow here).
export type SlotResult<T = void> = { ok: boolean; error?: string; data?: T };

const client = supabase as any;

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

/** True when the failure is "migration 20260922 has not been applied yet". */
export const isMissingSlotSchema = (error: any): boolean => {
  if (!error) return false;
  const code = String(error?.code ?? '');
  if (MISSING_TABLE_CODES.has(code)) return true;
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('plantilla_slots') &&
    (message.includes('does not exist') || message.includes('could not find'))
  );
};

export const normalizeItemNumber = (value: string | null | undefined): string =>
  String(value ?? '').trim().toLowerCase();

const toSlot = (row: any): PlantillaSlot => ({
  id: String(row?.id ?? ''),
  jobPostingId: String(row?.job_posting_id ?? ''),
  slotNumber: Number(row?.slot_number ?? 1) || 1,
  label: row?.label ? String(row.label).trim() : undefined,
  itemNumber: String(row?.item_number ?? '').trim(),
  salaryGrade: row?.salary_grade == null ? undefined : Number(row.salary_grade),
  monthlySalary: row?.monthly_salary == null ? undefined : Number(row.monthly_salary),
  status: (String(row?.status ?? 'open') as PlantillaSlotStatus),
  filledByApplicantId: row?.filled_by_applicant_id ? String(row.filled_by_applicant_id) : undefined,
  filledAt: row?.filled_at ? String(row.filled_at) : undefined,
  reservedByApplicantId: row?.reserved_by_applicant_id ? String(row.reserved_by_applicant_id) : undefined,
  reservedAt: row?.reserved_at ? String(row.reserved_at) : undefined,
  signingDeadline: row?.signing_deadline ? String(row.signing_deadline) : undefined,
  division: row?.division ? String(row.division).trim() : undefined,
  summary: row?.summary ? String(row.summary).trim() : undefined,
  // text[] or jsonb depending on the environment; both arrive as arrays.
  responsibilities: Array.isArray(row?.responsibilities)
    ? row.responsibilities.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
    : undefined,
});

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Every slot in the system, grouped by job posting id. */
export const fetchSlotsByJobPosting = async (): Promise<Map<string, PlantillaSlot[]>> => {
  const grouped = new Map<string, PlantillaSlot[]>();
  try {
    const { data, error } = await client
      .from('plantilla_slots')
      .select('*')
      .order('slot_number', { ascending: true });

    if (error) {
      if (!isMissingSlotSchema(error)) {
        console.warn('[plantillaSlots] slot fetch failed:', error);
      }
      return grouped;
    }

    (data ?? []).forEach((row: any) => {
      const slot = toSlot(row);
      if (!slot.jobPostingId) return;
      const bucket = grouped.get(slot.jobPostingId);
      if (bucket) bucket.push(slot);
      else grouped.set(slot.jobPostingId, [slot]);
    });
  } catch (err) {
    console.warn('[plantillaSlots] slot fetch threw:', err);
  }
  return grouped;
};

export const fetchSlotsForJob = async (jobPostingId: string): Promise<PlantillaSlot[]> => {
  if (!jobPostingId) return [];
  try {
    const { data, error } = await client
      .from('plantilla_slots')
      .select('*')
      .eq('job_posting_id', jobPostingId)
      .order('slot_number', { ascending: true });
    if (error) {
      if (!isMissingSlotSchema(error)) console.warn('[plantillaSlots] fetchSlotsForJob failed:', error);
      return [];
    }
    return (data ?? []).map(toSlot);
  } catch (err) {
    console.warn('[plantillaSlots] fetchSlotsForJob threw:', err);
    return [];
  }
};

export type ApplicantSlotLink = {
  applicantId: string;
  slotId: string;
  status: ApplicationSlotStatus;
};

/** Every application -> slot link, keyed by applicant id. */
export const fetchApplicantSlotLinks = async (
  applicantIds?: string[],
): Promise<Map<string, ApplicantSlotLink[]>> => {
  const grouped = new Map<string, ApplicantSlotLink[]>();
  try {
    let query = client.from('application_plantilla_slots').select('applicant_id, plantilla_slot_id, status');
    if (applicantIds && applicantIds.length > 0) {
      query = query.in('applicant_id', applicantIds);
    }
    const { data, error } = await query;
    if (error) {
      if (!isMissingSlotSchema(error)) console.warn('[plantillaSlots] link fetch failed:', error);
      return grouped;
    }
    (data ?? []).forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '');
      if (!applicantId) return;
      const link: ApplicantSlotLink = {
        applicantId,
        slotId: String(row?.plantilla_slot_id ?? ''),
        status: (String(row?.status ?? 'applied') as ApplicationSlotStatus),
      };
      const bucket = grouped.get(applicantId);
      if (bucket) bucket.push(link);
      else grouped.set(applicantId, [link]);
    });
  } catch (err) {
    console.warn('[plantillaSlots] link fetch threw:', err);
  }
  return grouped;
};

// ─── Writes ─────────────────────────────────────────────────────────────────

export type SlotDraft = {
  /** Present when editing an existing row; absent for a newly added slot. */
  id?: string;
  /** Admin-entered name, e.g. "Plantilla 2". Required, unique per posting. */
  label: string;
  /** Internal key. Kept as-is for existing rows; generated for new ones. */
  itemNumber?: string;
  salaryGrade?: number;
  monthlySalary?: number;
  status?: PlantillaSlotStatus;
};

/**
 * Replace a posting's plantilla list with `drafts`, in order.
 *
 * Ordinals come from the array index, which is how the admin reorders
 * plantillas. Labels are what everyone sees. Internal item_number keys stay
 * attached to their own rows (applications match on them).
 */
export const saveSlotsForJob = async (
  jobPostingId: string,
  drafts: SlotDraft[],
): Promise<SlotResult<PlantillaSlot[]>> => {
  if (!jobPostingId) return { ok: false, error: 'Missing job posting id.' };
  const cleaned = drafts.map((draft) => ({
    ...draft,
    label: String(draft.label ?? '').trim().replace(/\s+/g, ' '),
    itemNumber: String(draft.itemNumber ?? '').trim(),
  }));

  const labelProblem = validatePlantillaLabels(cleaned.map((draft) => draft.label));
  if (labelProblem) return { ok: false, error: labelProblem };

  const existing = await fetchSlotsForJob(jobPostingId);
  const keptIds = new Set(cleaned.map((draft) => draft.id).filter(Boolean) as string[]);
  const removed = existing.filter((slot) => !keptIds.has(slot.id));

  // A plantilla with applications can't be deleted (the database refuses too);
  // say so before touching anything, so nothing is half-saved.
  if (removed.length > 0) {
    const counts = await fetchSlotApplicantCounts(jobPostingId);
    const blocked = removed.filter((slot) => (counts.get(slot.id) ?? 0) > 0);
    if (blocked.length > 0) {
      return {
        ok: false,
        error: `${blocked.map((slot) => plantillaLabel(slot)).join(', ')} already ${blocked.length === 1 ? 'has' : 'have'} applications and can't be removed. Close ${blocked.length === 1 ? 'it' : 'them'} instead.`,
      };
    }
  }

  // Every row carries an id, including brand-new ones. PostgREST rejects a
  // bulk payload whose objects do not all have the same keys (PGRST102), so
  // "id on some rows only" is not an option. For the same reason every row
  // also carries an item_number: the existing internal key, or a fresh one.
  const withIds = cleaned.map((draft) => ({
    ...draft,
    id: draft.id ?? crypto.randomUUID(),
    itemNumber: draft.itemNumber || internalPlantillaKey(),
  }));

  // Two passes. Ordinals are unique per posting, so writing the final numbers
  // straight onto rows that are being reshuffled would collide with the rows
  // still holding those numbers. Park the existing ones above the range first.
  // Labels are unique per posting too, so parked rows get a temporary label.
  // Without the label column, slot_number carries the typed plantilla number
  // (the UI shows "Plantilla <slot_number>"), so it can be large: park above
  // every number in play.
  const typedSlotNumbers = slotNumbersForLabels(withIds.map((draft) => draft.label));
  const parkOffset =
    Math.max(existing.length + cleaned.length, ...typedSlotNumbers, ...existing.map((slot) => slot.slotNumber)) + 100;

  const buildRows = (withLabel: boolean) =>
    withIds.map((draft, index) => ({
      id: draft.id,
      job_posting_id: jobPostingId,
      slot_number: withLabel ? index + 1 : typedSlotNumbers[index],
      ...(withLabel ? { label: draft.label } : {}),
      item_number: draft.itemNumber,
      salary_grade: draft.salaryGrade ?? null,
      monthly_salary: draft.monthlySalary ?? null,
      status: draft.status ?? 'open',
    }));

  const isMissingLabelColumn = (err: any) =>
    ['42703', 'PGRST204'].includes(String(err?.code ?? '')) && String(err?.message ?? '').includes('label');

  try {
    let labelSupported = true;
    const reshuffled = withIds.filter((draft) => keptIds.has(draft.id));
    for (let index = 0; index < reshuffled.length; index += 1) {
      const parkId = reshuffled[index].id;
      const parkPatch: Record<string, unknown> = { slot_number: parkOffset + index };
      if (labelSupported) parkPatch.label = `__parking_${parkId}`;
      // Plain UPDATEs, not an upsert: these rows already exist, and an upsert
      // payload this narrow would reset every column it omits.
      let { error: parkError } = await client.from('plantilla_slots').update(parkPatch).eq('id', parkId);
      if (parkError && isMissingLabelColumn(parkError)) {
        // Migration 20260928 not applied: ordinals only, labels live in the app.
        labelSupported = false;
        ({ error: parkError } = await client
          .from('plantilla_slots')
          .update({ slot_number: parkOffset + index })
          .eq('id', parkId));
      }
      if (parkError) throw parkError;
    }

    let { error: upsertError } = await client
      .from('plantilla_slots')
      .upsert(buildRows(labelSupported), { onConflict: 'id' });
    if (upsertError && labelSupported && isMissingLabelColumn(upsertError)) {
      ({ error: upsertError } = await client
        .from('plantilla_slots')
        .upsert(buildRows(false), { onConflict: 'id' }));
    }
    if (upsertError) throw upsertError;

    if (removed.length > 0) {
      const { error: deleteError } = await client
        .from('plantilla_slots')
        .delete()
        .in('id', removed.map((slot) => slot.id));
      if (deleteError) throw deleteError;
    }

    const saved = await fetchSlotsForJob(jobPostingId);
    return { ok: true, data: saved };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) {
      return {
        ok: false,
        error:
          'Plantilla slots are not available yet — migration 20260922_plantilla_slots.sql has not been applied to this database.',
      };
    }
    if (isPlantillaHasApplicationsError(err)) {
      return { ok: false, error: 'A plantilla that already has applications can\'t be removed. Close it instead.' };
    }
    const code = String(err?.code ?? '');
    const message = String(err?.message ?? err ?? '');
    if (code === '23505' || message.toLowerCase().includes('duplicate key')) {
      return {
        ok: false,
        error: message.includes('label')
          ? 'Two plantillas in this job post have the same name. Each name must be unique.'
          : 'Could not save the plantillas because of a conflict. Please try again.',
      };
    }
    console.error('[plantillaSlots] saveSlotsForJob failed:', err);
    return { ok: false, error: message || 'Could not save the plantillas.' };
  }
};

/**
 * Applicants per plantilla, keyed by slot id. Reads the 20260928 view, and
 * falls back to counting link rows when that migration isn't applied.
 */
export const fetchSlotApplicantCounts = async (jobPostingId?: string): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  try {
    let query = client.from('plantilla_slot_applicant_counts').select('plantilla_slot_id, applicant_count');
    if (jobPostingId) query = query.eq('job_posting_id', jobPostingId);
    const { data, error } = await query;
    if (!error) {
      (data ?? []).forEach((row: any) => counts.set(String(row.plantilla_slot_id), Number(row.applicant_count) || 0));
      return counts;
    }
  } catch {
    // fall through to the link-table count
  }
  const links = await fetchApplicantSlotLinks();
  links.forEach((list) => list.forEach((link) => counts.set(link.slotId, (counts.get(link.slotId) ?? 0) + 1)));
  return counts;
};

/** Link one application to the slots the applicant ticked. */
export const linkApplicationToSlots = async (
  applicantId: string,
  slotIds: string[],
): Promise<SlotResult> => {
  const ids = Array.from(new Set(slotIds.filter(Boolean)));
  if (!applicantId || ids.length === 0) return { ok: true };

  try {
    const { error } = await client
      .from('application_plantilla_slots')
      .upsert(
        ids.map((slotId) => ({
          applicant_id: applicantId,
          plantilla_slot_id: slotId,
          status: 'applied',
        })),
        { onConflict: 'applicant_id,plantilla_slot_id' },
      );
    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) return { ok: true };
    console.error('[plantillaSlots] linkApplicationToSlots failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

/**
 * Place a hire into a specific slot. The DB trigger stamps `filled_at`, marks
 * this applicant 'hired' on that slot and everyone else 'not_selected' — other
 * slots on the same posting stay open and keep taking applications.
 */
export const assignApplicantToSlot = async (
  slotId: string,
  applicantId: string,
): Promise<SlotResult> => {
  if (!slotId || !applicantId) return { ok: false, error: 'Missing slot or applicant.' };
  try {
    const { data: current, error: readError } = await client
      .from('plantilla_slots')
      .select('id, status, filled_by_applicant_id')
      .eq('id', slotId)
      .single();
    if (readError) throw readError;

    if (current?.status === 'filled' && String(current?.filled_by_applicant_id ?? '') !== applicantId) {
      return { ok: false, error: 'That plantilla slot has already been filled by another applicant.' };
    }

    const { error } = await client
      .from('plantilla_slots')
      .update({ status: 'filled', filled_by_applicant_id: applicantId })
      .eq('id', slotId);
    if (error) throw error;

    await client
      .from('applicants')
      .update({ needs_slot_reassignment: false })
      .eq('id', applicantId);

    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) {
      return { ok: false, error: 'Plantilla slots are not available yet — apply migration 20260922.' };
    }
    console.error('[plantillaSlots] assignApplicantToSlot failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

export const setSlotStatus = async (
  slotId: string,
  status: PlantillaSlotStatus,
): Promise<SlotResult> => {
  try {
    const { error } = await client.from('plantilla_slots').update({ status }).eq('id', slotId);
    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) return { ok: true };
    return { ok: false, error: String(err?.message ?? err) };
  }
};

// ─── Reservation (select → contract signing) ────────────────────────────────

/**
 * Reserve a plantilla for one selected applicant and move the application to
 * For Contract Signing. The database function locks the slot, so a second
 * admin selecting someone else gets "already reserved for <name>" back.
 */
export const reserveSlotForApplicant = async (
  slotId: string,
  applicantId: string,
  deadline: string,
  instructions: string,
): Promise<SlotResult> => {
  if (!slotId || !applicantId) return { ok: false, error: 'Missing plantilla or applicant.' };
  try {
    const { data, error } = await client.rpc('reserve_plantilla_slot', {
      p_slot_id: slotId,
      p_applicant_id: applicantId,
      p_deadline: deadline,
      p_instructions: instructions,
    });
    if (error) throw error;
    return data ? { ok: false, error: String(data) } : { ok: true };
  } catch (err: any) {
    console.error('[plantillaSlots] reserveSlotForApplicant failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

/** "Did not report": reopen the plantilla and put the application back. */
export const revokeSlotReservation = async (applicantId: string): Promise<SlotResult> => {
  if (!applicantId) return { ok: false, error: 'Missing applicant.' };
  try {
    const { data, error } = await client.rpc('revoke_plantilla_reservation', { p_applicant_id: applicantId });
    if (error) throw error;
    return data ? { ok: false, error: String(data) } : { ok: true };
  } catch (err: any) {
    console.error('[plantillaSlots] revokeSlotReservation failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

// ─── Derived display helpers ────────────────────────────────────────────────

export type SlotSummary = {
  total: number;
  open: number;
  filled: number;
  closed: number;
  /** Aggregate label for the Job Posts list: "2/4 Open", "Fully Filled", … */
  label: string;
  tone: 'open' | 'filled' | 'closed' | 'none';
};

/**
 * Aggregate status for a posting. A post reads as Closed only when no slot is
 * still taking applications; "Fully Filled" is the stronger statement that
 * every slot found its hire.
 */
export const summarizeSlots = (slots: PlantillaSlot[] | undefined): SlotSummary => {
  const list = slots ?? [];
  const total = list.length;
  const open = list.filter((slot) => slot.status === 'open').length;
  const filled = list.filter((slot) => slot.status === 'filled').length;
  const closed = list.filter((slot) => slot.status === 'closed').length;

  if (total === 0) return { total, open, filled, closed, label: 'No slots', tone: 'none' };
  if (filled === total) return { total, open, filled, closed, label: 'Fully Filled', tone: 'filled' };
  if (open === 0) return { total, open, filled, closed, label: 'Closed', tone: 'closed' };
  return { total, open, filled, closed, label: `${open}/${total} Open`, tone: 'open' };
};
