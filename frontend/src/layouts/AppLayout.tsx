import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';
import { AuthService } from '../services/auth.service';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { errorMessage, useToast } from '../components/ui/Toast';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const { hasAny } = usePermissions();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  const showAdmin = hasAny([
    'admin.users:read',
    'admin.roles:read',
    'admin.fields:manage',
    'admin.departments:manage',
    'admin.settings:manage',
    'audit:read',
  ]);

  const handleLogout = async () => {
    if (refreshToken) await AuthService.logout(refreshToken).catch(() => undefined);
    clear();
    nav('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: '#1f2937', color: '#f9fafb', padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>CTS</Link>
        </h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink to="/dashboard" style={navLinkStyle}>Dashboard</NavLink>
          <NavLink to="/complaints" style={navLinkStyle}>Complaints</NavLink>
          {showAdmin && <NavLink to="/admin" style={navLinkStyle}>Admin</NavLink>}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span className="muted" style={{ fontSize: 13 }}>{user?.displayName} ({user?.username})</span>
          <Button variant="ghost" onClick={() => setPwOpen(true)}>Change password</Button>
          <Button variant="secondary" onClick={handleLogout}>Sign out</Button>
        </header>
        <Outlet />
      </main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const m = useMutation({
    mutationFn: () => AuthService.changePassword(current, next),
    onSuccess: () => {
      toast.success('Password changed — please sign in again');
      clear();
      nav('/login', { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change password')),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || next.length < 10}>
            {m.isPending ? 'Saving…' : 'Update'}
          </Button>
        </>
      }
    >
      <div className="field"><label>Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field"><label>New password</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        <span className="hint">Min 10 characters. All sessions will be force-logged-out.</span>
      </div>
    </Modal>
  );
}

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? '#fbbf24' : '#f9fafb',
  textDecoration: 'none',
  padding: '6px 8px',
  borderRadius: 'var(--radius)',
  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
});
