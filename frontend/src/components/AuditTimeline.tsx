import type { AuditEntry } from '../types/api';

type Props = {
  entries: AuditEntry[];
  loading?: boolean;
  empty?: string;
  showComplaint?: boolean;       // include complaintId column (admin search)
};

export function AuditTimeline({ entries, loading, empty = 'No audit events.', showComplaint }: Props) {
  if (loading) return <p className="muted">Loading…</p>;
  if (entries.length === 0) return <p className="muted">{empty}</p>;

  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 160 }}>When</th>
          <th>Action</th>
          <th>Field</th>
          <th>Old → New</th>
          <th>Actor</th>
          {showComplaint && <th>Complaint</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td className="mono muted">{new Date(e.occurredAt).toLocaleString()}</td>
            <td><ActionBadge action={e.action} /></td>
            <td className="mono">{e.fieldKey ?? '—'}</td>
            <td>
              <DiffCell old={e.oldValue} next={e.newValue} />
            </td>
            <td className="mono muted">{e.actorId ?? '—'}</td>
            {showComplaint && <td className="mono">{e.complaintId ?? '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActionBadge({ action }: { action: string }) {
  const cls =
    action === 'lock_override' ? 'badge-danger' :
    action === 'create' ? 'badge-success' :
    action.startsWith('attachment') ? 'badge-primary' :
    action === 'assign' ? 'badge-warn' : '';
  return <span className={`badge ${cls}`}>{action}</span>;
}

function DiffCell({ old, next }: { old: unknown; next: unknown }) {
  const fmt = (v: unknown) => {
    if (v == null) return <span className="muted">∅</span>;
    if (typeof v === 'object') return <span className="mono">{JSON.stringify(v)}</span>;
    return <span>{String(v)}</span>;
  };
  return (
    <span>
      {fmt(old)} <span className="muted">→</span> {fmt(next)}
    </span>
  );
}
