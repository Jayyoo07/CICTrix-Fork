import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ApplicantsTabBar } from './ApplicantsTabBar';

const renderAt = (path: string, props: Parameters<typeof ApplicantsTabBar>[0] = {}) =>
  render(<MemoryRouter initialEntries={[path]}><ApplicantsTabBar {...props} /></MemoryRouter>);

describe('ApplicantsTabBar', () => {
  it('puts the title, subtitle and tabs in one header, as Job Posts does', () => {
    renderAt('/admin/rsp/for-hiring', { title: 'For Hiring', subtitle: 'Select one applicant per plantilla.' });
    expect(screen.getByRole('heading', { level: 1, name: 'For Hiring' })).toBeTruthy();
    expect(screen.getByText('Select one applicant per plantilla.')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Applicants tabs' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Applications', 'Qualified Applicants', 'Applicant Score', 'For Hiring', 'Generate Employee Credentials',
    ]);
  });

  it('marks only the current page', () => {
    renderAt('/admin/rsp/qualified', { title: 'Qualified Applicants' });
    expect(screen.getByRole('link', { name: 'Qualified Applicants' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('aria-current')).toBeNull();
  });

  it('renders the back link and actions slots', () => {
    renderAt('/admin/rsp/applications', {
      title: 'Applicants for Engineer III',
      breadcrumb: <a href="/admin/rsp/jobs">Back to Job Vacancies</a>,
      actions: <button type="button">Clear filter</button>,
    });
    expect(screen.getByRole('link', { name: 'Back to Job Vacancies' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeTruthy();
  });
});
