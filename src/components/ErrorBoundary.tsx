import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Names the area that failed, e.g. "RSP portal". Omit for the whole app. */
  scope?: string;
  /** Where "Go to home" leads, e.g. the portal home. Defaults to the site home. */
  homeHref?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render crash and shows a friendly page with a way out, instead of a
 * blank screen. The app wraps everything in one, and each portal route in its
 * own (keyed by path), so a crash in one module never takes down the others and
 * navigating away clears it. The raw error is logged for admins, never shown.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[CICTrix] Render error caught by ErrorBoundary${this.props.scope ? ` (${this.props.scope})` : ''}:`, error, info);
  }

  /** A cache-busting reload: a stale cached bundle is the most common cause. */
  handleReload = (): void => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('_cb', Date.now().toString());
    window.location.replace(url.toString());
  };

  handleHome = (): void => {
    if (typeof window === 'undefined') return;
    window.location.assign(this.props.homeHref ?? '/');
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const where = this.props.scope ? `the ${this.props.scope}` : 'this page';
    // Inline §3 hex rather than tokens: this page must render even when the
    // crash came from a stylesheet or a design-system scope that never mounted.

    return (
      <div
        role="alert"
        style={{
          minHeight: this.props.scope ? '60vh' : '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#F1F5F9',
          color: '#28343D',
          fontFamily: "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 12px 32px rgba(16,30,41,.16)',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', lineHeight: '32px', fontWeight: 600, color: '#040E6B' }}>
            We couldn't show {where}.
          </h1>
          <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
            Something on {where} stopped working. Anything you had already saved is kept; changes you had not saved yet may be lost.
          </p>
          <p style={{ margin: '0 0 24px', lineHeight: 1.5 }}>
            <strong>Next:</strong> reload to get the latest version. If it happens again, go back home and contact the HR administrator.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleHome}
              style={{
                height: 45,
                padding: '0 24px',
                borderRadius: 999,
                border: '1.5px solid #363EE8',
                background: '#FFFFFF',
                color: '#363EE8',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Go to home
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                height: 45,
                padding: '0 24px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(180deg, #363EE8 0%, #191FA8 100%)',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
