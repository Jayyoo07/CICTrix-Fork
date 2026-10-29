/** Saved baselines are independent: saving one phase must not acknowledge edits in another. */
export interface IpcrSavedSnapshot {
  targetRowsJson: string;
  employeeTargets: { core: string; strategic: string; support: string };
  accomplishmentsJson: string;
  selfRatingsJson: string;
  ipcrRowsJson: string;
}

export function updateSavedTargets(
  snapshot: IpcrSavedSnapshot | null,
  targetRows: unknown,
  employeeTargets: IpcrSavedSnapshot['employeeTargets'],
): IpcrSavedSnapshot | null {
  if (!snapshot) return null;
  return { ...snapshot, targetRowsJson: JSON.stringify(targetRows), employeeTargets: { ...employeeTargets } };
}

export function updateSavedAccomplishments(
  snapshot: IpcrSavedSnapshot | null,
  accomplishments: unknown,
  selfRatings: unknown,
): IpcrSavedSnapshot | null {
  if (!snapshot) return null;
  return { ...snapshot, accomplishmentsJson: JSON.stringify(accomplishments), selfRatingsJson: JSON.stringify(selfRatings) };
}
