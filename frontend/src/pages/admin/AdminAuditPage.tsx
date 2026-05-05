import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditFilter, AuditService } from '../../services/audit.service';
import { AuditTimeline } from '../../components/AuditTimeline';
import { Button } from '../../components/ui/Button';
import { DynamicFieldsService } from '../../services/dynamic-fields.service';

const ACTIONS = [
  '', 'create', 'update', 'delete', 'assign', 'lock_override', 'reopen',
  'attachment.added', 'attachment.removed',
  'password_reset_by_admin', 'role_permissions_changed', 'settings_changed',
];

export function AdminAuditPage() {
  const [filters, setFilters] = useState<AuditFilter>({ page: 1, pageSize: 50 });

  const q = useQuery({ queryKey: ['audit', filters], queryFn: () => AuditService.search(filters) });
  // Use the public schema (any authenticated user) rather than the admin
  // schema, since audit:read doesn't imply admin.fields:manage. Deactivated
  // fields will simply render with their raw key in the timeline — fine.
  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const fieldsByKey = useMemo(
    () => new Map((fieldsQ.data ?? []).map((f) => [f.key, f])),
    [fieldsQ.data],
  );

  return (
    <section>
      <h2>Audit search</h2>

      <div className="toolbar">
        <input
          placeholder="Complaint id"
          value={filters.complaintId ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, complaintId: e.target.value || undefined, page: 1 }))}
          style={{ maxWidth: 160 }}
        />
        <input
          placeholder="Actor id"
          value={filters.actorId ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value || undefined, page: 1 }))}
          style={{ maxWidth: 140 }}
        />
        <input
          placeholder="Field key"
          value={filters.fieldKey ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, fieldKey: e.target.value || undefined, page: 1 }))}
          style={{ maxWidth: 200 }}
        />
        <select
          value={filters.action ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value || undefined, page: 1 }))}
        >
          {ACTIONS.map((a) => <option key={a} value={a}>{a || 'Any action'}</option>)}
        </select>
        <span className="spacer" />
        <Button variant="ghost" onClick={() => setFilters({ page: 1, pageSize: 50 })}>Clear</Button>
      </div>

      <AuditTimeline
        entries={q.data?.data ?? []}
        loading={q.isLoading}
        showComplaint
        fieldsByKey={fieldsByKey}
      />

      {q.data && (
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted">
            Page {q.data.meta.page} · {q.data.data.length} of {q.data.meta.total}
          </span>
          <span className="spacer" />
          <Button
            variant="secondary"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
          >Previous</Button>
          <Button
            variant="secondary"
            disabled={(filters.page ?? 1) * (filters.pageSize ?? 50) >= q.data.meta.total}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >Next</Button>
        </div>
      )}
    </section>
  );
}
