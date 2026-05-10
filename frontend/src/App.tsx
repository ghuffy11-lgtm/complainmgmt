import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ComplaintsListPage } from './pages/ComplaintsListPage';
import { ComplaintCreatePage } from './pages/ComplaintCreatePage';
import { ComplaintDetailPage } from './pages/ComplaintDetailPage';
import { AdminShell } from './pages/admin/AdminShell';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminRolesPage } from './pages/admin/AdminRolesPage';
import { AdminFieldsPage } from './pages/admin/AdminFieldsPage';
import { AdminDepartmentsPage } from './pages/admin/AdminDepartmentsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { AdminLoginActivityPage } from './pages/admin/AdminLoginActivityPage';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/complaints" element={<ComplaintsListPage />} />
        <Route
          path="/complaints/new"
          element={
            <ProtectedRoute requirePermissions={['complaint:create']}>
              <ComplaintCreatePage />
            </ProtectedRoute>
          }
        />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute
              requireAnyPermission={[
                'admin.users:read',
                'admin.roles:read',
                'admin.fields:manage',
                'admin.departments:manage',
                'admin.settings:manage',
                'audit:read',
                'auth_audit:read',
              ]}
            >
              <AdminShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="roles" element={<AdminRolesPage />} />
          <Route path="departments" element={<AdminDepartmentsPage />} />
          <Route path="fields" element={<AdminFieldsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route path="login-activity" element={<AdminLoginActivityPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
