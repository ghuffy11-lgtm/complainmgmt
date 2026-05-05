import { NavLink, Outlet } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { cn } from '../../lib/utils';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
    isActive
      ? 'bg-surface text-primary shadow-sm ring-1 ring-border'
      : 'text-text-muted hover:text-text-main hover:bg-surface-2/60',
  );

export function AdminShell() {
  const { has } = usePermissions();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Admin</h1>
        <p className="text-sm text-text-muted mt-1">
          Configure system settings and manage organisation resources
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 bg-surface-2/30 p-1 rounded-lg w-fit border border-border">
        {has('admin.users:read') && <NavLink to="users" className={tabClass}>Users</NavLink>}
        {has('admin.roles:read') && <NavLink to="roles" className={tabClass}>Roles</NavLink>}
        {has('admin.departments:manage') && <NavLink to="departments" className={tabClass}>Departments</NavLink>}
        {has('admin.fields:manage') && <NavLink to="fields" className={tabClass}>Fields</NavLink>}
        {has('admin.settings:manage') && <NavLink to="settings" className={tabClass}>Settings</NavLink>}
        {has('audit:read') && <NavLink to="audit" className={tabClass}>Audit</NavLink>}
      </nav>

      <Outlet />
    </section>
  );
}
