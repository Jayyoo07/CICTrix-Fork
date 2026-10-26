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
  /** 401 or an expired token: the user must sign in again. */
  | 'session'
  /** 409 or a unique-key clash: someone else changed it, or it already exists. */
  | 'conflict'
  /** The request ran out of time; it may still have completed. */
  | 'timeout'
  | 'generic';

const SPEC_MESSAGES: Record<ErrorContext, string> = {
  server: 'The server is currently unavailable. Please try again later.',
  upload: 'File upload failed. Please check your internet connection and try again.',
  validation: 'Please complete all required fields before proceeding.',
  unauthorized: 'You do not have permission to access this page.',
  network: 'Network connection lost. Please check your internet and retry.',
  'not-found': 'We could not find what you were looking for.',
  session: 'Your session has expired. Please sign in again.',
  conflict: 'This record was changed by someone else or already exists. Refresh and try again.',
  timeout: 'The server took too long to respond. Please try again.',
  generic: 'Something went wrong. Please try again — if the problem persists, contact your administrator.',
};

// Lightweight heuristic when the caller hasn't classified the error.
const inferContext = (error: unknown): ErrorContext => {
  const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  const status = Number((error as { status?: unknown })?.status ?? 0);
  const code = String((error as { code?: unknown })?.code ?? '');
  const name = String((error as { name?: unknown })?.name ?? '');

  // The browser knows it is offline before any request is made.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  if (name === 'AbortError' || name === 'TimeoutError' || status === 408 || status === 504 ||
      message.includes('timed out') || message.includes('timeout')) {
    return 'timeout';
  }
  // PGRST301/PGRST303: the JWT expired or is invalid, i.e. the session ended.
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || message.includes('jwt expired')) {
    return 'session';
  }
  // 42501: insufficient privilege, which is how row-level security refuses a write.
  if (status === 403 || code === '42501' || message.includes('unauthor') || message.includes('forbidden') ||
      message.includes('permission denied') || message.includes('row-level security')) {
    return 'unauthorized';
  }
  if (status === 409 || code === '23505' || message.includes('duplicate key')) return 'conflict';
  // 23502 not-null, 23514 check, 22P02 bad input, 23503 missing reference.
  if (status === 400 && !code.startsWith('42') && !code.startsWith('PGRST')) return 'validation';
  if (code === '23502' || code === '23514' || code === '22P02' || code === '23503') return 'validation';
  if (status === 404 || message.includes('not found')) return 'not-found';
  if (status >= 500 || message.includes('internal server') || message.includes('service unavailable')) {
    return 'server';
  }
  // Database/PostgREST failures — a missing table, an unknown column, a blocked
  // relation. These are server-side faults the user can do nothing about, so
  // they must read as a server error rather than the vaguer generic message.
  // Matched on the raw text because Supabase surfaces them with status 200/400
  // and a `code` (42P01, 42703, PGRST…) rather than a 5xx.
  if (
    code.startsWith('42') ||
    code.startsWith('PGRST') ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
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
  session: 'Your session has expired, so nothing was saved.',
  conflict: 'Someone else changed this record, or it already exists, so nothing was saved.',
  timeout: "The server took too long to answer, so we couldn't confirm whether it completed.",
  generic: "The action didn't complete, and nothing was saved.",
};

const NEXT_STEPS: Record<ErrorContext, string> = {
  server: 'Try again in a moment. If it keeps failing, contact your administrator.',
  upload: 'Check your connection, then choose the file again.',
  validation: 'Check the highlighted fields, then try again.',
  unauthorized: 'Sign in again. If you still see this, ask your administrator for access.',
  network: 'Check your connection, then check the record before trying again.',
  'not-found': 'Refresh the page to load the latest records, then try again.',
  session: 'Sign in again, then repeat the action.',
  conflict: 'Refresh the page to see the latest version, then try again.',
  timeout: 'Check the record before trying again. If it keeps happening, contact your administrator.',
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
  session: 'Your session has expired, so no data was loaded.',
  conflict: 'The data changed while it was loading.',
  timeout: 'The server took too long to answer, so no data was loaded.',
  generic: "This data couldn't be loaded.",
};

const LOAD_NEXT_STEPS: Record<ErrorContext, string> = {
  server: 'Try again in a moment. If it keeps failing, contact your administrator.',
  upload: 'Choose the file again.',
  validation: 'Refresh the page and try again.',
  unauthorized: 'Sign in again. If you still see this, ask your administrator for access.',
  network: 'Check your connection, then try again.',
  'not-found': 'Go back and choose another record, or refresh the page.',
  session: 'Sign in again, then reopen this page.',
  conflict: 'Refresh the page.',
  timeout: 'Try again in a moment. If it keeps happening, contact your administrator.',
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

const humanizeColumn = (column: string) => column.replace(/_/g, ' ');

/**
 * Field-level messages for a rejected write (400 / Postgres 23502, 23505), keyed
 * by column name, so a form can show the message under the right input. Returns
 * an empty object when the error names no field. Raw text is never returned.
 */
export const fieldErrorsFrom = (error: unknown): Record<string, string> => {
  const code = String((error as { code?: unknown })?.code ?? '');
  const text = `${String((error as { message?: unknown })?.message ?? '')} ${String((error as { details?: unknown })?.details ?? '')}`;

  if (code === '23502') {
    const column = /column "([^"]+)"/.exec(text)?.[1];
    if (column) return { [column]: `Enter the ${humanizeColumn(column)}. It is required.` };
  }
  if (code === '23505') {
    const column = /Key \(([^)]+)\)=/.exec(text)?.[1];
    if (column && !column.includes(',')) {
      return { [column]: `This ${humanizeColumn(column)} is already in use. Enter a different one.` };
    }
  }
  return {};
};

/**
 * The three parts of a failure (what failed, whether it completed, the next
 * step) as one line, for screens that show a single error string. The raw
 * error is logged, never returned.
 */
export const failureText = (action: string, error: unknown, options?: DescribeFailureOptions): string => {
  const failure = describeActionFailure(action, error, options);
  return `${failure.title} ${failure.message} ${failure.nextStep}`;
};
