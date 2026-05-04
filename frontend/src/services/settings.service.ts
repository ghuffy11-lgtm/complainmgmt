import { api } from './api-client';

export const SettingsService = {
  get() {
    return api.get<Record<string, unknown>>('/admin/settings').then((r) => r.data);
  },
  update(values: Record<string, unknown>) {
    return api.patch('/admin/settings', { values }).then(() => undefined);
  },
};
