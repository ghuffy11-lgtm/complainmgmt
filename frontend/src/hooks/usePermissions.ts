import { useAuthStore } from '../store/auth-store';

/**
 * Mirrors the backend's permission-resolver semantics: exact match,
 * resource-segment wildcard at the last colon (`complaint.field:*:write`),
 * and top-level `*:action`.
 */
export function hasPermission(permissions: string[], required: string): boolean {
  const set = new Set(permissions);
  if (set.has(required)) return true;
  const lastColon = required.lastIndexOf(':');
  if (lastColon < 0) return false;
  const resource = required.slice(0, lastColon);
  const action = required.slice(lastColon + 1);
  const lastResColon = resource.lastIndexOf(':');
  if (lastResColon >= 0) {
    const wildcard = resource.slice(0, lastResColon) + ':*';
    if (set.has(`${wildcard}:${action}`)) return true;
  }
  if (set.has(`*:${action}`)) return true;
  return false;
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  return {
    user,
    has: (p: string) => hasPermission(perms, p),
    hasAny: (ps: string[]) => ps.some((p) => hasPermission(perms, p)),
    hasAll: (ps: string[]) => ps.every((p) => hasPermission(perms, p)),
  };
}
