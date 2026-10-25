// Centralized friendly-error helper.
//
// Spec (Error Handling → User-Friendly Error Messages):
// "Implement proper error handling throughout the system. Errors should be
//  displayed clearly, not expose technical system details, and be logged for
//  administrator review."
//
// Call sites pass the raw error + the operation context (e.g. 'upload',
// 'validation', 'unauthorized', 'server'). The helper returns a friendly,
// human-readable message and writes the raw error to the console for the
// admin/devtools log.

export type ErrorContext =
  | 'server'
  | 'upload'
  | 'validation'
  | 'unauthorized'
  | 'network'
  | 'not-found'
  | 'generic';

const SPEC_MESSAGES: Record<ErrorContext, string> = {
  server: 'The server is currently unavailable. Please try again later.',
  upload: 'File upload failed. Please check your internet connection and try again.',
  validation: 'Please complete all required fields before proceeding.',
  unauthorized: 'You do not have permission to access this page.',
  network: 'Network connection lost. Please check your internet and retry.',
  'not-found': 'We could not find what you were looking for.',
  generic: 'Something went wrong. Please try again — if the problem persists, contact your administrator.',
};

// Lightweight heuristic when the caller hasn't classified the error.
const inferContext = (error: unknown): ErrorContext => {
  const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  const status = Number((error as { status?: unknown })?.status ?? 0);

  if (status === 401 || status === 403 || message.includes('unauthor') || message.includes('forbidden')) {
    return 'unauthorized';
  }
  if (status === 404 || message.includes('not found')) return 'not-found';
  if (status >= 500 || message.includes('internal server') || message.includes('service unavailable')) {
    return 'server';
  }
  // Database/PostgREST failures — a missing table, an unknown column, a blocked
  // relation. These are server-side faults the user can do nothing about, so
  // they must read as a server error rather than the vaguer generic message.
  // Matched on the raw text because Supabase surfaces them with status 200/400
  // and a `code` (42P01, 42703, 42501, PGRST…) rather than a 5xx.
  const code = String((error as { code?: unknown })?.code ?? '');
  if (
    code.startsWith('42') ||
    code.startsWith('PGRST') ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('permission denied') ||
    message.includes('relation') ||
    message.includes('schema cache')
  ) {
    return 'server';
  }
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network')) {
    return 'network';
  }
  if (message.includes('upload') || message.includes('storage') || message.includes('bucket')) {
    return 'upload';
  }
  if (message.includes('required') || message.includes('must be') || message.includes('invalid')) {
    return 'validation';
  }
  return 'generic';
};

/**
 * Translate a raw error into a friendly, spec-approved message and log the
 * underlying detail for admin/devtools review. Never returns the raw message.
 */
export const friendlyError = (
  error: unknown,
  context?: ErrorContext,
): string => {
  const resolved: ErrorContext = context ?? inferContext(error);
  const friendly = SPEC_MESSAGES[resolved];

  // Admin-side log: keep the raw detail so engineering can diagnose, but the
  // applicant only ever sees `friendly`.
  if (typeof console !== 'undefined') {
    console.error(`[friendlyError:${resolved}]`, error);
  }

  return friendly;
};

/**
 * Convenience selector for spec-quoted strings without going through the
 * inference layer — useful when the call site already knows the context.
 */
export const friendlyMessage = (context: ErrorContext): string => SPEC_MESSAGES[context];

/** What a failed action says in the UI: what happened, did it complete, what next. */
export interface ActionFailure {
  title: string;
  message: string;
  nextStep: string;
  context: ErrorContext;
}

/**
 * Completion statement per cause. A returned API error means the write did not
 * land. A network failure is ambiguous: the request may have reached the
 * server, so the copy says we could not confirm instead of claiming nothing
 * happened.
 */
const FAILURE_MESSAGES: Record<ErrorContext, string> = {
  server: "The server couldn't accept the request, so nothing was saved.",
  upload: "The file didn't finish uploading, so it isn't attached.",
  validation: 'Some required details were missing or invalid, so nothing was saved.',
  unauthorized: "You don't have permission for this, so nothing was saved.",
  network: "The request didn't reach the server, so we couldn't confirm whether it completed.",
  'not-found': 'The record could not be found, so nothing was changed.',
  generic: "The action didn't complete, and nothing was saved.",
};

const NEXT_STEPS: Record<ErrorContext, string> = {
  server: 'Try again in a moment. If it keeps failing, contact your administrator.',
  upload: 'Check your connection, then choose the file again.',
  validation: 'Check the highlighted fields, then try again.',
  unauthorized: 'Sign in again. If you still see this, ask your administrator for access.',
  network: 'Check your connection, then check the record before trying again.',
  'not-found': 'Refresh the page to load the latest records, then try again.',
  generic: 'Try again. If it keeps happening, contact your administrator.',
};

/** A failed read reports that no data loaded, not that nothing was saved. */
const LOAD_MESSAGES: Record<ErrorContext, string> = {
  server: "The server couldn't return this data.",
  upload: "The file couldn't be loaded.",
  validation: 'The request was invalid, so nothing was loaded.',
  unauthorized: "You don't have permission to view this data.",
  network: "The request didn't reach the server, so no data was loaded.",
  'not-found': 'This record could not be found.',
  generic: "This data couldn't be loaded.",
};

const LOAD_NEXT_STEPS: Record<ErrorContext, string> = {
  server: 'Try again in a moment. If it keeps failing, contact your administrator.',
  upload: 'Choose the file again.',
  validation: 'Refresh the page and try again.',
  unauthorized: 'Sign in again. If you still see this, ask your administrator for access.',
  network: 'Check your connection, then try again.',
  'not-found': 'Go back and choose another record, or refresh the page.',
  generic: 'Try again. If it keeps happening, contact your administrator.',
};

export interface DescribeFailureOptions {
  context?: ErrorContext;
  /** `load` is for a failed read; `action` (default) is for a failed write. */
  mode?: 'action' | 'load';
}

/**
 * Build the three parts of a failed action or load. `action` is the verb phrase
 * shown to the user, e.g. "save the training" or "load this data".
 * The raw error is logged for admins and never returned.
 */
export const describeActionFailure = (
  action: string,
  error: unknown,
  options?: DescribeFailureOptions,
): ActionFailure => {
  const context: ErrorContext = options?.context ?? inferContext(error);
  const mode = options?.mode ?? 'action';
  const verb = action.trim().replace(/[.!]+$/, '');
  const title = verb ? `We couldn't ${verb}.` : "We couldn't complete that action.";

  if (typeof console !== 'undefined') {
    console.error(`[actionFailure:${context}] ${verb || 'action'}`, error);
  }

  return {
    title,
    message: (mode === 'load' ? LOAD_MESSAGES : FAILURE_MESSAGES)[context],
    nextStep: (mode === 'load' ? LOAD_NEXT_STEPS : NEXT_STEPS)[context],
    context,
  };
};
