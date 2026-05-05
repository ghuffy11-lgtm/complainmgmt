import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthService } from '../services/auth.service';
import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { IconShield } from '../components/ui/Icons';

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
    <div style={pageStyle}>
      {/* decorative gradient panel — top half of the screen */}
      <div style={glow} aria-hidden />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, position: 'relative' }}>
        <div style={brandStyle}>
          <span style={brandMark}><IconShield size={28} /></span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '0.02em' }}>Complaint Tracking</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sign in to continue</div>
          </div>
        </div>

        <form onSubmit={onSubmit} style={cardStyle}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading} style={{ width: '100%', marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          Hadi Clinic · Internal use only
        </div>
      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  position: 'relative',
  overflow: 'hidden',
};

const glow: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.18), transparent 50%), ' +
    'radial-gradient(ellipse at 50% 100%, rgba(37,99,235,0.10), transparent 50%)',
  pointerEvents: 'none',
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
};

const brandMark: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: 14,
  background: 'linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)',
  color: 'white',
  boxShadow: '0 10px 25px rgba(37,99,235,0.3)',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: 360,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '24px 22px 22px',
  boxShadow: 'var(--shadow-md)',
};
