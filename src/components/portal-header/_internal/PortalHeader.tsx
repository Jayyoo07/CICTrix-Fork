import { AlertTriangle, LogOut, UserCircle2 } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import abyanLogo from '../../../assets/abyan-logo.png';
import { clearAdminSession } from '../../../lib/adminSession';
import { supabase } from '../../../lib/supabase';
import { ConfirmLogoutDialog } from '../../ConfirmLogoutDialog';
import { NotificationBell, type NotificationBellProps } from './NotificationBell';
import { usePopoverDismiss } from './usePopover';
import './portal-header.css';

export interface AccountSwitch {
  /** The question in the popover, e.g. "Switch to your Office Account dashboard?" */
  prompt: string;
  onConfirm: () => void;
}

export interface PortalHeaderProps {
  /** Where the lockup goes: the portal home. */
  homeHref: string;
  userName: string;
  /** Role or portal under the name, e.g. "RSP Division". */
  roleLabel: string;
  /** Names the session in the logout prompt. Defaults to `roleLabel`. */
  sessionLabel?: string;
  /** Bell with its dropdown; the portal owns the items and read state. */
  notifications?: NotificationBellProps;
  /** Turns the avatar into a Switch Account control. */
  accountSwitch?: AccountSwitch;
  /** Shows the "Mock data mode" warning badge. */
  mockData?: boolean;
  /** Runs after the user confirms logout. Defaults to the admin sign-out. */
  onLogout?: () => void | Promise<void>;
  /** Module navigation rendered as a second row inside the bar, e.g. the Employee portal tabs. */
  nav?: ReactNode;
}

/**
 * The one top bar for every portal (DESIGN_IDENTITY §8.2). Portals differ only
 * by these props; layout, lockup, user block, notifications, account switch
 * and logout behave the same everywhere.
 */
export function PortalHeader({
  homeHref,
  userName,
  roleLabel,
  sessionLabel,
  notifications,
  accountSwitch,
  mockData = false,
  onLogout,
  nav,
}: PortalHeaderProps) {
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const closeSwitch = useCallback(() => setSwitchOpen(false), []);
  const switchRef = usePopoverDismiss<HTMLDivElement>(switchOpen, closeSwitch);

  const confirmLogout = async () => {
    setLogoutOpen(false);
    if (onLogout) {
      await onLogout();
      return;
    }
    clearAdminSession();
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // The local session is already cleared, so the user is signed out of
      // this tab either way; the server session expires on its own.
      console.warn('[PortalHeader] sign-out request failed', error);
    }
    // `replace` so Back after logging out cannot re-enter the portal (§8.2).
    navigate('/admin/login', { replace: true });
  };

  const avatar = (
    <span className="ph-avatar" aria-hidden="true">
      <UserCircle2 size={20} strokeWidth={1.75} />
    </span>
  );

  return (
    <>
      <header className="ph abyan-ds">
        <div className="ph-bar">
          <button
            type="button"
            className="ph-brand"
            aria-label="ABYAN HRIS, go to portal home"
            onClick={() => navigate(homeHref)}
          >
            <img src={abyanLogo} alt="" />
            <span className="ph-brand-name">ABYAN</span>
            <span className="ph-brand-sub">Human Resource Information System</span>
          </button>

          <div className="ph-right">
            {mockData && (
              <span className="ph-mock" title="This browser is showing locally stored mock data, not the live database.">
                <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="ph-mock-label">Mock data mode</span>
              </span>
            )}

            {notifications && <NotificationBell {...notifications} />}

            <div className="ph-user">
              {accountSwitch ? (
                <div className="ph-pop-anchor" ref={switchRef}>
                  <button
                    type="button"
                    className="ph-avatar ph-avatar-btn"
                    aria-label="Switch account"
                    title="Switch account"
                    aria-expanded={switchOpen}
                    onClick={() => setSwitchOpen((open) => !open)}
                  >
                    <UserCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  {switchOpen && (
                    <div className="ph-pop ph-switch" role="dialog" aria-label="Switch account">
                      <p>{accountSwitch.prompt}</p>
                      <div className="ph-switch-actions">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={closeSwitch}>Cancel</button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => { closeSwitch(); accountSwitch.onConfirm(); }}
                        >
                          Yes, Switch
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : avatar}
              <span className="ph-user-meta">
                <span className="ph-user-name" title={userName}>{userName}</span>
                <span className="ph-user-role" title={roleLabel}>{roleLabel}</span>
              </span>
            </div>

            <span className="ph-divider" aria-hidden="true" />

            <button
              type="button"
              className="ph-logout"
              aria-label="Logout"
              title="Logout"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="ph-logout-label">Logout</span>
            </button>
          </div>
        </div>

        {nav && <div className="ph-nav">{nav}</div>}
      </header>

      <ConfirmLogoutDialog
        open={logoutOpen}
        sessionLabel={sessionLabel ?? roleLabel}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => void confirmLogout()}
      />
    </>
  );
}
