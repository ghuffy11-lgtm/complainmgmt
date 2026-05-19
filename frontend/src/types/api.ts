export type Me = {
  id: number;
  username: string;
  displayName: string;
  /** Primary / "home" department; null when not assigned. Defaults form pickers. */
  departmentId: string | null;
  /** Every active department the user belongs to. Used by `*.own:read` scoping. */
  departmentIds: string[];
  roleKeys: string[];
  permissions: string[];
  /** True when the user has TOTP enrolled. Drives the Profile UI. */
  twoFactorEnrolled?: boolean;
};

/** Backend may return either a session OR a 2FA challenge. The login
 *  page decides which screen to show by inspecting the discriminator. */
export type LoginResponse =
  | LoginSessionResponse
  | { twoFactorRequired: true; challengeToken: string };

export type LoginSessionResponse = {
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
  /** When true, this field appears as a filter input on the complaints list. */
  isSearchable: boolean;
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
  /** Operator-supplied event date (YYYY-MM-DD), null until first set. */
  complaintDate: string | null;
  /** Per-department refinement, null when dept has no active subcats or
   *  this is a legacy row. */
  subcategoryId: string | null;
  /** Channel the complaint arrived through. Null only on legacy rows;
   *  required for all new complaints. */
  originId: string | null;
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
  /** Server-resolved, e.g. "Administrator (admin)". null when actor is unknown. */
  actorName: string | null;
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
  // Server-resolved display strings; null when the underlying id is null.
  oldAssignedToName: string | null;
  newAssignedToName: string | null;
  oldDepartmentName: string | null;
  newDepartmentName: string | null;
  changedByName: string | null;
};

// ─── Users / Roles / Permissions / Departments ────────────────────────────
export type UserSummary = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  authProvider: 'local' | 'ldap';
  /** Primary department — defaults form pickers. */
  departmentId: string | null;
  /** All active department memberships. */
  departmentIds: string[];
  /** Role IDs the user currently holds. Drives pre-checking of the
   *  Role picker on the user edit modal. */
  roleIds: string[];
  lastLoginAt: string | null;
  /** Lockout state — null when not locked. */
  lockedUntil: string | null;
  /** Running counter of consecutive password failures since last success. */
  failedLoginCount: number;
  /** True when the user has TOTP enrolled. Drives the Reset 2FA action. */
  twoFactorEnrolled: boolean;
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

export type Subcategory = {
  id: string;
  departmentId: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Origin = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
