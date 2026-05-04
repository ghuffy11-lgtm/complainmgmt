import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ComplaintsService, ListParams } from '../services/complaints.service';
import { DepartmentsService } from '../services/departments.service';
import { Button } from '../components/ui/Button';
import { usePermissions } from '../hooks/usePermissions';
import type { ComplaintPriority, ComplaintStatus } from '../types/api';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintsListPage() {
  const [filters, setFilters] = useState<ListParams>({ page: 1, pageSize: 25 });
  const nav = useNavigate();
  const { has } = usePermissions();
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  const { data, isLoading, error } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => ComplaintsService.list(filters),
  });

  const apply = (patch: Partial<ListParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <section>
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Complaints</h1>
        <span className="spacer" />
        {has('complaint:create') && <Button onClick={() => nav('/complaints/new')}>New complaint</Button>}
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search reference no…"
          value={filters.q ?? ''}
          onChange={(e) => apply({ q: e.target.value || undefined })}
          style={{ maxWidth: 240 }}
        />
        <select
          value={filters.status ?? ''}
          onChange={(e) => apply({ status: (e.target.value || undefined) as ComplaintStatus | undefined })}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select
          value={filters.priority ?? ''}
          onChange={(e) => apply({ priority: (e.target.value || undefined) as ComplaintPriority | undefined })}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filters.departmentId ?? ''}
          onChange={(e) => apply({ departmentId: e.target.value || undefined })}
        >
          <option value="">Any department</option>
          {(departmentsQ.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="spacer" />
        {(filters.q || filters.status || filters.priority || filters.departmentId) && (
          <Button variant="ghost" onClick={() => setFilters({ page: 1, pageSize: 25 })}>Clear</Button>
        )}
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="danger">Failed to load complaints.</p>}
      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/complaints/${c.id}`}>{c.referenceNo}</Link></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><PriorityBadge priority={c.priority} /></td>
                  <td className="mono">{new Date(c.createdAt).toLocaleString()}</td>
                  <td className="mono">{new Date(c.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={5}><span className="muted">No complaints match these filters.</span></td></tr>
              )}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted">Page {data.meta.page} · {data.data.length} of {data.meta.total}</span>
            <span className="spacer" />
            <Button
              variant="secondary"
              disabled={data.meta.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >Previous</Button>
            <Button
              variant="secondary"
              disabled={data.meta.page * data.meta.pageSize >= data.meta.total}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >Next</Button>
          </div>
        </>
      )}
    </section>
  );
}

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const cls =
    status === 'open' ? 'badge-primary' :
    status === 'in_progress' ? 'badge-warn' :
    status === 'resolved' ? 'badge-success' :
    status === 'rejected' ? 'badge-danger' : '';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

export function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const cls =
    priority === 'critical' ? 'badge-danger' :
    priority === 'high' ? 'badge-warn' :
    priority === 'low' ? 'badge-success' : '';
  return <span className={`badge ${cls}`}>{priority}</span>;
}
