import { describe, expect, it } from 'vitest';
import { dedupeApplicants } from './InterviewerApplicantsList';

const applicant = (over: Record<string, unknown>) =>
  ({
    id: '', item_number: '', first_name: '', middle_name: null, last_name: '',
    email: '', position: 'Engineer II', office: '', contact_number: '',
    status: 'Shortlisted', created_at: '2026-10-01T00:00:00Z',
    evaluation_status: 'Not Yet Rated', ...over,
  }) as any;

describe('dedupeApplicants', () => {
  it('keeps candidates competing for the same plantilla apart', () => {
    // The defect behind "6 applicants, 1 row": item_number names the plantilla,
    // not the person, so every candidate for it carries the same value.
    const rows = [
      applicant({ id: 'a', item_number: 'PLT-22', email: 'ana@x.ph', first_name: 'Ana' }),
      applicant({ id: 'b', item_number: 'PLT-22', email: 'ben@x.ph', first_name: 'Ben' }),
      applicant({ id: 'c', item_number: 'PLT-22', email: 'cy@x.ph', first_name: 'Cy' }),
    ];
    expect(dedupeApplicants(rows).map((r) => r.first_name)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('still merges one applicant arriving from both sources', () => {
    const rows = [
      applicant({ id: 'a', email: 'ana@x.ph', created_at: '2026-10-01T00:00:00Z', status: 'Shortlisted' }),
      applicant({ id: 'a', email: 'ana@x.ph', created_at: '2026-10-05T00:00:00Z', status: 'For Evaluation' }),
    ];
    const merged = dedupeApplicants(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('For Evaluation'); // the newer row wins
  });

  it('falls back to email, then name, when a row carries no id', () => {
    const rows = [
      applicant({ email: 'ana@x.ph' }),
      applicant({ email: 'ana@x.ph' }),
      applicant({ first_name: 'Ben', last_name: 'Cruz' }),
    ];
    expect(dedupeApplicants(rows)).toHaveLength(2);
  });
});
