import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ComplaintsService, ListParams } from '../services/complaints.service';
import { DepartmentsService } from '../services/departments.service';
import { Button } from '../components/ui/Button';
import { IconPlus, IconSearch } from '../components/ui/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { usePermissions } from '../hooks/usePermissions';
import type { ComplaintPriority, ComplaintStatus } from '../types/api';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<ListParams>(() => filtersFromQuery(searchParams));
  const nav = useNavigate();
  const { has } = usePermissions();
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  // Re-pick filters whenever the URL changes (e.g. dashboard click-through
  // navigates here with `?status=open`).
  useEffect(() => {
    setFilters((prev) => ({ ...filtersFromQuery(searchParams), pageSize: prev.pageSize ?? 25 }));
  }, [searchParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => ComplaintsService.list(filters),
  });

  const apply = (patch: Partial<ListParams>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    setSearchParams(queryFromFilters(next), { replace: true });
  };
  const reset = () => {
    setFilters({ page: 1, pageSize: 25 });
    setSearchParams({}, { replace: true });
  };

  return (
    <section>
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Complaints</h1>
        <span className="spacer" />
        {has('complaint:create') && (
          <Button icon={<IconPlus size={14} />} onClick={() => nav('/complaints/new')}>
            New complaint
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div style={{ position: 'relative', maxWidth: 240, flex: '0 0 auto' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-subtle)', display: 'flex', pointerEvents: 'none',
            }}
          >
            <IconSearch size={14} />
          </span>
          <input
            type="search"
            placeholder="Search reference…"
            value={filters.q ?? ''}
            onChange={(e) => apply({ q: e.target.value || undefined })}
            style={{ paddingLeft: 32 }}
          />
        </div>
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
        <label className="row" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>Date from</span>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => apply({ dateFrom: e.target.value || undefined })}
            style={{ maxWidth: 150 }}
          />
        </label>
        <label className="row" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>to</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => apply({ dateTo: e.target.value || undefined })}
            style={{ maxWidth: 150 }}
          />
        </label>
        <span className="spacer" />
        {(filters.q || filters.status || filters.priority || filters.departmentId || filters.dateFrom || filters.dateTo) && (
          <Button variant="ghost" onClick={reset}>Clear</Button>
        )}
      </div>

      {isLoading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={20} />
          ))}
        </div>
      )}
      {error && <p className="danger">Failed to load complaints.</p>}
      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Complaint date</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/complaints/${c.id}`}>{c.referenceNo}</Link></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><PriorityBadge priority={c.priority} /></td>
                  <td className="mono">
                    {c.complaintDate
                      ? c.complaintDate
                      : <span className="muted" title={`Submitted ${new Date(c.createdAt).toLocaleString()}`}>—</span>}
                  </td>
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

// ─── url ↔ filters serialisation ────────────────────────────────────────
// The list reflects its filter state in the URL so dashboard click-throughs
// land on a pre-filtered view (and the filtered URL is shareable / refreshable).

function filtersFromQuery(sp: URLSearchParams): ListParams {
  const get = (k: string) => sp.get(k) || undefined;
  const status = get('status') as ComplaintStatus | undefined;
  const priority = get('priority') as ComplaintPriority | undefined;
  return {
    page: Number(sp.get('page')) || 1,
    pageSize: Number(sp.get('pageSize')) || 25,
    status: STATUSES.includes(status as ComplaintStatus) ? status : undefined,
    priority: PRIORITIES.includes(priority as ComplaintPriority) ? priority : undefined,
    departmentId: get('departmentId'),
    assignedTo: get('assignedTo'),
    q: get('q'),
    dateFrom: get('dateFrom'),
    dateTo: get('dateTo'),
  };
}

function queryFromFilters(f: ListParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status) out.status = f.status;
  if (f.priority) out.priority = f.priority;
  if (f.departmentId) out.departmentId = f.departmentId;
  if (f.assignedTo) out.assignedTo = f.assignedTo;
  if (f.q) out.q = f.q;
  if (f.dateFrom) out.dateFrom = f.dateFrom;
  if (f.dateTo) out.dateTo = f.dateTo;
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}
