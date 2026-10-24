// Top navigation bar for every Interviewer Portal page (DESIGN_IDENTITY §8.2),
// with its logout confirmation. Render it inside an `.abyan-ds.ivd` wrapper.

import { LogOut, UserCircle2 } from 'lucide-react';
import { ConfirmLogoutDialog } from '../../components/ConfirmLogoutDialog';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import abyanLogo from '../../assets/abyan-logo.png';
import '../../styles/abyan-tokens.css';
import '../../styles/interviewer-dashboard.css';

export interface InterviewerNavSession {
  email: string;
  name: string;
}

export function InterviewerNavBar({
  session,
  onLogout,
}: {
  session?: InterviewerNavSession | null;
  onLogout?: () => void;
}) {
  const navigate = useNavigate();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  return (
    <>
      <nav className="ivd-nav" aria-label="Interviewer Portal">
        <button type="button" className="ivd-brand" onClick={() => navigate('/interviewer/dashboard')}>
          <img src={abyanLogo} alt="" />
          <span className="ivd-brand-name">ABYAN</span>
          <span className="ivd-brand-sub">Human Resource Information System</span>
        </button>

        <div className="ivd-user">
          <span className="ivd-user-avatar" aria-hidden="true">
            <UserCircle2 size={20} strokeWidth={1.75} />
          </span>
          <span className="ivd-user-meta">
            <span className="ivd-user-name" title={session?.name}>{session?.name || 'Interviewer'}</span>
            <span className="ivd-user-role">Interviewer Portal</span>
          </span>
          {onLogout && (
            <>
              <span className="ivd-nav-divider" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="ivd-logout"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="ivd-logout-label">Logout</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {/* One shared confirmation across every portal (§9.10). */}
      <ConfirmLogoutDialog
        open={logoutConfirmOpen}
        sessionLabel="Interviewer Portal"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => { setLogoutConfirmOpen(false); onLogout?.(); }}
      />
    </>
  );
}
