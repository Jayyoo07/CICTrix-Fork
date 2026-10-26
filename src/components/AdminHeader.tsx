import { useLocation } from 'react-router-dom';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { PortalHeader } from './portal-header';

interface AdminHeaderProps {
  /** Display name shown next to the avatar (e.g. "Alex Gonzales") */
  userName?: string;
  /** Division/role label shown below the user name (e.g. "L&D Division") */
  divisionLabel?: string;
}

const getPortalHome = (pathname: string): string => {
  if (pathname.startsWith('/admin/rsp')) return '/admin/rsp';
  if (pathname.startsWith('/admin/lnd')) return '/admin/lnd';
  if (pathname.startsWith('/admin/pm'))  return '/admin/pm';
  if (pathname.startsWith('/interviewer')) return '/interviewer/dashboard';
  return '/admin?module=dashboard';
};

/** The admin portals' top bar: the shared PortalHeader with the admin sign-out. */
export const AdminHeader = ({
  userName = 'Admin',
  divisionLabel = 'HRIS Admin',
}: AdminHeaderProps) => {
  const { pathname } = useLocation();

  return (
    <PortalHeader
      homeHref={getPortalHome(pathname)}
      userName={userName}
      roleLabel={divisionLabel}
      mockData={getPreferredDataSourceMode() === 'local'}
    />
  );
};
