import { api } from './api-client';
import type { Origin } from '../types/api';

export const OriginsService = {
  list() {
    return api.get<Origin[]>('/origins').then((r) => r.data);
  },
  create(body: { key: string; name: string; sortOrder?: number }) {
    return api.post<Origin>('/origins', body).then((r) => r.data);
  },
  update(id: string, body: { name?: string; isActive?: boolean; sortOrder?: number }) {
    return api.patch<Origin>(`/origins/${id}`, body).then((r) => r.data);
  },
};
