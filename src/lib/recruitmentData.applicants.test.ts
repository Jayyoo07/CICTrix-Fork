import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrder = vi.fn();
const mockSelect = vi.fn(() => ({ order: mockOrder }));
const mockFrom = vi.fn((table: string) => {
  if (table === 'applicants') {
    return { select: mockSelect };
  }
  return { select: vi.fn() };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

vi.mock('./plantillaSlots', () => ({
  fetchSlotsByJobPosting: vi.fn(),
}));

import { getApplicantsFromSupabase } from './recruitmentData';

describe('getApplicantsFromSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('queries Supabase directly and returns mapped applicants', async () => {
    const mockDbRows = [
      {
        id: 'app-1',
        reference_no: 'REF-001',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        middle_name: 'Santos',
        email: 'juan@example.ph',
        contact_number: '09123456789',
        address: 'Manila, Philippines',
        gender: 'Male',
        dob: '1995-05-15',
        item_number: 'ITEM-123',
        position: 'Administrative Aide VI',
        job_posting_id: 'job-101',
        application_type: 'job',
        status: 'Qualified',
        created_at: '2026-01-15T08:00:00Z',
        notes: ['Passed initial screening'],
        timeline: [{ event: 'Applied', date: '2026-01-15T08:00:00Z' }],
        employee_id: 'emp-55',
        current_position: 'Admin Aide IV',
        current_department: 'HRMO',
        current_division: 'Personnel',
        employee_username: 'jdelacruz',
        is_pwd: false,
      },
    ];

    mockOrder.mockResolvedValueOnce({ data: mockDbRows, error: null });

    const applicants = await getApplicantsFromSupabase();

    expect(mockFrom).toHaveBeenCalledWith('applicants');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });

    expect(applicants).toHaveLength(1);
    expect(applicants[0]).toEqual({
      id: 'app-1',
      referenceNo: 'REF-001',
      personalInfo: {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        middleName: 'Santos',
        email: 'juan@example.ph',
        phone: '09123456789',
        address: 'Manila, Philippines',
        gender: 'Male',
        dateOfBirth: '1995-05-15',
        itemNumber: 'ITEM-123',
      },
      position: 'Administrative Aide VI',
      jobPostingId: 'job-101',
      applicationType: 'job',
      status: 'Qualified',
      applicationDate: '2026-01-15T08:00:00Z',
      notes: ['Passed initial screening'],
      timeline: [{ event: 'Applied', date: '2026-01-15T08:00:00Z' }],
      qualificationScore: 0,
      education: [],
      experience: [],
      skills: [],
      certifications: [],
      documents: [],
      internalApplication: {
        employeeId: 'emp-55',
        currentPosition: 'Admin Aide IV',
        currentDepartment: 'HRMO',
        currentDivision: 'Personnel',
        employeeUsername: 'jdelacruz',
      },
      isPwd: false,
      createdAt: '2026-01-15T08:00:00Z',
    });
  });

  it('falls back to localStorage when Supabase returns an error', async () => {
    const localApplicants = [
      {
        id: 'local-1',
        personalInfo: { firstName: 'Maria', lastName: 'Clara' },
        status: 'Draft',
      },
    ];
    localStorage.setItem('cictrix_qualified_applicants', JSON.stringify(localApplicants));

    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'Connection timeout' } });

    const applicants = await getApplicantsFromSupabase();

    expect(applicants).toEqual(localApplicants);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[recruitmentData] Failed to fetch applicants from Supabase:'),
      expect.anything(),
    );
  });

  it('falls back to localStorage when Supabase throws an exception', async () => {
    const localApplicants = [
      {
        id: 'local-2',
        personalInfo: { firstName: 'Crisostomo', lastName: 'Ibarra' },
        status: 'Pending',
      },
    ];
    localStorage.setItem('cictrix_qualified_applicants', JSON.stringify(localApplicants));

    mockOrder.mockRejectedValueOnce(new Error('Network failure'));

    const applicants = await getApplicantsFromSupabase();

    expect(applicants).toEqual(localApplicants);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[recruitmentData] Exception fetching applicants from Supabase:'),
      expect.anything(),
    );
  });

  it('falls back to localStorage when returned data is not an array', async () => {
    const localApplicants = [
      {
        id: 'local-3',
        personalInfo: { firstName: 'Basilio', lastName: 'Sison' },
        status: 'Pending',
      },
    ];
    localStorage.setItem('cictrix_qualified_applicants', JSON.stringify(localApplicants));

    mockOrder.mockResolvedValueOnce({ data: null, error: null });

    const applicants = await getApplicantsFromSupabase();

    expect(applicants).toEqual(localApplicants);
  });
});
