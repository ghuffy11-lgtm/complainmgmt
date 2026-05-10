import { api } from './api-client';

export type AuthAuditEvent =
  | 'login.success'
  | 'login.password_failed'
  | 'login.unknown_user'
  | 'login.account_locked'
  | 'login.inactive'
  | 'login.wrong_provider'
  | 'login.2fa_success'
  | 'login.2fa_failed'
  | 'account.locked'
  | 'account.unlocked_by_admin'
  | '2fa.enrolled'
  | '2fa.disabled'
  | '2fa.reset_by_admin'
  | 'logout'
  | 'password_changed';

export type AuthAuditRow = {
  id: string;
  occurredAt: string;
  username: string;
  userId: string | null;
  userDisplayName: string | null;
  event: AuthAuditEvent;
  ip: string | null;
  userAgent: string | null;
  detail: Record<string, unknown> | null;
};

export type AuthAuditFilter = {
  page?: number;
  pageSize?: number;
  username?: string;
  ip?: string;
  event?: string;
  success?: 'true' | 'false';
  from?: string;
  to?: string;
};

export type AuthAuditPage = {
  data: AuthAuditRow[];
  meta: { page: number; pageSize: number; total: number };
};

export type AuthAuditTripwireRow = {
  ip: string;
  count: number;
  lastSeen: string;
};

export type AuthAuditTripwireResponse = {
  data: AuthAuditTripwireRow[];
  meta: { threshold: number; windowHours: number; since: string };
};

export const AuthAuditService = {
  search(params: AuthAuditFilter = {}): Promise<AuthAuditPage> {
    return api.get<AuthAuditPage>('/admin/auth-audit', { params }).then((r) => r.data);
  },
  /** IPs with ≥ threshold failures in the last windowHours hours.
   *  Defaults: threshold=10, windowHours=24. */
  tripwire(threshold = 10, windowHours = 24): Promise<AuthAuditTripwireResponse> {
    return api
      .get<AuthAuditTripwireResponse>('/admin/auth-audit/tripwire', {
        params: { threshold, windowHours },
      })
      .then((r) => r.data);
  },
};
