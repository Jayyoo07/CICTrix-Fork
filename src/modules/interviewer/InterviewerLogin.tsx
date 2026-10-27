import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ActionFeedback } from '../../components/action-feedback';
import { Button } from '../../components/Button';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { mockDatabase } from '../../lib/mockDatabase';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
import abyanLogo from '../../assets/abyan-logo.png';
import iloiloCitySeal from '../../assets/iloilo-city-seal.png';

interface InterviewerLoginProps {
  onLogin: (email: string, name: string) => void;
}
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';
type LoginFailure = { message: string; nextStep: string };

const getAccessClient = () => {
  // Interviewer access should always check the real rater DB when available.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};

const runEmailUpdate = async (client: any, updates: Record<string, unknown>, email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const updateQuery = client.from('raters').update(updates) as any;

  if (typeof updateQuery?.ilike === 'function') {
    return updateQuery.ilike('email', normalizedEmail);
  }

  return updateQuery.eq('email', normalizedEmail);
};

const selectRatersForAccess = async (client: any) => {
  const query = client.from('raters').select('id, name, email, is_active') as any;
  if (typeof query?.limit === 'function') {
    return query.limit(1000);
  }
  return query;
};

const loadRaterAccessState = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export function InterviewerLogin({ onLogin }: InterviewerLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const loginPending = useRef(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const navigateAfterLogin = () => {
    const returnTo = searchParams.get('returnTo');
    navigate(
      returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
        ? returnTo
        : '/interviewer/dashboard',
      // replace: Back from the dashboard must not return to the login screen.
      { replace: true },
    );
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginPending.current) return;
    setFailure(null);

    if (!email || !password) {
      setFailure({
        message: 'Enter your email and password.',
        nextStep: 'Fill in both fields and try again.',
      });
      return;
    }

    loginPending.current = true;
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

      const accessStateMap = loadRaterAccessState();
      if (Object.prototype.hasOwnProperty.call(accessStateMap, normalizedEmail) && !accessStateMap[normalizedEmail]) {
        setFailure({
          message: 'Your interviewer access has been revoked.',
          nextStep: 'Contact HR if you believe this is a mistake.',
        });
        return;
      }

      // Access is controlled by Rater Management: account must exist and be active.
      // Fetch rows then match client-side to avoid case/whitespace mismatches.
      const client = getAccessClient();
      const { data: raterRows, error: raterError } = await selectRatersForAccess(client);

      if (raterError) {
        const described = describeActionFailure('check your interviewer access', raterError);
        setFailure({ message: described.message, nextStep: described.nextStep });
        return;
      }

      const matchedRaters = (raterRows ?? []).filter((row: any) => normalize(row?.email) === normalizedEmail);
      const raterRecord = matchedRaters[0];
      const hasActiveRaterAccess = matchedRaters.some((row: any) => Boolean(row?.is_active));

      if (!raterRecord) {
        setFailure({
          message: 'No interviewer access is assigned to this email.',
          nextStep: 'Ask RSP to add your email under Rater Management, then try again.',
        });
        return;
      }

      if (!hasActiveRaterAccess && !raterRecord.is_active) {
        setFailure({
          message: 'Your interviewer access has been revoked.',
          nextStep: 'Contact HR if you believe this is a mistake.',
        });
        return;
      }

      // In local demo mode, granted active rater access is enough to allow login.
      if (isMockModeEnabled) {
        try {
          await runEmailUpdate(client, { last_login: new Date().toISOString() }, normalizedEmail);
        } catch {
          // Do not block login when last_login write fails.
        }
        onLogin(raterRecord.email || normalizedEmail, raterRecord.name || 'Interviewer');
        navigateAfterLogin();
        return;
      }

      // In connected mode, authenticate against Supabase Auth.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        if (authError.status === 429) {
          setFailure({
            message: 'Too many sign-in attempts.',
            nextStep: 'Wait a minute, then try again.',
          });
        } else if (authError.status === 400 || /invalid login credentials/i.test(authError.message)) {
          setFailure({
            message: "That email and password don't match an account.",
            nextStep: "Check them and try again. If access was just granted, ask RSP to finish setting up your account.",
          });
        } else {
          const described = describeActionFailure('sign you in', authError);
          setFailure({ message: described.message, nextStep: described.nextStep });
        }
        return;
      }

      if (!authData.user) {
        setFailure({
          message: "That email and password don't match an account.",
          nextStep: "Check them and try again. If access was just granted, ask RSP to finish setting up your account.",
        });
        return;
      }

      try {
        await runEmailUpdate(client, { last_login: new Date().toISOString() }, normalizedEmail);
      } catch {
        // Do not block login when last_login write fails.
      }

      const resolvedEmail = authData.user.email ?? normalizedEmail;
      const userName = raterRecord.name || 'Interviewer';
      onLogin(resolvedEmail, userName);
      navigateAfterLogin();
    } catch (err) {
      const described = describeActionFailure('sign you in', err);
      setFailure({ message: described.message, nextStep: described.nextStep });
    } finally {
      loginPending.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="abyan-ds interviewer-login min-h-screen w-full bg-[var(--bg-page)]"
    >
      <style>{`
        /* Outrank legacy global input selectors without changing other pages. */
        .abyan-ds.interviewer-login .interviewer-login-input[type] {
          height: var(--control-h);
          border: 1px solid var(--neutral-200);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          color: var(--neutral-800);
          caret-color: var(--color-primary);
          font: 500 14px/18px var(--font-sans);
          transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
        }
        .abyan-ds.interviewer-login .interviewer-login-input[type]::placeholder {
          color: var(--neutral-600);
          opacity: 1;
        }
        .abyan-ds.interviewer-login .interviewer-login-input[type]:hover:not(:focus):not(:disabled) {
          border-color: var(--color-primary-200);
        }
        .abyan-ds.interviewer-login .interviewer-login-input[type]:focus:not(:disabled) {
          outline: none;
          border: 2px solid var(--color-primary);
          box-shadow: var(--ring-input);
        }
        .abyan-ds.interviewer-login .interviewer-login-input[type]:disabled {
          background: var(--bg-page);
          color: var(--neutral-400);
          cursor: not-allowed;
        }
        .abyan-ds.interviewer-login .interviewer-login-toggle {
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--neutral-600);
          cursor: pointer;
        }
        .abyan-ds.interviewer-login .interviewer-login-toggle:hover:not(:disabled) {
          background: var(--bg-page);
          color: var(--color-primary);
        }
        .abyan-ds.interviewer-login .interviewer-login-toggle:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
          box-shadow: var(--ring-input);
        }
        .abyan-ds.interviewer-login .interviewer-login-toggle:disabled {
          color: var(--neutral-400);
          cursor: not-allowed;
        }
        .abyan-ds.interviewer-login .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700);
        }
        .abyan-ds.interviewer-login .btn-primary.is-loading {
          background: var(--gradient-button);
          color: var(--color-white);
        }
      `}</style>
      <div className="flex min-h-screen w-full">
        {/* LEFT — brand panel */}
        <aside
          className="relative hidden w-1/2 overflow-hidden lg:flex"
          style={{ background: 'var(--gradient-hero)', color: 'var(--color-white)' }}
        >
          {/* Decorative orbs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-[var(--radius-pill)] blur-3xl"
            style={{ backgroundColor: 'var(--on-blue-active)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-[var(--radius-pill)] blur-3xl"
            style={{ backgroundColor: 'var(--on-blue-hover)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, var(--on-blue-active) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.35,
            }}
          />

          <div className="relative z-10 flex w-full flex-col p-12">
            {/* Top wordmark with logo */}
            <a href="/" className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-white)]">
              <img
                src={abyanLogo}
                alt="Abyan Logo"
                className="h-10 w-auto object-contain"
                style={{ mixBlendMode: 'screen' }}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-title-s" style={{ color: 'var(--color-white)' }}>ABYAN HRIS</span>
                <span className="text-body-s" style={{ color: 'var(--on-blue-muted)' }}>
                  Human Resource Information System
                </span>
              </div>
            </a>

            {/* Center hero — OCHRMO seal */}
            <div className="m-auto w-full max-w-md text-center">
              <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-[var(--radius-pill)]"
                style={{
                  backgroundColor: 'var(--on-blue-hover)',
                  boxShadow: 'inset 0 0 0 2px var(--on-blue-active)',
                  padding: '12px',
                }}
              >
                <img
                  src={iloiloCitySeal}
                  alt="OCHRMO Seal"
                  className="h-full w-full object-contain"
                />
              </div>
              <h1
                className="text-title-l"
                style={{ color: 'var(--color-white)' }}
              >
                Interviewer Portal
              </h1>
              <p
                className="text-body-l mt-3"
                style={{ color: 'var(--on-blue-text)' }}
              >
                Evaluation &amp; Assessment
              </p>
              <ul className="text-body-l mt-10 space-y-3 text-center" style={{ color: 'var(--on-blue-muted)' }}>
                {['View Assigned Applicants', 'Conduct Evaluations', 'Submit Recommendations'].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="text-body-s" style={{ color: 'var(--on-blue-muted)' }}>
              &copy; {new Date().getFullYear()} Abyan HRIS. All rights reserved.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile-only brand */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <img src={abyanLogo} alt="Abyan" className="h-8 w-8 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] object-contain p-1" />
              <span className="text-headline-m" style={{ color: 'var(--color-primary-900)' }}>Abyan HRIS</span>
            </div>

            <div className="mb-8">
              <h1
                className="text-title-l"
                style={{ color: 'var(--color-primary-900)' }}
              >
                Welcome back
              </h1>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {failure && (
                <div id="int-login-failure">
                  <ActionFeedback
                    title="We couldn't sign you in."
                    message={failure.message}
                    nextStep={failure.nextStep}
                    onDismiss={() => setFailure(null)}
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="int-email" className="text-body-m mb-2 block" style={{ color: 'var(--neutral-800)' }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--neutral-400)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    id="int-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFailure(null); }}
                    autoComplete="username"
                    aria-describedby={failure ? 'int-login-failure' : undefined}
                    disabled={loading}
                    className="interviewer-login-input w-full pl-10 pr-3"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="int-password" className="text-body-m mb-2 block" style={{ color: 'var(--neutral-800)' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--neutral-400)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    id="int-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFailure(null); }}
                    autoComplete="current-password"
                    aria-describedby={failure ? 'int-login-failure' : undefined}
                    disabled={loading}
                    className="interviewer-login-input w-full pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={loading}
                    className="interviewer-login-toggle absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center"
                  >
                    {showPassword ? <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.75} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <p className="text-body-s pt-1" style={{ color: 'var(--neutral-600)' }}>
                Contact HR for access or password help.
              </p>

              {/* Submit */}
              <div className="mt-2">
                <Button type="submit" size="lg" variant="primary" loading={loading} className="w-full">
                  Sign in
                </Button>
              </div>
            </form>

            {isMockModeEnabled && (
              <div className="text-body-s mt-4 rounded-[var(--radius-md)] border border-[var(--warning-300)] bg-[var(--warning-100)] px-3 py-2 text-[var(--warning-700)]">
                <span className="font-semibold">Demo Mode:</span> Use any active rater email with any non-empty password.
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
