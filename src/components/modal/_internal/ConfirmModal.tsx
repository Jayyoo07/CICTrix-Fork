import { useRef, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmModalProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Short explanation shown in the body. */
  message?: ReactNode;
  /** Extra body content, e.g. a required reason field. */
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** destructive uses the red §9.1 button for irreversible actions. */
  tone?: 'primary' | 'destructive';
  /** §9.1 loading state: spinner, label kept, clicks ignored. */
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 480px §9.10 confirmation. Focus starts on Cancel, the safe choice. */
export const ConfirmModal = ({
  open, title, subtitle, icon, message, children, confirmLabel, cancelLabel = 'Cancel',
  tone = 'primary', loading = false, confirmDisabled = false, onConfirm, onCancel,
}: ConfirmModalProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      subtitle={subtitle}
      icon={icon}
      size="sm"
      dismissible={!loading}
      initialFocusRef={children ? undefined : cancelRef}
      footer={(
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary btn-md" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button
            type="button"
            className={`btn btn-${tone} btn-md${loading ? ' is-loading' : ''}`}
            onClick={onConfirm}
            disabled={confirmDisabled || loading}
            aria-busy={loading || undefined}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      {message && <div className="text-sm leading-[22px] text-[var(--neutral-800)]">{message}</div>}
      {children && <div className={message ? 'mt-4' : undefined}>{children}</div>}
    </Modal>
  );
};
