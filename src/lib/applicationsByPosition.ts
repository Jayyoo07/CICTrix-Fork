/**
 * Which applications belong to a job position, as the Applications tab lists
 * them (docs/plans/2026-10-22-job-posts-tabs-and-applicants-link.md).
 *
 * Applications reach a position through its plantillas, not a posting id: the
 * applicant portal writes `applicants.plantilla_slot_id`, and one application
 * can cover several plantillas through `application_plantilla_slots`. An
 * application belongs to a position when any of those plantillas is one of
 * the position's, or (older rows) its `job_posting_id` is the position id.
 *
 * Job Posts › Job Vacancies uses the same rule for its "Applicants (N)" count,
 * so the number on the button is what the filtered Applications tab shows.
 */

export const isShortlistedStatus = (status: string) =>
  status.trim().toLowerCase().includes('shortlist');

export const isQualifiedStatus = (status: string) => {
  const s = status.trim().toLowerCase();
  return s.includes('qualified') || s.includes('recommended') || s.includes('hired') || s.includes('accepted');
};

export const isDisqualifiedStatus = (status: string) => {
  const s = status.trim().toLowerCase();
  return s.includes('not qualified') || s.includes('disqualif') || s.includes('reject');
};

/**
 * Listed on the Applications tab: its main table or its Shortlisted section.
 * Qualified applicants have their own tab; disqualified ones are not listed.
 */
export const isListedOnApplicationsTab = (status: string) =>
  !isQualifiedStatus(status) && !isDisqualifiedStatus(status);

export interface PositionApplication {
  id: string;
  /** The application's own plantilla (applicant portal). */
  plantillaSlotId?: string | null;
  /** Legacy link to the posting. */
  jobPostingId?: string | null;
}

/**
 * `slotIds` are the position's plantilla slot ids; `linkedSlotIds` maps an
 * application id to every plantilla slot id it is linked to.
 */
export const belongsToPosition = (
  application: PositionApplication,
  positionId: string,
  slotIds: ReadonlySet<string>,
  linkedSlotIds: ReadonlyMap<string, readonly string[]>,
): boolean => {
  if (application.jobPostingId && application.jobPostingId === positionId) return true;
  if (application.plantillaSlotId && slotIds.has(application.plantillaSlotId)) return true;
  return (linkedSlotIds.get(application.id) ?? []).some((slotId) => slotIds.has(slotId));
};

export interface CountablePosition {
  id: string;
  plantillaSlots?: Array<{ id: string }>;
}

/** Applications the filtered Applications tab lists, per position id. */
export const countListedApplicationsByPosition = (
  positions: readonly CountablePosition[],
  applications: ReadonlyArray<PositionApplication & { status: string }>,
  linkedSlotIds: ReadonlyMap<string, readonly string[]>,
): Map<string, number> => {
  const listed = applications.filter((application) => isListedOnApplicationsTab(application.status));
  return new Map(positions.map((position) => {
    const slotIds = new Set((position.plantillaSlots ?? []).map((slot) => slot.id));
    return [position.id, listed.filter((application) => belongsToPosition(application, position.id, slotIds, linkedSlotIds)).length];
  }));
};
