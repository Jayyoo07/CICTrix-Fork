import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionFeedback, loginPathFor } from './index';

describe('session-expired failures', () => {
  it('offers sign-in instead of retry', () => {
    render(<ActionFeedback title="We couldn't save the score." message="Your session has expired, so nothing was saved." context="session" onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('sends each portal to its own sign-in page', () => {
    expect(loginPathFor('/admin/rsp/applicant-score')).toBe('/admin/login');
    expect(loginPathFor('/interviewer/dashboard')).toBe('/interviewer/login');
    expect(loginPathFor('/office/dashboard')).toBe('/employee/login');
    expect(loginPathFor('/employee/dashboard')).toBe('/employee/login');
  });
});
