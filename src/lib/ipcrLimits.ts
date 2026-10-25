/**
 * Character limits for IPCR free-text fields.
 *
 * Sized from the 760-row production IPCR corpus: the longest MFO was 94
 * characters, Success Indicator 150, Actual Accomplishment 304 (average 257),
 * and Remarks 200 or fewer. A single 280-character cap would have put every
 * longer accomplishment over the limit, so each field gets its own ceiling.
 *
 * Enforced in the UI only. The backing columns are unbounded `text`, so these
 * limits can be raised without a migration and existing rows never need
 * trimming.
 */
export const IPCR_LIMITS = {
  /** MFO / PAP title. */
  mfo: 120,
  /** Success Indicator description (target + measure). */
  successIndicator: 280,
  /** Actual Accomplishment in Phase 2. */
  accomplishment: 500,
  /** Employee's own Phase 2 remarks. */
  remarks: 200,
  /** Reviewer's reason for returning a target or accomplishment. */
  reviewComment: 500,
} as const;
