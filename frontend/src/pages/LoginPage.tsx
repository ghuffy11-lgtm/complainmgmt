import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthService } from '../services/auth.service';
import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { IconLock, IconShield, IconUser } from '../components/ui/Icons';

/**
 * Two-pane sign-in layout (ported from the Lovable theme spec):
 *   - Left: branded sidebar-coloured panel with the brand mark and the
 *     "calm, careful complaint review" tagline. Hidden on narrow viewports
 *     via the `.login-brand` media query in styles.css.
 *   - Right: form area, centred.
 *
 * Keeps our existing auth flow — JWT + refresh storage + ACCOUNT_LOCKED
 * handling. Visual changes only.
 */
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const nav = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await AuthService.login(username, password);
      setSession(r);
      nav(location.state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      const ex = err as { response?: { data?: { code?: string } } };
      if (ex?.response?.data?.code === 'ACCOUNT_LOCKED') {
        setError('This account is temporarily locked. Try again later or contact an admin.');
      } else {
        setError('Invalid username or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-grid">
      {/* Brand panel — hidden < 960px (see styles.css .login-brand) */}
      <aside className="login-brand">
        <div style={brandRowStyle}>
          <span style={brandMarkStyle}><IconShield size={20} /></span>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Complaint Tracking</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Quality &amp; Patient Safety</div>
          </div>
        </div>

        <div style={{ maxWidth: 'var(--reading-max)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Calm, careful complaint review.
          </h1>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.75, maxWidth: 460 }}>
            A clinical workspace for triaging patient complaints, tracking investigations, and
            closing the loop with evidence.
          </p>
        </div>

        <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: '0.02em' }}>
          Hadi Clinic · Internal use only
        </div>
      </aside>

      {/* Form panel */}
      <section className="login-form">
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.005em' }}>Sign in</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Use your hospital credentials to continue.
            </p>
          </header>

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="login-username">Username</label>
              <div style={{ position: 'relative' }}>
                <span style={inputIconStyle} aria-hidden><IconUser size={14} /></span>
                <input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  required
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div style={{ position: 'relative' }}>
                <span style={inputIconStyle} aria-hidden><IconLock size={14} /></span>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </div>

            {error && (
              <div role="alert" style={errorBoxStyle}>{error}</div>
            )}

            <Button type="submit" disabled={loading} style={{ width: '100%', height: 40 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center' }}>
            Hadi Clinic · Internal use only
          </div>
        </div>
      </section>
    </div>
  );
}

const brandRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const brandMarkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 8,
  background: 'var(--sidebar-accent)',
  color: 'var(--sidebar)',
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'inline-flex',
  color: 'var(--text-subtle)',
  pointerEvents: 'none',
};

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  color: 'var(--danger)',
  padding: '8px 12px',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};
