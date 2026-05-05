import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthService } from '../services/auth.service';
import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

/**
 * Single-card sign-in: centred 400px card on an ambient blue glow.
 * Auth flow is unchanged — JWT + refresh storage + ACCOUNT_LOCKED handling.
 */
export function LoginPage() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const nav = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const onSubmit = async (e: React.FormEvent) => {
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
    <div className="min-h-screen flex items-center justify-center bg-bg relative overflow-hidden p-6">
      {/* Ambient background glow */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{ background: 'rgb(37 99 235 / 0.05)', filter: 'blur(100px)' }}
      />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="w-16 h-16 rounded-2xl text-white shadow-lg mb-4 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-active))',
              boxShadow: '0 0 0 8px rgb(37 99 235 / 0.05), 0 10px 25px rgb(15 23 42 / 0.10)',
            }}
          >
            <ShieldCheck size={36} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">
            Complaint Tracking
            <span className="block text-sm font-medium text-text-muted mt-1">
              Hadi Clinic · Quality &amp; Patient Safety
            </span>
          </h1>
          <p className="text-text-muted mt-2 text-sm">Sign in to continue to the portal</p>
        </div>

        <Card className="p-8 shadow-xl">
          <form onSubmit={onSubmit} className="space-y-1">
            <Input
              label="Username"
              placeholder="e.g. sjohnson"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && (
              <div
                role="alert"
                className="rounded-md text-[13px] px-3 py-2 mb-3"
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger)',
                }}
              >
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11" isLoading={loading}>
              Sign in
            </Button>
          </form>
        </Card>

        <footer className="mt-8 text-center text-text-subtle text-xs">
          Hadi Clinic · Internal use only
        </footer>
      </div>
    </div>
  );
}
