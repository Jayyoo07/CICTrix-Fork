import { ActionFeedback } from './action-feedback';
import { describeActionFailure, type ErrorContext } from '../lib/friendlyErrors';

interface ErrorBannerProps {
  /**
   * The raw error. Passed through describeActionFailure() so the user never sees
   * a technical detail (a Postgres code, a stack, a column name) — those go to
   * the console for admin review instead.
   */
  error: unknown;
  /** Classifies the message when the caller already knows the cause. */
  context?: ErrorContext;
  /** Verb phrase for the title. Defaults to "load this data". */
  action?: string;
  /** Shows a Retry button when the caller can re-run the failed load. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The one way this system reports a failed load to the user.
 *
 * Screens previously discarded query errors into an empty array, so a failed
 * fetch rendered as "0 employees" or an empty table — the screen stated
 * something false instead of admitting it couldn't load. ActionFeedback states
 * what failed, that no data was loaded, and the next step.
 */
export const ErrorBanner = ({
  error,
  context,
  action = 'load this data',
  onRetry,
  className = '',
}: ErrorBannerProps) => {
  if (!error) return null;

  const failure = describeActionFailure(action, error, { context, mode: 'load' });

  return (
    <ActionFeedback
      tone="error"
      title={failure.title}
      message={failure.message}
      nextStep={failure.nextStep}
      onRetry={onRetry}
      focusOnMount={false}
      className={className}
    />
  );
};

export default ErrorBanner;
