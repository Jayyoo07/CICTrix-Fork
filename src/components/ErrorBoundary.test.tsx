import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = (): never => { throw new Error('Cannot read properties of undefined (reading "x") at Foo.tsx:12'); };

describe('ErrorBoundary', () => {
  it('shows a friendly page with a way to recover, never the raw error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary scope="RSP portal" homeHref="/admin/rsp"><Boom /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("We couldn't show the RSP portal.");
    expect(alert.textContent).toContain('Anything you had already saved is kept');
    expect(alert.textContent).not.toContain('Cannot read properties');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to home' })).toBeTruthy();
  });

  it('renders children when nothing fails', () => {
    render(<ErrorBoundary><p>Fine</p></ErrorBoundary>);
    expect(screen.getByText('Fine')).toBeTruthy();
  });
});
