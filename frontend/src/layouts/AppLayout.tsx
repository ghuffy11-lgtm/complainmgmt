import * as React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardList,
  Eye,
  EyeOff,
  Key,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';
import { useBranding } from '../hooks/useBranding';
import { AuthService } from '../services/auth.service';
import { TwoFactorService } from '../services/two-factor.service';
import { TwoFactorEnrollDialog } from '../components/TwoFactorEnrollDialog';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { errorMessage, useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

const COLLAPSE_KEY = 'cts-sidebar-collapsed';

interface NavItemDef {
  to: string;
  label: string;
  icon: React.ElementType;
  /** Show only when at least one of these permissions is held. */
  perms?: string[];
}

const NAV_ITEMS: NavItemDef[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/complaints', label: 'Complaints', icon: ClipboardList },
  {
    to: '/admin',
    label: 'Admin',
    icon: ShieldCheck,
    // `audit:read` was previously in this list — that made Managers (who
    // hold audit:read but no admin.* perm) see the Admin sidebar link with
    // only the Audit subpage actually accessible. Confusing. Admin in the
    // sidebar now means "you have at least one admin.* power"; if a
    // standalone "Audit search" link for managers is wanted later, add
    // it as its own sidebar entry gated on audit:read alone.
    perms: [
      'admin.users:read',
      'admin.roles:read',
      'admin.fields:manage',
      'admin.departments:manage',
      'admin.settings:manage',
    ],
  },
];

/**
 * App shell: dark editorial sidebar (brand → nav → collapse → user) on
 * the left, white workspace on the right with a slim header and footer.
 * Sidebar collapse persists across reloads via localStorage.
 */
export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const { hasAny } = usePermissions();
  const branding = useBranding();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = React.useState(false);
  const [twoFaOpen, setTwoFaOpen] = React.useState<'enroll' | 'disable' | null>(null);
  const [forceEnroll, setForceEnroll] = React.useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  // Listen for the api-client's MUST_ENROLL_2FA signal. Triggered when a
  // backend request comes back 412 — meaning an admin tried to do
  // anything before enrolling. We pop the wizard and forbid dismissal
  // until enrollment completes.
  React.useEffect(() => {
    const onForce = () => {
      setForceEnroll(true);
      setTwoFaOpen('enroll');
    };
    window.addEventListener('cts:must-enroll-2fa', onForce);
    return () => window.removeEventListener('cts:must-enroll-2fa', onForce);
  }, []);

  // Proactively detect "I am admin and not enrolled" on every render so
  // we don't have to wait for the user to click something that triggers
  // a 412. /auth/me already reports `twoFactorEnrolled`.
  React.useEffect(() => {
    if (user?.roleKeys.includes('admin') && !user.twoFactorEnrolled) {
      setForceEnroll(true);
      setTwoFaOpen('enroll');
    }
  }, [user?.roleKeys, user?.twoFactorEnrolled]);
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  React.useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  React.useEffect(() => {
    document.title = branding.systemName;
  }, [branding.systemName]);

  const handleLogout = async () => {
    if (refreshToken) await AuthService.logout(refreshToken).catch(() => undefined);
    clear();
    nav('/login', { replace: true });
  };

  const initials = (user?.displayName ?? user?.username ?? '?')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className="flex h-screen bg-bg overflow-hidden"
      style={{ ['--cts-sidebar-width' as string]: collapsed ? '64px' : '240px' }}
    >
      <aside
        className={cn(
          'bg-sidebar text-sidebar-text flex flex-col shrink-0 transition-[width] duration-200',
          collapsed ? 'w-[64px]' : 'w-[240px]',
        )}
      >
        {/* Brand */}
        <Link
          to="/"
          className="px-4 py-5 flex items-center gap-3 border-b border-sidebar-2 hover:bg-sidebar-2/40"
          title={branding.systemName}
        >
          <span className="w-9 h-9 rounded-lg bg-sidebar-accent/15 text-sidebar-accent inline-flex items-center justify-center shrink-0 overflow-hidden">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.organizationName}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <ShieldCheck size={20} />
            )}
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-[15px] font-semibold text-white truncate">
                {branding.systemShortName}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-text-muted font-semibold">
                {branding.systemName}
              </span>
            </span>
          )}
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            if (item.perms && !hasAny(item.perms)) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-sidebar-2 text-sidebar-accent font-medium'
                      : 'text-sidebar-text-muted hover:bg-sidebar-2 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={18}
                      className={cn(
                        isActive ? 'text-sidebar-accent' : 'text-sidebar-text-muted group-hover:text-white',
                      )}
                    />
                    {!collapsed && <span className="text-[13px]">{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mx-2 mb-2 flex items-center gap-2 px-3 py-2 rounded-md text-sidebar-text-muted hover:bg-sidebar-2 hover:text-white transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="text-[12px]">Collapse</span>}
        </button>

        {/* User block */}
        <div className="p-3 border-t border-sidebar-2">
          <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
            <div className="w-9 h-9 rounded-full bg-primary text-white font-bold text-[13px] inline-flex items-center justify-center shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-white truncate leading-none mb-1">
                  {user?.displayName ?? user?.username ?? '—'}
                </span>
                <span className="text-[11px] text-sidebar-text-muted truncate">
                  @{user?.username}
                  {user?.roleKeys?.[0] && ` · ${user.roleKeys[0]}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 rounded-full bg-primary-bg text-primary text-[10px] font-bold uppercase tracking-wider border border-primary-border">
              Operational
            </span>
            <span className="hidden sm:inline text-text-subtle text-xs">
              {branding.organizationName} {branding.systemShortName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Shield size={14} />}
              onClick={() => setTwoFaOpen(user?.twoFactorEnrolled ? 'disable' : 'enroll')}
            >
              {user?.twoFactorEnrolled ? 'Two-factor: on' : 'Set up 2FA'}
            </Button>
            <Button variant="ghost" size="sm" icon={<Key size={14} />} onClick={() => setPwOpen(true)}>
              Change password
            </Button>
            <Button variant="secondary" size="sm" icon={<LogOut size={14} />} onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-border py-3 px-6 flex justify-between items-center bg-surface text-[11px] text-text-subtle">
          <span>{branding.organizationName} · {branding.footerText}</span>
          <span className="font-mono">{branding.systemShortName}</span>
        </footer>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password" footer={null}>
        <ChangePasswordForm onClose={() => setPwOpen(false)} />
      </Modal>

      {twoFaOpen === 'enroll' && (
        <TwoFactorEnrollDialog
          mandatory={forceEnroll}
          onClose={() => {
            // In mandatory mode the dialog refuses to close until
            // enrollment is complete — calling onClose is a no-op so
            // the user can't escape via Escape / overlay click / Cancel.
            if (forceEnroll) return;
            setTwoFaOpen(null);
          }}
          onEnrolled={async () => {
            // Refresh /me so the header label flips to "Two-factor: on"
            // and twoFactorEnrolled becomes true (clears forceEnroll).
            try {
              const me = await AuthService.me();
              setUser(me);
            } catch { /* ignore — header will refresh on next nav */ }
            setForceEnroll(false);
            setTwoFaOpen(null);
          }}
        />
      )}
      {twoFaOpen === 'disable' && (
        <DisableTwoFactorForm onClose={() => setTwoFaOpen(null)} />
      )}
    </div>
  );
}

function DisableTwoFactorForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [pw, setPw] = React.useState('');
  const m = useMutation({
    mutationFn: () => TwoFactorService.disable(pw),
    onSuccess: () => {
      toast.success('Two-factor disabled — please sign in again');
      clear();
      nav('/login', { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not disable')),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Turn off two-factor authentication"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => m.mutate()}
            disabled={pw.length === 0 || m.isPending}
          >
            {m.isPending ? 'Disabling…' : 'Disable 2FA'}
          </Button>
        </>
      }
    >
      <p className="text-sm m-0 mb-2">
        Confirm your current password to turn off 2FA on your account. After this,
        login will only require your password again.
      </p>
      <p className="muted text-xs m-0 mb-3">
        All of your sessions will be signed out.
      </p>
      <div className="field">
        <label>Current password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
      </div>
    </Modal>
  );
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showNew, setShowNew] = React.useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 10;
  const canSubmit = next.length >= 10 && confirm === next;

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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        m.mutate();
      }}
      className="space-y-2"
    >
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <Input
        label="New password"
        type={showNew ? 'text' : 'password'}
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint="Min 10 characters. All sessions will be force-logged-out."
        error={tooShort ? 'At least 10 characters required.' : undefined}
        required
      />
      <Input
        label="Confirm new password"
        type={showNew ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? 'Passwords do not match.' : undefined}
        required
      />
      <button
        type="button"
        onClick={() => setShowNew((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main transition-colors"
        aria-pressed={showNew}
      >
        {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
        {showNew ? 'Hide passwords' : 'Show new passwords'}
      </button>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={m.isPending || !canSubmit} isLoading={m.isPending}>
          Update
        </Button>
      </div>
    </form>
  );
}
