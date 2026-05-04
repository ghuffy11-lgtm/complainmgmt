import { Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useAuthStore } from '../store/auth-store';
import { usePermissions } from '../hooks/usePermissions';

type Props = {
  children: ReactNode;
  requirePermissions?: string[];
  requireAnyPermission?: string[];
};

export function ProtectedRoute({ children, requirePermissions, requireAnyPermission }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  const { hasAll, hasAny } = usePermissions();

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (requirePermissions && !hasAll(requirePermissions)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (requireAnyPermission && !hasAny(requireAnyPermission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
