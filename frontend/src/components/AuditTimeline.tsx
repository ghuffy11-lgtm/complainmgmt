import type { AuditEntry, DynamicField } from '../types/api';

type Props = {
  entries: AuditEntry[];
  loading?: boolean;
  empty?: string;
  showComplaint?: boolean;
  /** Schema lookup (key → field) so field labels render instead of raw keys. */
  fieldsByKey?: Map<string, DynamicField>;
};

/**
 * Renders an audit feed as plain English. The server delivers the structural
 * row (action, fieldKey, old/new) plus a resolved `actorName`; this component
 * turns each row into a one-line sentence with a relative timestamp.
 *
 * The raw old/new payload stays inspectable behind a "Details" expander so
 * power-users (and the audit search page) can still see exactly what was
 * recorded — but it doesn't clutter the timeline by default.
 */
export function AuditTimeline({
  entries,
  loading,
  empty = 'No audit events.',
  showComplaint,
  fieldsByKey,
}: Props) {
  if (loading) return <p className="muted">Loading…</p>;
  if (entries.length === 0) return <p className="muted">{empty}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((e) => (
        <div
          key={e.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            gap: 12,
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
            alignItems: 'baseline',
          }}
        >
          <ActionDot action={e.action} />
          <div style={{ minWidth: 0 }}>
            <div style={{ wordWrap: 'break-word' }}>
              <strong>{describe(e, fieldsByKey)}</strong>
              {e.actorName && <span className="muted"> · by {e.actorName}</span>}
              {showComplaint && e.complaintId && (
                <span className="muted"> · complaint #{e.complaintId}</span>
              )}
            </div>
            {hasDetails(e) && <Details entry={e} />}
            {e.note && <div className="muted" style={{ fontSize: 12 }}>“{e.note}”</div>}
          </div>
          <div className="mono muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }} title={new Date(e.occurredAt).toLocaleString()}>
            {formatTime(e.occurredAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── action → sentence ─────────────────────────────────────────────────────

function describe(e: AuditEntry, fieldsByKey?: Map<string, DynamicField>): string {
  const label = (key: string | null): string => {
    if (!key) return '';
    if (key === '__status__') return 'status';
    if (key === '__priority__') return 'priority';
    if (key === '__assignment__') return 'assignment';
    if (key === '__attachment__') return 'attachment';
    if (key === '__settings__') return 'setting';
    return fieldsByKey?.get(key)?.label ?? key;
  };

  switch (e.action) {
    case 'create': {
      const ref = (e.newValue as { referenceNo?: string } | null)?.referenceNo;
      return ref ? `Created complaint ${ref}` : 'Created complaint';
    }
    case 'update': {
      if (e.fieldKey === '__status__') return `Changed status: ${fmt(e.oldValue)} → ${fmt(e.newValue)}`;
      if (e.fieldKey === '__priority__') return `Changed priority: ${fmt(e.oldValue)} → ${fmt(e.newValue)}`;
      return `Updated ${label(e.fieldKey)}`;
    }
    case 'lock_override':
      return `Override on locked field "${label(e.fieldKey)}"`;
    case 'reopen':
      return `Reopened: ${fmt(e.oldValue)} → ${fmt(e.newValue)}`;
    case 'assign': {
      const nv = e.newValue as { departmentId?: string | null; userId?: string | null } | null;
      if (!nv) return 'Reassigned';
      const parts: string[] = [];
      if (nv.departmentId) parts.push(`dept #${nv.departmentId}`);
      if (nv.userId) parts.push(`user #${nv.userId}`);
      return parts.length ? `Assigned to ${parts.join(', ')}` : 'Unassigned';
    }
    case 'attachment.added': {
      const filename = (e.newValue as { filename?: string } | null)?.filename;
      return filename ? `Attached file "${filename}"` : 'Attached file';
    }
    case 'attachment.removed': {
      const filename = (e.oldValue as { filename?: string } | null)?.filename;
      return filename ? `Removed attachment "${filename}"` : 'Removed attachment';
    }
    case 'password_reset_by_admin':
      return 'Reset password (admin)';
    case 'role_permissions_changed':
      return 'Changed role permissions';
    case 'settings_changed':
      return `Changed setting "${e.fieldKey}"`;
    default:
      return e.action;
  }
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/_/g, ' ');
}

function hasDetails(e: AuditEntry): boolean {
  if (e.fieldKey === '__status__' || e.fieldKey === '__priority__') return false;
  if (e.action === 'create') return false;
  if (e.action === 'attachment.added' || e.action === 'attachment.removed') return false;
  return e.oldValue != null || e.newValue != null;
}

function Details({ entry }: { entry: AuditEntry }) {
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>Details</summary>
      <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
        <div>old: {fmt(entry.oldValue)}</div>
        <div>new: {fmt(entry.newValue)}</div>
      </div>
    </details>
  );
}

function ActionDot({ action }: { action: string }) {
  const color =
    action === 'create' ? 'var(--success)' :
    action === 'lock_override' ? 'var(--danger)' :
    action === 'reopen' ? 'var(--danger)' :
    action.startsWith('attachment') ? 'var(--primary)' :
    action === 'assign' ? 'var(--warn)' :
    'var(--border-strong)';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        marginTop: 6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diffMs < min) return 'just now';
  if (diffMs < hr) return `${Math.floor(diffMs / min)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hr)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return d.toLocaleDateString();
}
