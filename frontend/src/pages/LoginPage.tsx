import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthService } from '../services/auth.service';
import { TwoFactorService } from '../services/two-factor.service';
import { useAuthStore } from '../store/auth-store';
import { useBranding } from '../hooks/useBranding';
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
  // 2FA challenge state. When non-null, the form switches to a code prompt.
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [useBackupCode, setUseBackupCode] = React.useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const nav = useNavigate();
  const branding = useBranding();

  // Reflect the system name in the browser tab. Useful as a freebie for
  // anyone with multiple CTS-style tabs open.
  React.useEffect(() => {
    document.title = branding.systemName;
  }, [branding.systemName]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await AuthService.login(username, password);
      if ('twoFactorRequired' in r) {
        // Password OK; backend wants the second factor before issuing
        // a session. Hold the challenge token, swap to the code prompt.
        setChallenge(r.challengeToken);
        setLoading(false);
        return;
      }
      setSession(r);
      nav('/dashboard', { replace: true });
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

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const r = await TwoFactorService.verify(challenge, code);
      setSession(r);
      nav('/dashboard', { replace: true });
    } catch (err) {
      const ex = err as { response?: { data?: { code?: string } } };
      if (ex?.response?.data?.code === '2FA_CHALLENGE_INVALID') {
        // Token expired or already used. Bounce back to the password screen.
        setError('Your sign-in attempt expired. Please enter your username and password again.');
        setChallenge(null);
        setCode('');
      } else {
        setError('That code did not work. Try the next one from your app, or use a backup code.');
        setCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden p-6"
      style={{
        backgroundImage: 'url(/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Frosted-glass overlay: a slate wash + light blur of whatever
       *  photo sits behind it. Pushes the busy background into a
       *  soft-focus mid-ground so the form card holds full focus. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none backdrop-blur-[4px]"
        style={{ background: 'rgb(15 23 42 / 0.35)' }}
      />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="w-16 h-16 rounded-2xl text-white shadow-lg mb-4 flex items-center justify-center overflow-hidden"
            style={{
              background: branding.logoUrl
                ? 'var(--surface)'
                : 'linear-gradient(135deg, var(--primary), var(--primary-active))',
              boxShadow: '0 0 0 8px rgb(37 99 235 / 0.05), 0 10px 25px rgb(15 23 42 / 0.10)',
            }}
          >
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.organizationName}
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              <ShieldCheck size={36} strokeWidth={1.5} />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white m-0 drop-shadow-md">
            {branding.systemName}
            <span className="block text-sm font-medium text-white/85 mt-1 drop-shadow-sm">
              {branding.organizationName} · {branding.loginSubtitle}
            </span>
          </h1>
          <p className="text-white/85 mt-2 text-sm drop-shadow-sm">{branding.loginTagline}</p>
        </div>

        <Card className="p-8 shadow-xl bg-white/65 backdrop-blur-md border border-white/20">
          {!challenge ? (
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
          ) : (
            <form onSubmit={onVerify} className="space-y-3">
              <div className="text-center">
                <h2 className="text-base font-semibold m-0 text-text-main">
                  Two-factor authentication
                </h2>
                <p className="text-text-muted text-sm mt-1 m-0">
                  {useBackupCode
                    ? 'Enter one of your backup codes.'
                    : 'Enter the 6-digit code from your authenticator app.'}
                </p>
              </div>

              <input
                autoFocus
                value={code}
                onChange={(e) =>
                  setCode(
                    useBackupCode
                      ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 13)
                      : e.target.value.replace(/\D/g, '').slice(0, 6),
                  )
                }
                placeholder={useBackupCode ? 'XXXXX-XXXXX' : '123456'}
                className="mono text-center w-full"
                style={{
                  height: 48,
                  letterSpacing: useBackupCode ? '0.1em' : '0.3em',
                  fontSize: '1.3em',
                }}
                inputMode={useBackupCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
              />

              {error && (
                <div
                  role="alert"
                  className="rounded-md text-[13px] px-3 py-2"
                  style={{
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    color: 'var(--danger)',
                  }}
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11"
                isLoading={loading}
                disabled={code.length < (useBackupCode ? 10 : 6)}
              >
                Verify
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode((v) => !v);
                    setCode('');
                    setError(null);
                  }}
                  className="text-primary hover:underline bg-transparent border-0 cursor-pointer p-0"
                >
                  {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code instead'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChallenge(null);
                    setCode('');
                    setError(null);
                  }}
                  className="text-text-muted hover:underline bg-transparent border-0 cursor-pointer p-0"
                >
                  Sign in as a different user
                </button>
              </div>
            </form>
          )}
        </Card>

        <footer className="mt-8 text-center text-white/80 text-xs drop-shadow-sm">
          {branding.organizationName} · {branding.footerText}
        </footer>
      </div>
    </div>
  );
}
