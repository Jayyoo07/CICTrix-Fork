import { useCallback, useRef, useState } from 'react';

import { describeActionFailure, type ActionFailure, type ErrorContext } from '../../../lib/friendlyErrors';
import { useFeedback } from './FeedbackProvider';
import { goToLogin } from './loginPath';
import type { FeedbackAction } from './types';

export interface AsyncActionSuccess {
  title: string;
  message?: string;
  action?: FeedbackAction;
}

export interface AsyncActionOptions<T> {
  /** Verb phrase for the failure title: "save the training", "approve this application". */
  action: string;
  run: () => Promise<T>;
  success?: AsyncActionSuccess;
  context?: ErrorContext;
  /** Inline shows a failure the caller renders; toast reports it globally. Default inline. */
  failureChannel?: 'inline' | 'toast';
  /** Defaults to true. Set false when retrying cannot work (e.g. permission denied). */
  canRetry?: boolean;
  /** Defaults to treating `{ ok: false }` or `{ success: false }` as a failure. */
  getFailureMessage?: (result: T) => string | null;
  onSuccess?: (result: T) => void;
  onFailure?: (failure: ActionFailure) => void;
}

export type AsyncActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: ActionFailure }
  | null;

const defaultFailureMessage = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null;
  const value = result as { ok?: boolean; success?: boolean; error?: unknown; message?: unknown };
  if (value.ok !== false && value.success !== false) return null;
  if (typeof value.error === 'string' && value.error.trim()) return value.error;
  if (typeof value.message === 'string' && value.message.trim()) return value.message;
  return 'The action did not complete.';
};

/**
 * One mutation's pending state, re-entry guard, error translation and success
 * notice. Use it for buttons that write: it prevents a double click from
 * sending two requests, and it always clears `pending`, including on throw.
 */
export const useAsyncAction = <T = unknown>() => {
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const running = useRef(false);

  const clearFailure = useCallback(() => setFailure(null), []);

  const run = useCallback(
    async (options: AsyncActionOptions<T>): Promise<AsyncActionResult<T>> => {
      if (running.current) return null;
      running.current = true;
      setPending(true);
      setFailure(null);

      const report = (described: ActionFailure) => {
        setFailure(described);
        options.onFailure?.(described);
        if (options.failureChannel === 'toast') {
          feedback.error(described.title, `${described.message} ${described.nextStep}`, {
            action:
              described.context === 'session'
                ? { label: 'Sign in again', onClick: goToLogin }
                : options.canRetry === false
                  ? undefined
                  : { label: 'Try again', onClick: () => void run(options) },
          });
        }
      };

      try {
        const result = await options.run();
        const failureMessage = (options.getFailureMessage ?? defaultFailureMessage)(result);

        if (failureMessage) {
          const described = describeActionFailure(options.action, failureMessage, {
            context: options.context,
          });
          report(described);
          return { ok: false, failure: described };
        }

        if (options.success) {
          feedback.success(options.success.title, options.success.message, {
            action: options.success.action,
          });
        }
        options.onSuccess?.(result);
        return { ok: true, data: result };
      } catch (error) {
        const described = describeActionFailure(options.action, error, { context: options.context });
        report(described);
        return { ok: false, failure: described };
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [feedback],
  );

  return { run, pending, failure, clearFailure };
};
