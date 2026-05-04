import { api } from './api-client';
import type { Paged, UserSummary } from '../types/api';

export const UsersService = {
  list(page = 1, pageSize = 50) {
    return api.get<Paged<UserSummary>>('/users', { params: { page, pageSize } }).then((r) => r.data);
  },
  get(id: string) {
    return api.get<UserSummary>(`/users/${id}`).then((r) => r.data);
  },
  create(body: {
    username: string;
    displayName: string;
    email?: string;
    password: string;
    isActive?: boolean;
    roleIds?: string[];
  }) {
    return api.post<UserSummary>('/users', body).then((r) => r.data);
  },
  update(id: string, body: { displayName?: string; email?: string | null; isActive?: boolean }) {
    return api.patch<UserSummary>(`/users/${id}`, body).then((r) => r.data);
  },
  setRoles(id: string, roleIds: string[]) {
    return api.post(`/users/${id}/roles`, { roleIds }).then(() => undefined);
  },
  resetPassword(id: string, newPassword: string) {
    return api.post(`/users/${id}/reset-password`, { newPassword }).then(() => undefined);
  },
};
