import { ReactNode } from 'react';
import { readAdminSession } from '../lib/adminSession';
import { AdminHeader } from './AdminHeader';
import { Sidebar } from './Sidebar';
import { useLocation } from 'react-router-dom';

interface AdminLayoutProps {
  children: ReactNode;
  /**
   * Optionally replace the default Sidebar with a custom one
   * (e.g. for L&D Dashboard which currently uses LndSidebar)
   */
  customSidebar?: ReactNode;
  userName?: string;
  divisionLabel?: string;
  division?: 'super' | 'rsp' | 'lnd' | 'pm';
  onNotificationClick?: (item: any) => void;
}

export const AdminLayout = ({ children, customSidebar, userName = 'Admin', divisionLabel = 'HRIS Admin' }: AdminLayoutProps) => {
  // Subscribes to navigation so the session-derived header below re-reads on every route change.
  useLocation();

  // Try to determine user role and name from session for the header
  let sessionName = userName;
  let sessionDivision = divisionLabel;
  
  try {
    const parsed = readAdminSession();
    if (parsed) {
      if (parsed.email) {
        // Just use email prefix as name if not available
        sessionName = parsed.email.split('@')[0];
      }
      if (parsed.role) {
        if (parsed.role === 'super-admin') {
          sessionDivision = 'System Administrator';
          sessionName = 'Super Admin';
        } else if (parsed.role === 'rsp') {
          sessionDivision = 'RSP Admin';
        } else if (parsed.role === 'lnd') {
          sessionDivision = 'L&D Admin';
        } else if (parsed.role === 'pm') {
          sessionDivision = 'PM Admin';
        }
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  return (
    <div className="h-screen flex flex-col bg-app text-text-primary overflow-hidden font-sans selection:bg-brand-soft selection:text-brand">
      <AdminHeader userName={sessionName} divisionLabel={sessionDivision} />
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {customSidebar !== undefined ? customSidebar : <Sidebar />}
        {/* min-w-0 keeps wide content inside this column instead of widening the page */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
