export type Me = {
  id: number;
  username: string;
  displayName: string;
  roleKeys: string[];
  permissions: string[];
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: Me;
};

export type Paged<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

// ─── Dynamic fields ───────────────────────────────────────────────────────
export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'file';
export type FieldLocking = 'none' | 'first_writer_wins';

export type DynamicFieldOption = {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type DynamicField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  validation: Record<string, unknown>;
  visibility: { roles: '*' | string[] };
  locking: FieldLocking;
  isSystem: boolean;
  options?: DynamicFieldOption[];
};

// ─── Complaints ───────────────────────────────────────────────────────────
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'rejected';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'critical';

export type Complaint = {
  id: string;
  referenceNo: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdBy: string | null;
  assignedDepartmentId: string | null;
  assignedTo: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComplaintDetail = Complaint & {
  values: Record<string, unknown>;
  locks: Record<string, { ownerUserId: string; lockedAt: string | null }>;
};

// ─── Attachments ──────────────────────────────────────────────────────────
export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
  sha256: string;
};

// ─── Audit / Assignment History ───────────────────────────────────────────
export type AuditEntry = {
  id: string;
  complaintId: string | null;
  fieldKey: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  occurredAt: string;
  note: string | null;
};

export type AssignmentHistoryEntry = {
  id: string;
  complaintId: string;
  oldAssignedTo: string | null;
  newAssignedTo: string | null;
  oldDepartmentId: string | null;
  newDepartmentId: string | null;
  changedBy: string;
  changedAt: string;
  note: string | null;
};

// ─── Users / Roles / Permissions / Departments ────────────────────────────
export type UserSummary = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  authProvider: 'local' | 'ldap';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

export type Department = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
