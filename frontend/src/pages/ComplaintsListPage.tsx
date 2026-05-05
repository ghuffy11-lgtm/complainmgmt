import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { ComplaintsService, ListParams } from '../services/complaints.service';
import { DepartmentsService } from '../services/departments.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { usePermissions } from '../hooks/usePermissions';
import { cn } from '../lib/utils';
import type { ComplaintPriority, ComplaintStatus, DynamicField } from '../types/api';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = React.useState<ListParams>(() => filtersFromQuery(searchParams));
  const nav = useNavigate();
  const { has } = usePermissions();
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const searchableFields = (fieldsQ.data ?? []).filter(
    (f) => f.isSearchable && f.isActive && (f.type === 'text' || f.type === 'number' || f.type === 'dropdown'),
  );

  React.useEffect(() => {
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
  const applyFv = (key: string, value: string | undefined) => {
    const fv = { ...(filters.fv ?? {}) };
    if (value && value.trim() !== '') fv[key] = value;
    else delete fv[key];
    apply({ fv: Object.keys(fv).length > 0 ? fv : undefined });
  };
  const reset = () => {
    setFilters({ page: 1, pageSize: 25 });
    setSearchParams({}, { replace: true });
  };
  const hasFvFilter = filters.fv && Object.keys(filters.fv).length > 0;
  const hasAnyFilter =
    !!(filters.q || filters.status || filters.priority || filters.departmentId || filters.dateFrom || filters.dateTo || hasFvFilter);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize)) : 1;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Complaints</h1>
          <p className="text-sm text-text-muted mt-1">Manage and track patient feedback</p>
        </div>
        {has('complaint:create') && (
          <Button icon={<Plus size={16} />} onClick={() => nav('/complaints/new')}>
            New complaint
          </Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-surface-2/30 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle w-4 h-4 pointer-events-none" />
            <input
              type="search"
              placeholder="Search reference…"
              value={filters.q ?? ''}
              onChange={(e) => apply({ q: e.target.value || undefined })}
              className="w-full bg-surface border border-border-strong rounded-md h-9 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
            />
          </div>

          <select
            value={filters.status ?? ''}
            onChange={(e) => apply({ status: (e.target.value || undefined) as ComplaintStatus | undefined })}
            className="h-9 text-xs bg-surface border border-border-strong rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          <select
            value={filters.priority ?? ''}
            onChange={(e) => apply({ priority: (e.target.value || undefined) as ComplaintPriority | undefined })}
            className="h-9 text-xs bg-surface border border-border-strong rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filters.departmentId ?? ''}
            onChange={(e) => apply({ departmentId: e.target.value || undefined })}
            className="h-9 text-xs bg-surface border border-border-strong rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Any department</option>
            {(departmentsQ.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <DateRangeInput
            label="From"
            value={filters.dateFrom ?? ''}
            onChange={(v) => apply({ dateFrom: v || undefined })}
          />
          <DateRangeInput
            label="To"
            value={filters.dateTo ?? ''}
            onChange={(v) => apply({ dateTo: v || undefined })}
          />

          {searchableFields.map((f) => (
            <SearchableFieldInput
              key={f.id}
              field={f}
              value={filters.fv?.[f.key] ?? ''}
              onChange={(v) => applyFv(f.key, v)}
            />
          ))}

          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-2/50 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 border-b border-border">Reference</th>
                <th className="text-left px-5 py-3 border-b border-border">Status</th>
                <th className="text-left px-5 py-3 border-b border-border">Priority</th>
                <th className="text-left px-5 py-3 border-b border-border">Complaint date</th>
                <th className="text-left px-5 py-3 border-b border-border">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-5 py-3"><Skeleton height={16} /></td>
                </tr>
              ))}

              {!isLoading && error && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-danger">Failed to load complaints.</td></tr>
              )}

              {!isLoading && data && data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-text-muted">
                    No complaints match these filters.
                  </td>
                </tr>
              )}

              {!isLoading && data && data.data.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-surface-hover/60 transition-colors group cursor-pointer"
                  onClick={() => nav(`/complaints/${c.id}`)}
                >
                  <td className="px-5 py-4 text-[13px] font-medium">
                    <Link
                      to={`/complaints/${c.id}`}
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.referenceNo}
                    </Link>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-4"><PriorityBadge priority={c.priority} /></td>
                  <td className="px-5 py-4 text-[13px] text-text-muted font-mono">
                    {c.complaintDate
                      ? c.complaintDate
                      : <span title={`Submitted ${new Date(c.createdAt).toLocaleString()}`}>—</span>}
                  </td>
                  <td className="px-5 py-4 text-[13px] text-text-muted font-mono">
                    {new Date(c.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.total > 0 && (
          <div className="p-4 border-t border-border flex items-center justify-between bg-surface-2/10">
            <span className="text-xs text-text-muted">
              Showing {(data.meta.page - 1) * data.meta.pageSize + 1} – {Math.min(data.meta.page * data.meta.pageSize, data.meta.total)} of {data.meta.total} entries
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="px-2 h-8"
                disabled={data.meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-xs text-text-muted px-2">
                Page <span className="font-semibold text-text-main">{data.meta.page}</span> of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="px-2 h-8"
                disabled={data.meta.page >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function DateRangeInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 bg-surface border border-border-strong rounded-md px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const cls =
    status === 'open' ? 'badge-primary' :
    status === 'in_progress' ? 'badge-warn' :
    status === 'resolved' ? 'badge-success' :
    status === 'rejected' ? 'badge-danger' : '';
  return <span className={cn('badge', cls)}>{status.replace('_', ' ')}</span>;
}

export function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const cls =
    priority === 'critical' ? 'badge-danger' :
    priority === 'high' ? 'badge-warn' :
    priority === 'low' ? 'badge-success' : '';
  return <span className={cn('badge', cls)}>{priority}</span>;
}

function SearchableFieldInput({
  field, value, onChange,
}: { field: DynamicField; value: string; onChange: (v: string) => void }) {
  if (field.type === 'dropdown') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-xs bg-surface border border-border-strong rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">{`Any ${field.label.toLowerCase()}`}</option>
        {(field.options ?? [])
          .filter((o) => o.isActive)
          .map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type="search"
      inputMode={field.type === 'number' ? 'numeric' : undefined}
      placeholder={field.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-[180px] bg-surface border border-border-strong rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

// ─── url ↔ filters serialisation ────────────────────────────────────────
// The list reflects its filter state in the URL so dashboard click-throughs
// land on a pre-filtered view (and the filtered URL is shareable / refreshable).
// Dynamic-field filters use bracketed keys: `?fv[mobile_number]=555`.

function filtersFromQuery(sp: URLSearchParams): ListParams {
  const get = (k: string) => sp.get(k) || undefined;
  const status = get('status') as ComplaintStatus | undefined;
  const priority = get('priority') as ComplaintPriority | undefined;
  const fv: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    const m = /^fv\[([^\]]+)\]$/.exec(k);
    if (m && v && v.trim() !== '') fv[m[1]] = v;
  }
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
    fv: Object.keys(fv).length > 0 ? fv : undefined,
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
  if (f.fv) {
    for (const [k, v] of Object.entries(f.fv)) {
      if (v && v.trim() !== '') out[`fv[${k}]`] = v;
    }
  }
  return out;
}
