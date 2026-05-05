import * as React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardList,
  Key,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';
import { AuthService } from '../services/auth.service';
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
    perms: [
      'admin.users:read',
      'admin.roles:read',
      'admin.fields:manage',
      'admin.departments:manage',
      'admin.settings:manage',
      'audit:read',
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
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  React.useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

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
          title="Complaint Tracking"
        >
          <span className="w-9 h-9 rounded-lg bg-sidebar-accent/15 text-sidebar-accent inline-flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-[15px] font-semibold text-white truncate">CTS</span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-text-muted font-semibold">
                Complaint Tracking
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
        <div className="p-3 border-t border-sidebar-2 bg-black/30">
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
            <span className="hidden sm:inline text-text-subtle text-xs">Hadi Clinic CTS</span>
          </div>

          <div className="flex items-center gap-2">
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
          <span>Hadi Clinic · Internal use only · Access logged</span>
          <span className="font-mono">CTS</span>
        </footer>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password" footer={null}>
        <ChangePasswordForm onClose={() => setPwOpen(false)} />
      </Modal>
    </div>
  );
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');

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
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint="Min 10 characters. All sessions will be force-logged-out."
        required
      />
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={m.isPending || next.length < 10} isLoading={m.isPending}>
          Update
        </Button>
      </div>
    </form>
  );
}
