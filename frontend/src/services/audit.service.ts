import { api } from './api-client';
import type { AuditEntry, Paged } from '../types/api';

export type AuditFilter = {
  page?: number;
  pageSize?: number;
  complaintId?: string;
  actorId?: string;
  fieldKey?: string;
  action?: string;
};

export const AuditService = {
  search(params: AuditFilter = {}) {
    return api.get<Paged<AuditEntry>>('/audit', { params }).then((r) => r.data);
  },
};
