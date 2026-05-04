import { api } from './api-client';

export type Summary = { total: number; highPriority: number };

export const DashboardService = {
  summary() {
    return api.get<Summary>('/dashboard/summary').then((r) => r.data);
  },
  byStatus() {
    return api.get<{ status: string; count: number }[]>('/dashboard/by-status').then((r) => r.data);
  },
  byPriority() {
    return api.get<{ priority: string; count: number }[]>('/dashboard/by-priority').then((r) => r.data);
  },
  byDepartment() {
    return api
      .get<{ departmentId: string | null; count: number }[]>('/dashboard/by-department')
      .then((r) => r.data);
  },
};
