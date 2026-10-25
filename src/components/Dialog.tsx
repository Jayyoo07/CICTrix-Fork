import React from 'react';
import { Modal, type ModalSize } from './modal';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerIcon?: React.ReactNode;
  /** Defaults to sm (480px), close to this dialog's former 500px. */
  size?: ModalSize;
  children: React.ReactNode;
}

/**
 * Legacy entry point, kept so existing callers move to the standard §9.10
 * modal without edits. New code imports `Modal` / `ConfirmModal` from
 * `components/modal` directly. Callers without a title keep drawing their own
 * heading until their portal's migration phase
 * (docs/plans/2026-10-25-standard-modal.md).
 */
export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, subtitle, headerIcon, size = 'sm', children }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    ariaLabel={title ? undefined : 'Dialog'}
    subtitle={subtitle}
    icon={headerIcon}
    size={size}
  >
    {children}
  </Modal>
);
