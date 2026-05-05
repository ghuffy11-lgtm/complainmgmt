import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';
import { AuthService } from '../services/auth.service';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { errorMessage, useToast } from '../components/ui/Toast';
import {
  IconClipboard,
  IconDashboard,
  IconKey,
  IconLogOut,
  IconShield,
  IconUser,
} from '../components/ui/Icons';

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
      <aside style={asideStyle}>
        {/* Brand */}
        <Link to="/" style={brandStyle}>
          <span style={brandMarkStyle}>
            <IconShield size={18} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>CTS</span>
            <span style={{ fontSize: 11, color: 'var(--sidebar-text-muted)' }}>Complaint Tracking</span>
          </span>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16 }}>
          <NavLink to="/dashboard" style={navLinkStyle}>
            {({ isActive }) => <NavInner active={isActive} icon={<IconDashboard size={18} />} label="Dashboard" />}
          </NavLink>
          <NavLink to="/complaints" style={navLinkStyle}>
            {({ isActive }) => <NavInner active={isActive} icon={<IconClipboard size={18} />} label="Complaints" />}
          </NavLink>
          {showAdmin && (
            <NavLink to="/admin" style={navLinkStyle}>
              {({ isActive }) => <NavInner active={isActive} icon={<IconShield size={18} />} label="Admin" />}
            </NavLink>
          )}
        </nav>

        <span className="spacer" />

        {/* User block at the bottom */}
        <div style={userBlockStyle}>
          <div style={avatarStyle}>
            <IconUser size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.displayName ?? '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--sidebar-text-muted)' }}>
              @{user?.username} {user?.roleKeys?.[0] && `· ${user.roleKeys[0]}`}
            </span>
          </div>
        </div>
      </aside>

      <main style={mainStyle}>
        <header style={headerStyle}>
          <span className="spacer" />
          <Button variant="ghost" size="sm" icon={<IconKey size={14} />} onClick={() => setPwOpen(true)}>
            Change password
          </Button>
          <Button variant="secondary" size="sm" icon={<IconLogOut size={14} />} onClick={handleLogout}>
            Sign out
          </Button>
        </header>
        <div style={contentStyle}>
          <Outlet />
        </div>
      </main>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function NavInner({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 'var(--radius)',
        color: active ? 'var(--sidebar-accent)' : 'var(--sidebar-text)',
        background: active ? 'rgba(96, 165, 250, 0.10)' : 'transparent',
        borderLeft: '3px solid',
        borderLeftColor: active ? 'var(--sidebar-accent)' : 'transparent',
        fontWeight: active ? 500 : 400,
        transition: 'background-color 120ms ease, color 120ms ease',
      }}
    >
      {icon}
      <span>{label}</span>
    </span>
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
      <div className="field">
        <label>Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label>New password</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        <span className="hint">Min 10 characters. All sessions will be force-logged-out.</span>
      </div>
    </Modal>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────

const asideStyle: React.CSSProperties = {
  width: 240,
  background: 'linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar-2) 100%)',
  color: 'var(--sidebar-text)',
  padding: '20px 14px',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(0,0,0,0.2)',
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: 'var(--sidebar-text)',
  textDecoration: 'none',
  padding: '4px 6px',
};

const brandMarkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--radius)',
  background: 'linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)',
  color: 'white',
  flexShrink: 0,
};

const userBlockStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 10,
  marginTop: 12,
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 'var(--radius)',
  border: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
};

const avatarStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-full)',
  background: 'rgba(96,165,250,0.15)',
  color: 'var(--sidebar-accent)',
  flexShrink: 0,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 24px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: 24,
  overflow: 'auto',
  flex: 1,
};

const navLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
};
