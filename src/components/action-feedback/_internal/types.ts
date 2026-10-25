/** Tones map to the §3.6 status colours in DESIGN_IDENTITY.md. */
export type FeedbackTone = 'success' | 'info' | 'warning' | 'error';

export interface FeedbackAction {
  label: string;
  onClick: () => void;
}

export interface FeedbackInput {
  tone: FeedbackTone;
  title: string;
  message?: string;
  action?: FeedbackAction;
  /** `null` keeps the notice until it is dismissed. Defaults: 5s success/info, 8s warning, errors persist. */
  durationMs?: number | null;
}

export interface FeedbackOptions {
  action?: FeedbackAction;
  durationMs?: number | null;
}

/** What `useFeedback()` returns. The no-op default makes the hook safe outside a provider. */
export interface FeedbackApi {
  notify: (input: FeedbackInput) => number;
  success: (title: string, message?: string, options?: FeedbackOptions) => number;
  info: (title: string, message?: string, options?: FeedbackOptions) => number;
  warning: (title: string, message?: string, options?: FeedbackOptions) => number;
  error: (title: string, message?: string, options?: FeedbackOptions) => number;
  dismiss: (id: number) => void;
}

export interface ToastRecord extends FeedbackInput {
  id: number;
}
