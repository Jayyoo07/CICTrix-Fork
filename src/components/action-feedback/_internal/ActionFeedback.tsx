import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, X, XCircle } from 'lucide-react';

import './action-feedback.css';
import type { FeedbackTone } from './types';

export interface ActionFeedbackProps {
  tone?: FeedbackTone;
  title: string;
  message?: string;
  /** What the user can do now. Rendered on its own line so it is not skipped. */
  nextStep?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
  /** Moves focus to the notice when it appears. On by default for errors. */
  focusOnMount?: boolean;
}

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

/**
 * The inline form of §9.9: an action failed (or succeeded) next to the control
 * that caused it. It states what happened, whether the action completed, and
 * the next step; errors keep focus until the user moves on.
 */
export const ActionFeedback = ({
  tone = 'error',
  title,
  message,
  nextStep,
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
  className = '',
  focusOnMount = tone === 'error',
}: ActionFeedbackProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ICONS[tone];

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <div
      ref={ref}
      className={`afb-inline afb-inline--${tone} ${className}`.trim()}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      tabIndex={-1}
    >
      <Icon className="afb-icon" size={20} strokeWidth={1.75} aria-hidden="true" />
      <div className="afb-content">
        <p className="afb-inline-title">{title}</p>
        {message && <p className="afb-inline-message">{message}</p>}
        {nextStep && (
          <p className="afb-next">
            <strong>Next:</strong> {nextStep}
          </p>
        )}
        {(onRetry || onDismiss) && (
          <div className="afb-actions">
            {onRetry && (
              <button type="button" className="afb-action" onClick={onRetry}>
                <RefreshCw size={13} strokeWidth={2} aria-hidden="true" /> {retryLabel}
              </button>
            )}
            {onDismiss && (
              <button type="button" className="afb-action" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="afb-close"
          aria-label="Dismiss message"
          onClick={onDismiss}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
