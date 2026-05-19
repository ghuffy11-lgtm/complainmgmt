import { api } from './api-client';
import type {
  AssignmentHistoryEntry,
  AttachmentMeta,
  AuditEntry,
  Complaint,
  ComplaintDetail,
  ComplaintPriority,
  ComplaintStatus,
  Paged,
} from '../types/api';

export type ListParams = {
  page?: number;
  pageSize?: number;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  assignedTo?: string;
  departmentId?: string;
  /** Origin filter. `'none'` = legacy rows with NULL origin_id. */
  originId?: string;
  subcategoryId?: string;
  q?: string;
  /** YYYY-MM-DD inclusive bounds on `complaint_date`. */
  dateFrom?: string;
  dateTo?: string;
  /** Dynamic-field-value filters keyed by field key, e.g. `{mobile_number: '555'}`.
   *  Wire-format: `?fv[mobile_number]=555`. Server enforces is_searchable. */
  fv?: Record<string, string>;
};

export const ComplaintsService = {
  list(params: ListParams = {}) {
    // Flatten `fv` into bracketed query keys so axios + qs round-trip cleanly:
    //   { fv: { mobile_number: '555' } }  →  ?fv[mobile_number]=555
    const { fv, ...rest } = params;
    const flat: Record<string, string | number | undefined> = { ...rest };
    if (fv) {
      for (const [k, v] of Object.entries(fv)) {
        if (v !== '' && v != null) flat[`fv[${k}]`] = v;
      }
    }
    return api.get<Paged<Complaint>>('/complaints', { params: flat }).then((r) => r.data);
  },
  get(id: string) {
    return api.get<ComplaintDetail>(`/complaints/${id}`).then((r) => r.data);
  },
  create(body: {
    values: Record<string, unknown>;
    priority?: ComplaintPriority;
    departmentId?: string;
    assignedTo?: string;
    assignmentNote?: string;
    /** Operator-supplied event date, YYYY-MM-DD. */
    complaintDate?: string;
    originId: string;
    subcategoryId?: string;
  }) {
    return api.post<ComplaintDetail>('/complaints', body).then((r) => r.data);
  },
  update(
    id: string,
    body: {
      values?: Record<string, unknown>;
      complaintDate?: string | null;
      subcategoryId?: string | null;
      originId?: string;
    },
  ) {
    return api.patch<ComplaintDetail>(`/complaints/${id}`, body).then((r) => r.data);
  },
  /**
   * Change the status. The optional `note` lands on the audit row's `note`
   * column — particularly useful for reopens (closed/resolved → other) so
   * reviewers see the justification in the activity timeline.
   */
  setStatus(id: string, status: ComplaintStatus, note?: string) {
    return api.patch<ComplaintDetail>(`/complaints/${id}/status`, { status, note }).then((r) => r.data);
  },
  setPriority(id: string, priority: ComplaintPriority) {
    return api.patch<ComplaintDetail>(`/complaints/${id}/priority`, { priority }).then((r) => r.data);
  },
  assign(id: string, body: { departmentId: string | null; assignedTo: string | null; note?: string }) {
    return api.post<ComplaintDetail>(`/complaints/${id}/assign`, body).then((r) => r.data);
  },
  // Attachments
  listAttachments(id: string) {
    return api.get<AttachmentMeta[]>(`/complaints/${id}/attachments`).then((r) => r.data);
  },
  uploadAttachment(id: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<AttachmentMeta>(`/complaints/${id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  deleteAttachment(complaintId: string, attId: string) {
    return api.delete(`/complaints/${complaintId}/attachments/${attId}`).then(() => undefined);
  },
  /** Returns a one-shot blob URL the caller is responsible for revoking. */
  async fetchAttachmentBlob(complaintId: string, attId: string): Promise<{ url: string; revoke: () => void }> {
    const r = await api.get<Blob>(`/complaints/${complaintId}/attachments/${attId}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(r.data);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  },
  // History + audit
  assignmentHistory(id: string) {
    return api.get<AssignmentHistoryEntry[]>(`/complaints/${id}/assignments`).then((r) => r.data);
  },
  auditTimeline(id: string, page = 1, pageSize = 50) {
    return api
      .get<Paged<AuditEntry>>(`/complaints/${id}/audit`, { params: { page, pageSize } })
      .then((r) => r.data);
  },
};
