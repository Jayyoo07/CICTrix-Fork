import { describe, expect, it } from 'vitest';
import { computeNewlyHiredStats, isHiredApplicantStatus } from './newlyHiredStats';

describe('isHiredApplicantStatus', () => {
  it('accepts the stored spellings, whatever the casing or padding', () => {
    expect(isHiredApplicantStatus('Hired')).toBe(true);
    expect(isHiredApplicantStatus('  hired ')).toBe(true);
    expect(isHiredApplicantStatus('Accept')).toBe(true);
  });

  it('rejects everything else, including the near misses', () => {
    expect(isHiredApplicantStatus('Not Selected')).toBe(false);
    expect(isHiredApplicantStatus('Accepted')).toBe(false);
    expect(isHiredApplicantStatus('')).toBe(false);
    expect(isHiredApplicantStatus(null)).toBe(false);
  });
});

describe('computeNewlyHiredStats', () => {
  it('counts nobody when there is nothing to count', () => {
    expect(computeNewlyHiredStats([], [])).toEqual({
      total: 0,
      withCredentials: 0,
      pendingCredentials: 0,
    });
  });

  it('splits the hired between credentialled and pending', () => {
    const stats = computeNewlyHiredStats(
      [
        { id: 'a', status: 'Hired' },
        { id: 'b', status: 'Hired' },
        { id: 'c', status: 'Not Selected' },
      ],
      [
        { applicant_id: 'a', employee_id: 'EMP-001' },
        { applicant_id: 'b', employee_id: null },
      ],
    );
    expect(stats).toEqual({ total: 2, withCredentials: 1, pendingCredentials: 1 });
  });

  it('counts an applicant with a newly_hired row even when the status is stale', () => {
    const stats = computeNewlyHiredStats(
      [{ id: 'a', status: 'For Evaluation' }],
      [{ applicant_id: 'a', employee_id: 'EMP-002' }],
    );
    expect(stats).toEqual({ total: 1, withCredentials: 1, pendingCredentials: 0 });
  });

  it('keeps the credentialled row when an applicant has duplicates', () => {
    // Legacy confirm-hire wrote a second row per applicant; the one without an
    // employee number must not mask the one that has it.
    const withCredentialLast = computeNewlyHiredStats(
      [{ id: 'a', status: 'Hired' }],
      [
        { applicant_id: 'a', employee_id: null },
        { applicant_id: 'a', employee_id: 'EMP-003' },
      ],
    );
    const withCredentialFirst = computeNewlyHiredStats(
      [{ id: 'a', status: 'Hired' }],
      [
        { applicant_id: 'a', employee_id: 'EMP-003' },
        { applicant_id: 'a', employee_id: null },
      ],
    );
    expect(withCredentialLast).toEqual({ total: 1, withCredentials: 1, pendingCredentials: 0 });
    expect(withCredentialFirst).toEqual({ total: 1, withCredentials: 1, pendingCredentials: 0 });
  });

  it('ignores newly_hired rows with no applicant id', () => {
    const stats = computeNewlyHiredStats(
      [{ id: 'a', status: 'Hired' }],
      [{ applicant_id: '   ', employee_id: 'EMP-004' }],
    );
    expect(stats).toEqual({ total: 1, withCredentials: 0, pendingCredentials: 1 });
  });
});
