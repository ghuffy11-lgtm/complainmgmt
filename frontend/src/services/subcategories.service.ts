import { api } from './api-client';
import type { Subcategory } from '../types/api';

export const SubcategoriesService = {
  listForDepartment(departmentId: string) {
    return api
      .get<Subcategory[]>(`/departments/${departmentId}/subcategories`)
      .then((r) => r.data);
  },
  list(opts: { departmentId?: string; active?: boolean } = {}) {
    return api
      .get<Subcategory[]>('/subcategories', {
        params: {
          departmentId: opts.departmentId,
          active: opts.active === undefined ? undefined : String(opts.active),
        },
      })
      .then((r) => r.data);
  },
  create(departmentId: string, body: { key: string; name: string }) {
    return api
      .post<Subcategory>(`/departments/${departmentId}/subcategories`, body)
      .then((r) => r.data);
  },
  update(id: string, body: { name?: string; isActive?: boolean }) {
    return api.patch<Subcategory>(`/subcategories/${id}`, body).then((r) => r.data);
  },
};
