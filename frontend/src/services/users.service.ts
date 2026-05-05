import { api } from './api-client';
import type { Paged, UserSummary } from '../types/api';

export type ListUsersOpts = {
  page?: number;
  pageSize?: number;
  /** Restrict to active members of a specific department. Used by the
   *  assignment dialog's cascade picker. */
  departmentId?: string;
  /** Restrict to active or inactive users only. Omit for both. */
  isActive?: boolean;
};

export const UsersService = {
  list(opts: ListUsersOpts | number = {}, pageSize = 50) {
    // Backwards-compat: callers used to pass `(page, pageSize)`.
    const params: ListUsersOpts =
      typeof opts === 'number' ? { page: opts, pageSize } : { pageSize, ...opts };
    return api.get<Paged<UserSummary>>('/users', { params }).then((r) => r.data);
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
    /** Primary department (must be one of departmentIds). */
    departmentId?: string;
    /** Full department-membership set. */
    departmentIds?: string[];
  }) {
    return api.post<UserSummary>('/users', body).then((r) => r.data);
  },
  update(id: string, body: {
    displayName?: string;
    email?: string | null;
    isActive?: boolean;
    /** `null` clears, omit keeps. Must be one of departmentIds when set. */
    departmentId?: string | null;
    /** Replaces the full membership set. Omit to leave unchanged. */
    departmentIds?: string[];
  }) {
    return api.patch<UserSummary>(`/users/${id}`, body).then((r) => r.data);
  },
  setRoles(id: string, roleIds: string[]) {
    return api.post(`/users/${id}/roles`, { roleIds }).then(() => undefined);
  },
  resetPassword(id: string, newPassword: string) {
    return api.post(`/users/${id}/reset-password`, { newPassword }).then(() => undefined);
  },
};
