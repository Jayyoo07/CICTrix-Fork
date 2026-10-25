import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { ActionFeedback } from '../../components/action-feedback';
import { describeActionFailure } from '../../lib/friendlyErrors';
import abyanLogo from '../../assets/abyan-logo.png';
import iloiloCitySeal from '../../assets/iloilo-city-seal.png';
import { readEmployeeSession } from '../../lib/employeeSession';

interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => Promise<void> | void;
  isLoading?: boolean;
}

type LoginFailure = { message: string; nextStep: string };

export const EmployeeLoginPage: React.FC<EmployeeLoginPageProps> = ({
  onLogin,
  isLoading = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);

    if (!username.trim()) {
      setFailure({
        message: 'Enter your employee ID or username.',
        nextStep: 'It is on your onboarding email. Enter it and try again.',
      });
      return;
    }

    if (!password) {
      setFailure({
        message: 'Enter your password.',
        nextStep: 'Use the temporary password from your onboarding email, then try again.',
      });
      return;
    }

    setLoading(true);
    try {
      await onLogin(username, password);
      const session = readEmployeeSession();
      if (!session) {
        setLoading(false);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? '');
      if (/invalid username or password/i.test(raw)) {
        console.error('Login error:', err);
        setFailure({
          message: "That username and password don't match an account.",
          nextStep: "Check them and try again. If you were just onboarded, use the temporary password from your welcome email.",
        });
      } else {
        const described = describeActionFailure('sign you in', err);
        setFailure({ message: described.message, nextStep: described.nextStep });
      }
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-slate-50 text-slate-900"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      <div className="flex min-h-screen w-full">
        {/* LEFT — brand panel */}
        <aside
          className="relative hidden w-1/2 overflow-hidden lg:flex"
          style={{ background: 'linear-gradient(135deg, #363EE8 0%, #050D65 100%)', color: '#FFFFFF' }}
        >
          {/* Decorative orbs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(200,209,255,0.18)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.35,
            }}
          />

          <div className="relative z-10 flex w-full flex-col p-12">
            {/* Top wordmark with logo */}
            <a href="/" className="flex items-center gap-3">
              <img
                src={abyanLogo}
                alt="Abyan Logo"
                className="h-10 w-auto object-contain"
                style={{ mixBlendMode: 'screen' }}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-base font-bold tracking-wide text-white">ABYAN HRIS</span>
                <span className="text-xs font-medium" style={{ color: 'rgba(200,209,255,0.85)' }}>
                  abyan-hris.vercel.app
                </span>
              </div>
            </a>

            {/* Center hero */}
            <div className="m-auto w-full max-w-md text-center">
              <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.25)',
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
                className="text-4xl font-bold tracking-tight text-white"
                style={{ lineHeight: 1.1 }}
              >
                Employee Portal
              </h1>
              <p
                className="mt-3 text-base font-medium"
                style={{ color: 'rgba(200,209,255,0.90)' }}
              >
                Human Resource Information System
              </p>
              <ul className="mt-10 space-y-3 text-center text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {['Access Your Employee Records', 'View Payslips & Benefits', 'Submit Leave Requests'].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
              &copy; {new Date().getFullYear()} Abyan HRIS. All rights reserved.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile-only brand */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <img src={abyanLogo} alt="Abyan" className="h-8 w-auto object-contain" />
              <span className="text-sm font-semibold text-slate-900">Abyan HRIS</span>
            </div>

            <div className="mb-8">
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{ color: '#040E6B', lineHeight: 1.15 }}
              >
                Welcome back
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {failure && (
                <ActionFeedback
                  title="We couldn't sign you in."
                  message={failure.message}
                  nextStep={failure.nextStep}
                  onDismiss={() => setFailure(null)}
                />
              )}

              {/* Username */}
              <div>
                <label htmlFor="emp-username" className="mb-2 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                  Username
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                  />
                  <input
                    id="emp-username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setFailure(null); }}
                    disabled={loading || isLoading}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#363EE8] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="emp-password" className="mb-2 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                  />
                  <input
                    id="emp-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFailure(null); }}
                    disabled={loading || isLoading}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#363EE8] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loading || isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed"
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || isLoading}
                aria-busy={loading || isLoading || undefined}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: '#363EE8' }}
                onMouseEnter={(e) => { if (!loading && !isLoading) e.currentTarget.style.backgroundColor = '#2830c5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#363EE8'; }}
              >
                {loading || isLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sign In</>
                  : 'Sign In'}
              </button>
            </form>

          </div>
        </main>
      </div>
    </div>
  );
};
