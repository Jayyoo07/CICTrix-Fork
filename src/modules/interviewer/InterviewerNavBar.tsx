// Top navigation bar for every Interviewer Portal page (DESIGN_IDENTITY §8.2):
// the shared PortalHeader with the interviewer's own logout.

import { useNavigate } from 'react-router-dom';
import { PortalHeader } from '../../components/portal-header';
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

  return (
    <PortalHeader
      homeHref="/interviewer/dashboard"
      userName={session?.name || 'Interviewer'}
      roleLabel="Interviewer Portal"
      // Never fall through to the admin sign-out from the interviewer portal.
      onLogout={onLogout ?? (() => navigate('/interviewer/login', { replace: true }))}
    />
  );
}
