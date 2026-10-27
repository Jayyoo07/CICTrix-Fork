import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CandidateEvidenceReviewModal } from './CandidateEvidenceReviewModal';
import { supabase } from '../lib/supabase';
import * as successionReviews from '../lib/api/successionReviews';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('CandidateEvidenceReviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCandidate = { employeeId: 'emp-101', name: 'Juan Dela Cruz' };
  const mockPosition = {
    id: 'pos-202',
    title: 'Senior IT Officer',
    requirements: {
      experienceYears: 3,
      trainingHours: 40,
      education: { minimum: 'bachelor' as const, field: 'IT' },
      eligibility: { kind: 'required' as const, key: 'CSC Professional' },
    },
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CandidateEvidenceReviewModal
        isOpen={false}
        onClose={vi.fn()}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads and displays evidence items and allows saving reviews', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'employee_work_experience') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'work-1',
                  position_title: 'Junior Programmer',
                  company_name: 'City Hall',
                  department_agency_office_company: 'City Hall',
                  from_date: '2021-01-01',
                  to_date: '2024-01-01',
                  is_present: false,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employee_training') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 't-1',
                  training_title: 'Fullstack Development',
                  number_of_hours: 40,
                  from_date: '2023-05-01',
                  to_date: '2023-05-05',
                  conducted_by: 'DICT',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employee_education') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ed-1',
                  level: 'College',
                  course: 'BS Computer Science',
                  year_graduated: 2020,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employee_eligibility') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'el-1',
                  eligibility_type: 'CSC Professional',
                  validity_date: null,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
    });

    vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
    const batchSaveSpy = vi.spyOn(successionReviews, 'batchSaveSuccessionReviews').mockResolvedValue([]);
    const onSavedMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <CandidateEvidenceReviewModal
        isOpen={true}
        onClose={onCloseMock}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={onSavedMock}
      />,
    );

    expect(screen.getByText('Loading evidence records...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Junior Programmer')).toBeInTheDocument();
      expect(screen.getByText('Fullstack Development')).toBeInTheDocument();
      expect(screen.getByText('BS Computer Science')).toBeInTheDocument();
      expect(screen.getAllByText('CSC Professional').length).toBeGreaterThanOrEqual(1);
    });

    // Toggle checkboxes
    const relevantCheckboxes = screen.getAllByRole('checkbox');
    expect(relevantCheckboxes.length).toBeGreaterThan(0);
    fireEvent.click(relevantCheckboxes[0]);

    // Click Save Review
    const saveButton = screen.getByRole('button', { name: 'Save Review' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(batchSaveSpy).toHaveBeenCalled();
      expect(onSavedMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
