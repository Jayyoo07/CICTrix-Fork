import type { ReactNode } from 'react';
import { Briefcase, ClipboardCheck, FileText, KeyRound, UserCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { label: 'Applications',        path: '/admin/rsp/applications', icon: FileText },
  { label: 'Qualified Applicants', path: '/admin/rsp/qualified', icon: UserCheck },
  { label: 'Applicant Score',      path: '/admin/rsp/applicant-score', icon: ClipboardCheck },
  { label: 'For Hiring',           path: '/admin/rsp/for-hiring', icon: Briefcase },
  { label: 'Generate Employee Credentials', path: '/admin/rsp/credentials', icon: KeyRound },
] as const;

interface ApplicantsTabBarProps {
  /** Page title; with it, the tabs sit on the bottom edge of the header, as in Job Posts. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Shown above the title (e.g. a back link). */
  breadcrumb?: ReactNode;
  /** Shown at the header's right (e.g. Clear filter). */
  actions?: ReactNode;
}

/**
 * Applicants pages' header: title, subtitle and the DESIGN_IDENTITY §9.2 tab
 * row in one white block, the same pattern as Job Posts.
 *
 * It sticks while the page scrolls, so the title and the tabs stay readable
 * down a long table. `top-14 sm:top-16` is the height of the AdminHeader bar
 * above it (§8.2), which is itself sticky, and z-30 sits under that bar's
 * z-40 so the two never overlap. Nothing in .admin-layout or .admin-content
 * sets overflow, so the window stays the scroll container and this works.
 */
export const ApplicantsTabBar = ({ title, subtitle, breadcrumb, actions }: ApplicantsTabBarProps) => {
  const { pathname } = useLocation();

  const isActive = (path: string) =>
    pathname === path ||
    (path === '/admin/rsp/applications' && pathname === '/admin/rsp/jobs');

  return (
    <div className="sticky top-14 z-30 sm:top-16 border-b border-slate-200 bg-white px-8 pt-6">
      {title !== undefined && (
        <div className="mb-4 flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            {breadcrumb}
            <h1 className={`!mb-1 !text-2xl font-bold ${breadcrumb ? 'mt-1' : ''}`}>{title}</h1>
            {subtitle !== undefined && <p className="!mb-0 text-base text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto">{actions}</div>}
        </div>
      )}
      <nav className="scrollbar-hidden -mb-px flex gap-2 overflow-x-auto" aria-label="Applicants tabs">
        {TABS.map((tab) => {
          const selected = isActive(tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={selected ? 'page' : undefined}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-slate-500 hover:text-[var(--color-primary-900)]'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
