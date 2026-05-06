import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditFilter, AuditService } from '../../services/audit.service';
import { AuditTimeline } from '../../components/AuditTimeline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
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
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-text-main m-0">Audit search</h3>
        <p className="text-xs text-text-muted mt-0.5 m-0">
          Append-only journal of every state change. Filter to drill in.
        </p>
      </div>

      <div className="toolbar p-4 bg-surface-2/30 border-b border-border">
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
        <Select
          size="sm"
          className="w-[180px]"
          placeholder="Any action"
          value={filters.action ?? ''}
          onChange={(v) => setFilters((f) => ({ ...f, action: v || undefined, page: 1 }))}
          allowClear
          clearLabel="Any action"
          options={ACTIONS.filter((a) => a).map((a) => ({ value: a, label: a }))}
        />
        <span className="spacer" />
        <Button variant="ghost" onClick={() => setFilters({ page: 1, pageSize: 50 })}>Clear</Button>
      </div>

      <div className="p-6">
        <AuditTimeline
          entries={q.data?.data ?? []}
          loading={q.isLoading}
          showComplaint
          fieldsByKey={fieldsByKey}
        />

        {q.data && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
            <span className="text-xs text-text-muted">
              Page {q.data.meta.page} · {q.data.data.length} of {q.data.meta.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
              >Previous</Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) * (filters.pageSize ?? 50) >= q.data.meta.total}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >Next</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
