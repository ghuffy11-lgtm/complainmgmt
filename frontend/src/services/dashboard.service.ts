import { api } from './api-client';

export type Summary = {
  total: number;
  /** Currently active (status ∈ {open, in_progress}). */
  open: number;
  highPriority: number;
  /** Echoed by the server so the UI can show "Department: X". null = full view. */
  scopedToDepartmentId: string | null;
};

export type AgingBucket = { bucket: '0-1d' | '1-7d' | '7-30d' | '30d+'; count: number };

export type ResolutionLatency = {
  days: number;
  count: number;
  avgHours: number | null;
  medianHours: number | null;
  p95Hours: number | null;
  perWeek: { week: string; count: number; avgHours: number }[];
};

/**
 * `departmentId` narrows the view. Server enforces tier:
 *   - `dashboard:read`     → may pass any id, or omit for the full view
 *   - `dashboard.own:read` → forced to caller's own department, query ignored
 */
type ScopeOpts = { departmentId?: string };

export const DashboardService = {
  summary(opts: ScopeOpts = {}) {
    return api.get<Summary>('/dashboard/summary', { params: opts }).then((r) => r.data);
  },
  byStatus(opts: ScopeOpts = {}) {
    return api.get<{ status: string; count: number }[]>('/dashboard/by-status', { params: opts })
      .then((r) => r.data);
  },
  byPriority(opts: ScopeOpts = {}) {
    return api.get<{ priority: string; count: number }[]>('/dashboard/by-priority', { params: opts })
      .then((r) => r.data);
  },
  byDepartment(opts: ScopeOpts = {}) {
    return api.get<{ departmentId: string | null; count: number }[]>('/dashboard/by-department', { params: opts })
      .then((r) => r.data);
  },
  byDate(days = 90, opts: ScopeOpts = {}) {
    return api
      .get<{ days: number; data: { date: string; count: number }[] }>('/dashboard/by-date', {
        params: { days, ...opts },
      })
      .then((r) => r.data);
  },
  aging(opts: ScopeOpts = {}) {
    return api.get<AgingBucket[]>('/dashboard/aging', { params: opts }).then((r) => r.data);
  },
  resolutionLatency(days = 90, opts: ScopeOpts = {}) {
    return api
      .get<ResolutionLatency>('/dashboard/resolution-latency', { params: { days, ...opts } })
      .then((r) => r.data);
  },
};
