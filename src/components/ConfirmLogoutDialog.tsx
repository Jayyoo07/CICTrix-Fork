import { LogOut } from 'lucide-react';
import { ConfirmModal } from './modal';

interface ConfirmLogoutDialogProps {
  open: boolean;
  /** Names the session being ended, e.g. "Interviewer Portal". */
  sessionLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * One logout confirmation for every portal (DESIGN_IDENTITY §9.10).
 *
 * The app had three: this modal in the interviewer portal, an anchored popover
 * in the admin headers, and nothing at all in the employee portal, where the
 * button logged you straight out. Logging out is the same act everywhere, so
 * it asks the same way everywhere.
 *
 * Cancel is focused on open and is the left action, per §9.1: the safe choice
 * is the one a stray Enter lands on.
 */
export const ConfirmLogoutDialog = ({
  open,
  sessionLabel,
  onCancel,
  onConfirm,
}: ConfirmLogoutDialogProps) => (
  <ConfirmModal
    open={open}
    icon={<LogOut strokeWidth={1.75} />}
    title="Confirm Logout"
    message={`Are you sure you want to log out of your ${sessionLabel ? `${sessionLabel} ` : ''}session?`}
    confirmLabel="Yes, Logout"
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);
