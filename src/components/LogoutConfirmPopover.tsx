import { LogOut } from 'lucide-react';
import { clearAdminSession } from '../lib/adminSession';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ConfirmLogoutDialog } from './ConfirmLogoutDialog';

interface LogoutConfirmPopoverProps {
  /** Extra classes applied to the outer wrapper */
  className?: string;
  /** Override button content (defaults to icon + "Logout") */
  children?: React.ReactNode;
  /** Override button styles — applied instead of defaults */
  buttonClassName?: string;
  /** Inline style overrides for the trigger button */
  buttonStyle?: React.CSSProperties;
  /** Names the session in the confirmation, e.g. "RSP Division". */
  sessionLabel?: string;
  /**
   * Kept so existing call sites compile. The confirmation is now a centred
   * modal rather than an anchored popover, so there is nothing to position.
   */
  position?: 'below' | 'above';
}

/**
 * The logout button for the admin headers and the office console.
 *
 * It used to open an anchored popover of its own design while the interviewer
 * portal opened a modal and the employee portal asked nothing at all. All three
 * now raise the same ConfirmLogoutDialog; this component keeps its name and
 * props so its call sites did not have to change.
 */
export const LogoutConfirmPopover = ({
  className = '',
  children,
  buttonClassName,
  buttonStyle,
  sessionLabel,
}: LogoutConfirmPopoverProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleConfirmLogout = async () => {
    setOpen(false);
    clearAdminSession();
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors
    }
    // `replace` so Back after logging out cannot re-enter the portal (§8.2).
    navigate('/admin/login', { replace: true });
  };

  const defaultButtonClass =
    'ml-2 inline-flex items-center gap-2 text-red-600 font-semibold text-sm hover:text-red-700 transition';

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? defaultButtonClass}
        style={buttonStyle}
      >
        {children ?? (
          <>
            <LogOut className="h-4 w-4" /> Logout
          </>
        )}
      </button>

      <ConfirmLogoutDialog
        open={open}
        sessionLabel={sessionLabel}
        onCancel={() => setOpen(false)}
        onConfirm={() => void handleConfirmLogout()}
      />
    </div>
  );
};
