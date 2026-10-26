import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PortalHeader, type PortalHeaderProps } from './index';

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } } }));

const renderHeader = (props: Partial<PortalHeaderProps> = {}) =>
  render(
    <MemoryRouter initialEntries={['/portal']}>
      <Routes>
        <Route path="/portal" element={<PortalHeader homeHref="/home" userName="Ana Cruz" roleLabel="RSP Division" {...props} />} />
        <Route path="/home" element={<p>Home page</p>} />
        <Route path="/admin/login" element={<p>Admin login</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('PortalHeader', () => {
  it('shows the lockup, the user and the role', () => {
    renderHeader();
    expect(screen.getByText('ABYAN')).toBeTruthy();
    expect(screen.getByText('Human Resource Information System')).toBeTruthy();
    expect(screen.getByText('Ana Cruz')).toBeTruthy();
    expect(screen.getByText('RSP Division')).toBeTruthy();
  });

  it('goes to the portal home from the lockup', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /go to portal home/ }));
    expect(screen.getByText('Home page')).toBeTruthy();
  });

  it('asks before logging out and runs the portal logout', async () => {
    const onLogout = vi.fn();
    renderHeader({ onLogout, sessionLabel: 'Employee Portal' });
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByText(/log out of your Employee Portal session/)).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Logout' }));
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  it('signs an admin out and replaces to the admin login by default', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Logout' }));
    expect(await screen.findByText('Admin login')).toBeTruthy();
    expect(signOut).toHaveBeenCalled();
  });

  it('shows notifications with an unread count', () => {
    const onToggle = vi.fn();
    const { rerender } = renderHeader({
      notifications: { items: [], unreadCount: 2, open: false, onToggle, onClose: vi.fn() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }));
    expect(onToggle).toHaveBeenCalled();
    rerender(
      <MemoryRouter>
        <PortalHeader
          homeHref="/home" userName="Ana Cruz" roleLabel="RSP Division"
          notifications={{
            items: [{ id: '1', title: 'Targets Needed', message: 'Submit your targets', createdAt: '2026-10-26T00:00:00Z', unread: true }],
            unreadCount: 1, open: true, onToggle, onClose: vi.fn(),
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Targets Needed')).toBeTruthy();
    expect(screen.getByText('1 new')).toBeTruthy();
  });

  it('switches account only after confirming', () => {
    const onConfirm = vi.fn();
    renderHeader({ accountSwitch: { prompt: 'Switch to your Office Account dashboard?', onConfirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(screen.getByText('Switch to your Office Account dashboard?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Switch' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the mock data badge only in mock mode', () => {
    renderHeader({ mockData: true });
    expect(screen.getByText('Mock data mode')).toBeTruthy();
  });
});
