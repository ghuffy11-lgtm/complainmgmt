import { NavLink, Outlet } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 'var(--radius)',
  background: isActive ? 'var(--surface)' : 'transparent',
  border: isActive ? '1px solid var(--border)' : '1px solid transparent',
  color: isActive ? 'var(--primary)' : 'var(--text)',
  textDecoration: 'none',
  fontWeight: isActive ? 500 : 400,
});

export function AdminShell() {
  const { has } = usePermissions();
  return (
    <section>
      <h1>Admin</h1>
      <nav
        style={{
          display: 'flex', gap: 4, marginBottom: 16,
          padding: 4, background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {has('admin.users:read') && <NavLink to="users" style={linkStyle}>Users</NavLink>}
        {has('admin.roles:read') && <NavLink to="roles" style={linkStyle}>Roles</NavLink>}
        {has('admin.departments:manage') && <NavLink to="departments" style={linkStyle}>Departments</NavLink>}
        {has('admin.fields:manage') && <NavLink to="fields" style={linkStyle}>Fields</NavLink>}
        {has('admin.settings:manage') && <NavLink to="settings" style={linkStyle}>Settings</NavLink>}
        {has('audit:read') && <NavLink to="audit" style={linkStyle}>Audit</NavLink>}
      </nav>
      <Outlet />
    </section>
  );
}
