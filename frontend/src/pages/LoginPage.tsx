import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthService } from '../services/auth.service';
import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';

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
      const e = err as { response?: { status?: number; data?: { code?: string } } };
      if (e?.response?.data?.code === 'ACCOUNT_LOCKED') {
        setError('This account is temporarily locked. Try again later or contact an admin.');
      } else {
        setError('Invalid username or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form
        onSubmit={onSubmit}
        className="card"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 340 }}
      >
        <h1 style={{ margin: 0 }}>Sign in</h1>
        <p className="muted" style={{ margin: 0 }}>Complaint Tracking System</p>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="err">{error}</div>}
        <Button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
