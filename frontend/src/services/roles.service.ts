import { api } from './api-client';
import type { Permission, Role } from '../types/api';

export const RolesService = {
  list() {
    return api.get<Role[]>('/roles').then((r) => r.data);
  },
  create(body: { key: string; name: string; description?: string }) {
    return api.post<Role>('/roles', body).then((r) => r.data);
  },
  update(id: string, body: { name?: string; description?: string }) {
    return api.patch<Role>(`/roles/${id}`, body).then((r) => r.data);
  },
  remove(id: string) {
    return api.delete(`/roles/${id}`).then(() => undefined);
  },
  /** Permission IDs currently granted to the role — used by the editor
   *  to pre-populate the grid. */
  getPermissionIds(id: string) {
    return api
      .get<{ permissionIds: string[] }>(`/roles/${id}/permissions`)
      .then((r) => r.data.permissionIds);
  },
  setPermissions(id: string, permissionIds: string[]) {
    return api.post(`/roles/${id}/permissions`, { permissionIds }).then(() => undefined);
  },
};

export const PermissionsService = {
  list() {
    return api.get<Permission[]>('/permissions').then((r) => r.data);
  },
};
