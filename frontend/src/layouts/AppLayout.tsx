import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';
import { AuthService } from '../services/auth.service';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { errorMessage, useToast } from '../components/ui/Toast';
import {
  IconChevronRight,
  IconClipboard,
  IconDashboard,
  IconKey,
  IconLogOut,
  IconShield,
  IconUser,
} from '../components/ui/Icons';

const COLLAPSE_KEY = 'cts-sidebar-collapsed';

/**
 * App shell:
 *   - Sidebar grouped into "Workspace" + "System". Collapsible to icon-only
 *     mode; preference persists across reloads via localStorage.
 *   - Top header with right-aligned account actions.
 *
 * Tone is taken from the Lovable theme port: deep slate sidebar, teal
 * sidebar-accent, calm white workspace.
 */
export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const { hasAny } = usePermissions();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

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

  const sidebarWidth = collapsed ? 64 : 240;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ ...asideStyle, width: sidebarWidth, padding: collapsed ? '20px 8px' : '20px 14px' }}>
        {/* Brand */}
        <Link to="/" style={brandStyle} title="Complaint Tracking">
          <span style={brandMarkStyle}><IconShield size={18} /></span>
          {!collapsed && (
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Complaint Tracking</span>
              <span style={{ fontSize: 11, color: 'var(--sidebar-text-muted)' }}>Quality &amp; Safety</span>
            </span>
          )}
        </Link>

        {/* Workspace group */}
        <NavGroup label="Workspace" collapsed={collapsed}>
          <NavItem to="/dashboard"  icon={<IconDashboard  size={18} />} label="Dashboard"  collapsed={collapsed} />
          <NavItem to="/complaints" icon={<IconClipboard  size={18} />} label="Complaints" collapsed={collapsed} />
        </NavGroup>

        {/* System group */}
        {showAdmin && (
          <NavGroup label="System" collapsed={collapsed}>
            <NavItem to="/admin" icon={<IconShield size={18} />} label="Admin" collapsed={collapsed} />
          </NavGroup>
        )}

        <span className="spacer" />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={collapseToggleStyle(collapsed)}
        >
          <span style={{ display: 'inline-flex', transition: 'transform 180ms ease', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            <IconChevronRight size={14} />
          </span>
          {!collapsed && <span style={{ fontSize: 12 }}>Collapse</span>}
        </button>

        {/* User block at the bottom */}
        <div style={userBlockStyle(collapsed)}>
          <div style={avatarStyle}><IconUser size={18} /></div>
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.displayName ?? '—'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--sidebar-text-muted)' }}>
                @{user?.username}{user?.roleKeys?.[0] && ` · ${user.roleKeys[0]}`}
              </span>
            </div>
          )}
        </div>
      </aside>

      <main style={mainStyle}>
        <header style={headerStyle}>
          <span className="spacer" />
          <Button
            variant="ghost"
            size="sm"
            icon={<IconKey size={14} />}
            onClick={() => setPwOpen(true)}
          >
            Change password
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<IconLogOut size={14} />}
            onClick={handleLogout}
          >
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

// ─── nav primitives ─────────────────────────────────────────────────────

function NavGroup({
  label, collapsed, children,
}: { label: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      {!collapsed && (
        <div style={navGroupLabelStyle}>{label}</div>
      )}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </nav>
    </div>
  );
}

function NavItem({
  to, icon, label, collapsed,
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }} title={collapsed ? label : undefined}>
      {({ isActive }) => (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            padding: collapsed ? '8px' : '8px 12px',
            borderRadius: 'var(--radius)',
            color: isActive ? 'var(--sidebar-accent)' : 'var(--sidebar-text)',
            background: isActive ? 'hsl(185 55% 50% / 0.10)' : 'transparent',
            borderLeft: collapsed ? 'none' : '3px solid',
            borderLeftColor: isActive ? 'var(--sidebar-accent)' : 'transparent',
            fontWeight: isActive ? 500 : 400,
            fontSize: 13,
            transition: 'background-color 120ms ease, color 120ms ease',
          }}
        >
          {icon}
          {!collapsed && <span>{label}</span>}
        </span>
      )}
    </NavLink>
  );
}

// ─── change-password modal ──────────────────────────────────────────────

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
  background: 'linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar-2) 100%)',
  color: 'var(--sidebar-text)',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(0,0,0,0.2)',
  transition: 'width 200ms ease, padding 200ms ease',
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
  background: 'var(--sidebar-accent)',
  color: 'var(--sidebar)',
  flexShrink: 0,
};

const navGroupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--sidebar-text-muted)',
  padding: '0 12px',
  marginBottom: 6,
};

const userBlockStyle = (collapsed: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: collapsed ? 0 : 10,
  justifyContent: collapsed ? 'center' : 'flex-start',
  padding: 10,
  marginTop: 12,
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 'var(--radius)',
  border: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
});

const avatarStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-full)',
  background: 'hsl(185 55% 50% / 0.15)',
  color: 'var(--sidebar-accent)',
  flexShrink: 0,
};

const collapseToggleStyle = (collapsed: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: 8,
  padding: collapsed ? '8px' : '8px 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius)',
  color: 'var(--sidebar-text-muted)',
  cursor: 'pointer',
  marginTop: 8,
});

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
