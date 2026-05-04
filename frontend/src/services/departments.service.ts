import { api } from './api-client';
import type { Department } from '../types/api';

export const DepartmentsService = {
  list() {
    return api.get<Department[]>('/departments').then((r) => r.data);
  },
  create(body: { key: string; name: string }) {
    return api.post<Department>('/departments', body).then((r) => r.data);
  },
  update(id: string, body: { name?: string; isActive?: boolean }) {
    return api.patch<Department>(`/departments/${id}`, body).then((r) => r.data);
  },
};
