import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import abyanLogo from '../../assets/abyan-logo.png';

const backend = vi.hoisted(() => {
  const client = () => {
    const limit = vi.fn();
    const ilike = vi.fn();
    const eq = vi.fn();
    const select = vi.fn(() => ({ limit }));
    const update = vi.fn((_updates: Record<string, string>) => ({ ilike, eq }));
    const from = vi.fn(() => ({ select, update }));
    return { from, select, limit, update, ilike, eq };
  };
  return { demo: false, connected: client(), mock: client(), signIn: vi.fn() };
});

// Replace the modules themselves: neither client initializes or reaches a backend.
vi.mock('../../lib/supabase', () => ({
  get isMockModeEnabled() { return backend.demo; },
  supabase: { from: backend.connected.from, auth: { signInWithPassword: backend.signIn } },
}));
vi.mock('../../lib/mockDatabase', () => ({ mockDatabase: { from: backend.mock.from } }));

import { InterviewerLogin } from './InterviewerLogin';

const rater = { id: 'rater-test', name: 'Ana Reyes', email: 'ana@example.test', is_active: true };
const authUser = {
  id: 'auth-test', email: 'ana@example.test', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z',
};
const accessStateKey = 'cictrix_rater_access_state_map';

function Destination() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <p>Destination: {location.pathname}{location.search}{location.hash}</p>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}

function renderLogin(returnTo?: string) {
  const onLogin = vi.fn();
  const loginPath = '/interviewer/login' + (returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`);
  render(
    <MemoryRouter initialEntries={['/before-login', loginPath]} initialIndex={1}>
      <Routes>
        <Route path="/interviewer/login" element={<InterviewerLogin onLogin={onLogin} />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onLogin };
}

function fillForm(email = 'ana@example.test', password = 'test-only-input') {
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } });
}

function submitForm() {
  fireEvent.submit(screen.getByLabelText('Email Address').closest('form')!);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// jsdom exposes parsed page rules but does not validate the full browser cascade
// or compute pseudo-element styles. These guard authored contracts only; the
// coordinator's browser checks remain the source of truth for rendered states.
function pageRule(selector: string) {
  const rule = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find((candidate): candidate is CSSStyleRule =>
      candidate instanceof CSSStyleRule && candidate.selectorText === selector);
  expect(rule, `Missing page rule: ${selector}`).toBeDefined();
  return rule!.style;
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.demo = false;
  localStorage.clear();
  for (const client of [backend.connected, backend.mock]) {
    client.limit.mockResolvedValue({ data: [rater], error: null });
    client.ilike.mockResolvedValue({ data: null, error: null });
    client.eq.mockResolvedValue({ data: null, error: null });
  }
  backend.signIn.mockResolvedValue({ data: { user: authUser, session: null }, error: null });
  // Friendly errors intentionally log raw diagnostic details; keep expected errors quiet.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected HTTP call in login test'); }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Interviewer login controls', () => {
  it('uses the scoped shared large primary Sign in button without inline overrides', () => {
    renderLogin();
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toHaveClass('btn', 'btn-primary', 'btn-lg', 'w-full');
    expect(button.closest('.abyan-ds')).not.toBeNull();
    expect(button).not.toHaveAttribute('style');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeEnabled();
  });

  it('authors the token hover fill only for enabled primary buttons', () => {
    renderLogin();
    const hover = pageRule('.abyan-ds.interviewer-login .btn-primary:hover:not(:disabled)');
    expect(hover.getPropertyValue('background')).toBe('var(--color-primary-700)');
  });

  it('authors the filled white-label loading state without overriding idle disabled buttons', () => {
    renderLogin();
    const selector = '.abyan-ds.interviewer-login .btn-primary.is-loading';
    const loading = pageRule(selector);
    expect(loading.getPropertyValue('background')).toBe('var(--gradient-button)');
    expect(loading.getPropertyValue('color')).toBe('var(--color-white)');
    const button = screen.getByRole('button', { name: 'Sign in' });
    button.setAttribute('disabled', '');
    expect(button.matches(selector)).toBe(false);
    button.classList.add('is-loading');
    expect(button.matches(selector)).toBe(true);
  });

  it('offers HR guidance instead of inert persistence and password-reset controls', () => {
    renderLogin();
    expect(screen.queryByRole('checkbox', { name: 'Remember me' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(screen.getByText('Contact HR for access or password help.')).toBeVisible();
  });

  it('provides labeled autofill identifiers and scoped input controls', () => {
    renderLogin();
    const email = screen.getByLabelText('Email Address');
    const password = screen.getByLabelText('Password', { exact: true });
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    for (const input of [email, password]) {
      expect(input).toHaveClass('interviewer-login-input');
      expect(input.closest('.abyan-ds.interviewer-login')).not.toBeNull();
    }
  });

  it('authors strong token rules for default, hover, focus and disabled inputs', () => {
    renderLogin();
    const inputSelector = '.abyan-ds.interviewer-login .interviewer-login-input[type]';
    const defaults = pageRule(inputSelector);
    expect(defaults.getPropertyValue('height')).toBe('var(--control-h)');
    expect(defaults.getPropertyValue('border-radius')).toBe('var(--radius-md)');
    expect(defaults.getPropertyValue('background')).toBe('var(--bg-surface)');
    expect(defaults.getPropertyValue('color')).toBe('var(--neutral-800)');
    expect(defaults.getPropertyValue('border')).toBe('1px solid var(--neutral-200)');
    expect(pageRule(`${inputSelector}:hover:not(:focus):not(:disabled)`).getPropertyValue('border-color'))
      .toBe('var(--color-primary-200)');
    const focus = pageRule(`${inputSelector}:focus:not(:disabled)`);
    expect(focus.getPropertyValue('border')).toBe('2px solid var(--color-primary)');
    expect(focus.getPropertyValue('box-shadow')).toBe('var(--ring-input)');
    const disabled = pageRule(`${inputSelector}:disabled`);
    expect(disabled.getPropertyValue('background')).toBe('var(--bg-page)');
    expect(disabled.getPropertyValue('color')).toBe('var(--neutral-400)');
    expect(disabled.getPropertyValue('cursor')).toBe('not-allowed');
  });

  it('keeps placeholder text opaque in both fields', () => {
    renderLogin();
    const placeholder = pageRule('.abyan-ds.interviewer-login .interviewer-login-input[type]::placeholder');
    expect(placeholder.getPropertyValue('color')).toBe('var(--neutral-600)');
    expect(placeholder.getPropertyValue('opacity')).toBe('1');
  });

  it('authors token foregrounds for the password toggle in every interaction state', () => {
    renderLogin();
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveClass('interviewer-login-toggle', 'h-9', 'w-9');
    const selector = '.abyan-ds.interviewer-login .interviewer-login-toggle';
    expect(pageRule(selector).getPropertyValue('color')).toBe('var(--neutral-600)');
    expect(pageRule(`${selector}:hover:not(:disabled)`).getPropertyValue('color')).toBe('var(--color-primary)');
    expect(pageRule(`${selector}:disabled`).getPropertyValue('color')).toBe('var(--neutral-400)');
    expect(pageRule(`${selector}:focus-visible`).getPropertyValue('outline')).toBe('2px solid var(--color-primary)');
  });

  it('backs the existing mobile mark with brand tokens within a 32px footprint', () => {
    renderLogin();
    const mark = screen.getByRole('img', { name: 'Abyan' });
    expect(mark).toHaveAttribute('src', abyanLogo);
    expect(mark).toHaveClass('h-8', 'w-8', 'bg-[var(--color-primary)]', 'rounded-[var(--radius-md)]', 'p-1');
    expect(mark.parentElement).toHaveClass('lg:hidden');
  });

  it('shows and hides the password without submitting', () => {
    const { onLogin } = renderLogin();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    expect(backend.connected.from).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it.each([
    ['', ''], ['', 'test-only-input'], ['ana@example.test', ''],
  ])('rejects missing fields (%j, %j) without accessing a backend', async (email, password) => {
    const { onLogin } = renderLogin();
    fillForm(email, password);
    submitForm();
    expect(await screen.findByText('Enter your email and password.')).toBeVisible();
    expect(screen.getByText('Fill in both fields and try again.')).toBeVisible();
    expect(screen.getByLabelText('Email Address')).toHaveAccessibleDescription(/Enter your email and password/);
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription(/Enter your email and password/);
    expect(backend.connected.from).not.toHaveBeenCalled();
    expect(backend.signIn).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('keeps the action label and disables controls while checking access', async () => {
    const pending = deferred<{ data: typeof rater[]; error: null }>();
    backend.connected.limit.mockReturnValueOnce(pending.promise);
    renderLogin();
    fillForm();
    submitForm();
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveClass('is-loading');
    expect(screen.getByLabelText('Email Address')).toBeDisabled();
    expect(screen.getByLabelText('Password', { exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    await act(async () => { pending.resolve({ data: [], error: null }); });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('ignores repeated form submissions before the first request completes', async () => {
    const pending = deferred<{ data: typeof rater[]; error: null }>();
    backend.connected.limit.mockReturnValue(pending.promise);
    const { onLogin } = renderLogin();
    fillForm();
    const form = screen.getByLabelText('Email Address').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(backend.connected.limit).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ data: [rater], error: null }); });
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});

describe('Interviewer access checks', () => {
  it('honors locally revoked access before querying or authenticating', async () => {
    localStorage.setItem(accessStateKey, JSON.stringify({ 'ana@example.test': false }));
    const { onLogin } = renderLogin();
    fillForm('ANA@EXAMPLE.TEST');
    submitForm();
    expect(await screen.findByText('Your interviewer access has been revoked.')).toBeVisible();
    expect(backend.connected.from).not.toHaveBeenCalled();
    expect(backend.signIn).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', [], 'No interviewer access is assigned to this email.'],
    ['revoked', [{ ...rater, is_active: false }], 'Your interviewer access has been revoked.'],
  ])('denies %s database access before authentication', async (_kind, rows, message) => {
    backend.connected.limit.mockResolvedValueOnce({ data: rows, error: null });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText(message)).toBeVisible();
    expect(backend.signIn).not.toHaveBeenCalled();
    expect(backend.connected.update).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('does not let a local grant bypass revoked database access', async () => {
    localStorage.setItem(accessStateKey, JSON.stringify({ 'ana@example.test': true }));
    backend.connected.limit.mockResolvedValueOnce({ data: [{ ...rater, is_active: false }], error: null });
    renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText('Your interviewer access has been revoked.')).toBeVisible();
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it('shows recovery guidance when the rater lookup fails', async () => {
    backend.connected.limit.mockResolvedValueOnce({ data: null, error: { status: 503, message: 'test lookup unavailable' } });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText("The server couldn't accept the request, so nothing was saved.")).toBeVisible();
    expect(screen.getByText('Try again in a moment. If it keeps failing, contact your administrator.')).toBeVisible();
    expect(backend.signIn).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('continues safely after malformed local access-state JSON', async () => {
    localStorage.setItem(accessStateKey, '{invalid');
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes'));
  });

  it('accepts an active matching row even when another matching row is inactive', async () => {
    backend.connected.limit.mockResolvedValueOnce({
      data: [{ ...rater, is_active: false }, { ...rater, id: 'active-test', email: ' ANA@EXAMPLE.TEST ' }], error: null,
    });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes'));
  });
});

describe('Connected Interviewer authentication', () => {
  it.each([
    ['invalid credentials', { status: 400, message: 'Invalid login credentials' }, "That email and password don't match an account."],
    ['rate limiting', { status: 429, message: 'test rate limit' }, 'Too many sign-in attempts.'],
    ['network failure', { status: 0, message: 'Failed to fetch' }, "The request didn't reach the server, so we couldn't confirm whether it completed."],
  ])('reports %s without signing in or updating last_login', async (_kind, error, message) => {
    backend.signIn.mockResolvedValueOnce({ data: { user: null, session: null }, error });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText(message)).toBeVisible();
    expect(onLogin).not.toHaveBeenCalled();
    expect(backend.connected.update).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Destination:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    if (error.status === 429) expect(screen.getByText('Wait a minute, then try again.')).toBeVisible();
    if (error.status === 0) expect(screen.getByText('Check your connection, then check the record before trying again.')).toBeVisible();
  });

  it('handles a thrown network error and permits a retry', async () => {
    backend.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText("The request didn't reach the server, so we couldn't confirm whether it completed.")).toBeVisible();
    submitForm();
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });

  it('does not accept an auth response without a user', async () => {
    backend.signIn.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText("That email and password don't match an account.")).toBeVisible();
    expect(onLogin).not.toHaveBeenCalled();
    expect(backend.connected.update).not.toHaveBeenCalled();
  });

  it('normalizes the sign-in identifier, preserves the callback and updates last_login', async () => {
    const { onLogin } = renderLogin();
    fillForm(' ANA@EXAMPLE.TEST ');
    submitForm();
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes'));
    expect(backend.signIn).toHaveBeenCalledWith({ email: 'ana@example.test', password: 'test-only-input' });
    expect(backend.connected.from).toHaveBeenCalledWith('raters');
    expect(backend.connected.select).toHaveBeenCalledWith('id, name, email, is_active');
    expect(backend.connected.limit).toHaveBeenCalledWith(1000);
    expect(backend.connected.update).toHaveBeenCalledWith({ last_login: expect.any(String) });
    expect(Number.isNaN(Date.parse(backend.connected.update.mock.calls[0][0].last_login))).toBe(false);
    expect(backend.connected.ilike).toHaveBeenCalledWith('email', 'ana@example.test');
    expect(backend.mock.from).not.toHaveBeenCalled();
    expect(await screen.findByText('Destination: /interviewer/dashboard')).toBeVisible();
  });

  it('uses normalized input and the Interviewer name fallback when profile fields are missing', async () => {
    backend.signIn.mockResolvedValueOnce({ data: { user: { ...authUser, email: undefined }, session: null }, error: null });
    backend.connected.limit.mockResolvedValueOnce({ data: [{ ...rater, name: '' }], error: null });
    const { onLogin } = renderLogin();
    fillForm(' ANA@EXAMPLE.TEST ');
    submitForm();
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Interviewer'));
  });

  it('does not block successful login when the best-effort last_login update rejects', async () => {
    backend.connected.ilike.mockRejectedValueOnce(new Error('test update failure'));
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText('Destination: /interviewer/dashboard')).toBeVisible();
    expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes');
  });
});

describe('Interviewer redirects', () => {
  it.each([
    [undefined, '/interviewer/dashboard'],
    ['/interviewer/evaluations?status=pending#today', '/interviewer/evaluations?status=pending#today'],
    ['https://outside.example.test/path', '/interviewer/dashboard'],
    ['//outside.example.test/path', '/interviewer/dashboard'],
  ])('chooses a safe destination for returnTo=%s and replaces login history', async (returnTo, expected) => {
    renderLogin(returnTo);
    fillForm();
    submitForm();
    expect(await screen.findByText(`Destination: ${expected}`)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Destination: /before-login')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});

describe('Demo Interviewer login', () => {
  it('shows the warning notice and bypasses connected auth for active demo access', async () => {
    backend.demo = true;
    const { onLogin } = renderLogin();
    const notice = screen.getByText('Demo Mode:').parentElement!;
    expect(within(notice).getByText(/Use any active rater email with any non-empty password/)).toBeVisible();
    expect(notice).toHaveClass('border-[var(--warning-300)]', 'bg-[var(--warning-100)]', 'text-[var(--warning-700)]');
    fillForm('ANA@EXAMPLE.TEST');
    submitForm();
    expect(await screen.findByText('Destination: /interviewer/dashboard')).toBeVisible();
    expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes');
    expect(backend.mock.from).toHaveBeenCalledWith('raters');
    expect(backend.mock.ilike).toHaveBeenCalledWith('email', 'ana@example.test');
    expect(backend.connected.from).not.toHaveBeenCalled();
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it('still denies inactive demo raters', async () => {
    backend.demo = true;
    backend.mock.limit.mockResolvedValueOnce({ data: [{ ...rater, is_active: false }], error: null });
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText('Your interviewer access has been revoked.')).toBeVisible();
    expect(onLogin).not.toHaveBeenCalled();
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it('keeps the demo last_login update best-effort', async () => {
    backend.demo = true;
    backend.mock.ilike.mockRejectedValueOnce(new Error('test demo update failure'));
    const { onLogin } = renderLogin();
    fillForm();
    submitForm();
    expect(await screen.findByText('Destination: /interviewer/dashboard')).toBeVisible();
    expect(onLogin).toHaveBeenCalledWith('ana@example.test', 'Ana Reyes');
  });

  it('does not show the demo notice in connected mode', () => {
    renderLogin();
    expect(screen.queryByText('Demo Mode:')).not.toBeInTheDocument();
  });
});
