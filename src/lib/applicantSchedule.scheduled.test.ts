import { describe, expect, it } from 'vitest';
import { isScheduledForInterview } from './applicantSchedule';

describe('isScheduledForInterview', () => {
  it('is true once an interview date is set', () => {
    expect(isScheduledForInterview({ interview_date: '2026-10-28' })).toBe(true);
  });

  it('is false for an applicant nobody has scheduled', () => {
    expect(isScheduledForInterview({ interview_date: null })).toBe(false);
    expect(isScheduledForInterview({ interview_date: '' })).toBe(false);
    expect(isScheduledForInterview({ interview_date: '   ' })).toBe(false);
    expect(isScheduledForInterview({})).toBe(false);
    expect(isScheduledForInterview(null)).toBe(false);
  });

  it('keeps an applicant whose interview has already happened', () => {
    // The date stays on the row after the interview while the status moves on
    // to For Evaluation. The interviewer still has to score them, so reading
    // the status instead would drop them off the list.
    expect(isScheduledForInterview({ interview_date: '2020-01-01' })).toBe(true);
  });
});
