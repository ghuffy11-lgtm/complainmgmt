import { api } from './api-client';
import type { DynamicField, DynamicFieldOption, FieldLocking, FieldType } from '../types/api';

export type CreateFieldPayload = {
  key: string;
  label: string;
  type: FieldType;
  isRequired?: boolean;
  isActive?: boolean;
  isSearchable?: boolean;
  sortOrder?: number;
  validation?: Record<string, unknown>;
  visibility?: { roles: '*' | string[] };
  locking?: FieldLocking;
};

export type UpdateFieldPayload = Omit<Partial<CreateFieldPayload>, 'key' | 'type'>;

export type OptionInput = {
  id?: string;
  value: string;
  label: string;
  sortOrder?: number;
  isActive?: boolean;
};

export const DynamicFieldsService = {
  list() {
    return api.get<DynamicField[]>('/dynamic-fields').then((r) => r.data);
  },
  // Admin
  fullSchema() {
    return api.get<DynamicField[]>('/admin/dynamic-fields').then((r) => r.data);
  },
  get(id: string) {
    return api.get<DynamicField>(`/admin/dynamic-fields/${id}`).then((r) => r.data);
  },
  create(body: CreateFieldPayload) {
    return api.post<DynamicField>('/admin/dynamic-fields', body).then((r) => r.data);
  },
  update(id: string, body: UpdateFieldPayload) {
    return api.patch<DynamicField>(`/admin/dynamic-fields/${id}`, body).then((r) => r.data);
  },
  remove(id: string) {
    return api.delete(`/admin/dynamic-fields/${id}`).then(() => undefined);
  },
  replaceOptions(id: string, options: OptionInput[]) {
    return api
      .post<DynamicField>(`/admin/dynamic-fields/${id}/options`, { options })
      .then((r) => r.data);
  },
};

/** Lookup helper: build a value→option map for O(1) label resolution. */
export function indexOptions(field: DynamicField): Map<string, DynamicFieldOption> {
  return new Map((field.options ?? []).map((o) => [o.id, o]));
}
