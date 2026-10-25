import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import './action-feedback.css';
import type { FeedbackApi, FeedbackInput, FeedbackTone, ToastRecord } from './types';

const MAX_TOASTS = 3;

const DEFAULT_DURATION: Record<FeedbackTone, number | null> = {
  success: 5_000,
  info: 5_000,
  warning: 8_000,
  // Errors stay until dismissed: the user may have missed the last one.
  error: null,
};

const NOOP = () => 0;

const NOOP_API: FeedbackApi = {
  notify: NOOP,
  success: NOOP,
  info: NOOP,
  warning: NOOP,
  error: NOOP,
  dismiss: () => undefined,
};

const FeedbackContext = createContext<FeedbackApi>(NOOP_API);

/**
 * App-wide notices. Safe to call without the provider: the default API is a
 * no-op, so isolated renders and tests do not need to wrap anything.
 */
export const useFeedback = (): FeedbackApi => useContext(FeedbackContext);

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const Toast = ({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) => {
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.tone];

  useEffect(() => {
    if (toast.durationMs === null || paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.durationMs, toast.id]);

  return (
    <div
      className={`afb-toast afb-toast--${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Icon className="afb-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="afb-content">
        <p className="afb-title">{toast.title}</p>
        {toast.message && <p className="afb-message">{toast.message}</p>}
        {toast.action && (
          <div className="afb-actions">
            <button
              type="button"
              className="afb-action"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="afb-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * Holds the toast queue and exposes `useFeedback()`. Mount once, above the
 * router, so any screen can report an outcome.
 */
export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((input: FeedbackInput) => {
    const id = nextId.current;
    nextId.current += 1;
    const durationMs = input.durationMs === undefined ? DEFAULT_DURATION[input.tone] : input.durationMs;

    setToasts((current) => {
      const next = [...current, { ...input, id, durationMs }];
      while (next.length > MAX_TOASTS) {
        // Keep errors on screen; drop the oldest notice of another tone.
        const removable = next.findIndex((toast) => toast.tone !== 'error');
        next.splice(removable === -1 ? 0 : removable, 1);
      }
      return next;
    });

    return id;
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      notify,
      success: (title, message, options) => notify({ tone: 'success', title, message, ...options }),
      info: (title, message, options) => notify({ tone: 'info', title, message, ...options }),
      warning: (title, message, options) => notify({ tone: 'warning', title, message, ...options }),
      error: (title, message, options) => notify({ tone: 'error', title, message, ...options }),
      dismiss,
    }),
    [dismiss, notify],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="afb-viewport">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </FeedbackContext.Provider>
  );
};
