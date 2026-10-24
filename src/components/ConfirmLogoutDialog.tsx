import { useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';

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
}: ConfirmLogoutDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="abyan-ds fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(4, 14, 107, .45)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="abyan-logout-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl bg-white p-6 text-center"
        style={{ boxShadow: 'var(--shadow-3)' }}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
        >
          <LogOut size={22} strokeWidth={1.75} />
        </div>
        <h3 id="abyan-logout-title" className="text-title-s" style={{ color: 'var(--color-primary-900)' }}>
          Confirm Logout
        </h3>
        <p className="text-body-m mt-1" style={{ color: 'var(--neutral-600)' }}>
          Are you sure you want to log out of your {sessionLabel ? `${sessionLabel} ` : ''}session?
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button ref={cancelRef} type="button" className="btn btn-md btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-md btn-primary" onClick={onConfirm}>
            Yes, Logout
          </button>
        </div>
      </div>
    </div>
  );
};
