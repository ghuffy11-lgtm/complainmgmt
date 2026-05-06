import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { ComplaintsService, ListParams } from '../services/complaints.service';
import { DepartmentsService } from '../services/departments.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { usePermissions } from '../hooks/usePermissions';
import { cn } from '../lib/utils';
import type { ComplaintPriority, ComplaintStatus, DynamicField } from '../types/api';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

/**
 * Deferred filter shape — text/date/dynamic-field inputs that only fire on
 * Search/Enter. Discrete dropdowns (status/priority/departmentId) bypass
 * this and apply immediately.
 */
type DraftFilters = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  fv?: Record<string, string>;
};

export function ComplaintsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = React.useState<ListParams>(() => filtersFromQuery(searchParams));
  const [draft, setDraft] = React.useState<DraftFilters>(() => pickDraft(filtersFromQuery(searchParams)));
  // Tracks whether the user has touched the draft inputs since the last
  // commit/reset. Protects unsaved typing from being wiped when a dropdown
  // (status / priority / department) auto-commits and triggers a URL change.
  const draftDirtyRef = React.useRef(false);
  const nav = useNavigate();
  const { has } = usePermissions();
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  // Scope the department dropdown to the user's active memberships when they
  // only have own-dept read access. Users with full `complaint:read` (admin /
  // manager) keep the full dropdown so they can drill into any dept.
  const userDeptIds = React.useMemo(
    () => new Set((useAuthStore.getState().user?.departmentIds ?? []).map(String)),
    [],
  );
  const fullRead = has('complaint:read');
  const visibleDepartments = React.useMemo(() => {
    const all = departmentsQ.data ?? [];
    return fullRead ? all : all.filter((d) => userDeptIds.has(String(d.id)));
  }, [departmentsQ.data, fullRead, userDeptIds]);
  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const searchableFields = (fieldsQ.data ?? []).filter(
    (f) => f.isSearchable && f.isActive && (f.type === 'text' || f.type === 'number' || f.type === 'dropdown'),
  );

  // External URL changes (e.g. dashboard click-through to ?status=open) re-pick
  // the committed filters. Only resync the draft inputs when the user hasn't
  // typed anything yet — otherwise we'd erase in-progress text on every
  // dropdown change.
  React.useEffect(() => {
    const next = filtersFromQuery(searchParams);
    setFilters((prev) => ({ ...next, pageSize: prev.pageSize ?? 25 }));
    if (!draftDirtyRef.current) setDraft(pickDraft(next));
  }, [searchParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => ComplaintsService.list(filters),
  });

  /** Mark the draft as user-touched and apply an updater. */
  const editDraft = (updater: (s: DraftFilters) => DraftFilters) => {
    draftDirtyRef.current = true;
    setDraft(updater);
  };

  /** Commit a patch immediately — used by status / priority / department dropdowns. */
  const apply = (patch: Partial<ListParams>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    setSearchParams(queryFromFilters(next), { replace: true });
  };

  /** Commit the draft (q / dates / fv) — fired by Search button or Enter. */
  const commitDraft = () => {
    const next: ListParams = {
      ...filters,
      q: draft.q?.trim() || undefined,
      dateFrom: draft.dateFrom || undefined,
      dateTo: draft.dateTo || undefined,
      fv: draft.fv && Object.keys(draft.fv).length > 0 ? draft.fv : undefined,
      page: 1,
    };
    draftDirtyRef.current = false;
    setFilters(next);
    setSearchParams(queryFromFilters(next), { replace: true });
  };

  const updateDraftFv = (key: string, value: string) => {
    editDraft((s) => {
      const fv = { ...(s.fv ?? {}) };
      if (value && value.trim() !== '') fv[key] = value;
      else delete fv[key];
      return { ...s, fv: Object.keys(fv).length > 0 ? fv : undefined };
    });
  };

  const reset = () => {
    const empty: ListParams = { page: 1, pageSize: 25 };
    draftDirtyRef.current = false;
    setFilters(empty);
    setDraft({});
    setSearchParams({}, { replace: true });
  };

  const draftDirty = !sameDraft(draft, pickDraft(filters));
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
        {/* Toolbar
         * Discrete dropdowns (status / priority / department) commit on
         * change — they're cheap and the user wants the result instantly.
         * Text / date / dynamic-field inputs hold draft state and only
         * commit on Search (or Enter inside any of them). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitDraft();
          }}
          className="p-4 border-b border-border bg-surface-2/30 flex flex-wrap items-center gap-3"
        >
          <div className="relative flex-1 min-w-[220px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle w-4 h-4 pointer-events-none" />
            <input
              type="search"
              placeholder="Reference (press Enter)"
              value={draft.q ?? ''}
              onChange={(e) => editDraft((s) => ({ ...s, q: e.target.value }))}
              className="w-full bg-surface border border-border-strong rounded-md h-9 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
            />
          </div>

          <Select
            size="sm"
            className="w-[150px]"
            placeholder="Any status"
            value={filters.status ?? ''}
            onChange={(v) => apply({ status: (v || undefined) as ComplaintStatus | undefined })}
            allowClear
            clearLabel="Any status"
            options={STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
          />

          <Select
            size="sm"
            className="w-[140px]"
            placeholder="Any priority"
            value={filters.priority ?? ''}
            onChange={(v) => apply({ priority: (v || undefined) as ComplaintPriority | undefined })}
            allowClear
            clearLabel="Any priority"
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />

          <Select
            size="sm"
            className="w-[170px]"
            placeholder="Any department"
            value={filters.departmentId ?? ''}
            onChange={(v) => apply({ departmentId: v || undefined })}
            allowClear
            clearLabel="Any department"
            options={visibleDepartments.map((d) => ({ value: d.id, label: d.name }))}
          />

          <DateRangeInput
            label="From"
            value={draft.dateFrom ?? ''}
            onChange={(v) => editDraft((s) => ({ ...s, dateFrom: v }))}
          />
          <DateRangeInput
            label="To"
            value={draft.dateTo ?? ''}
            onChange={(v) => editDraft((s) => ({ ...s, dateTo: v }))}
          />

          {searchableFields.map((f) => (
            <SearchableFieldInput
              key={f.id}
              field={f}
              value={draft.fv?.[f.key] ?? ''}
              onChange={(v) => updateDraftFv(f.key, v)}
            />
          ))}

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="submit"
              size="sm"
              variant={draftDirty ? 'primary' : 'secondary'}
              icon={<Search size={14} />}
            >
              Search
            </Button>
            {hasAnyFilter && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Clear
              </Button>
            )}
          </div>
        </form>

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
      <DateInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-2 text-xs"
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
    const placeholder = `Any ${field.label.toLowerCase()}`;
    return (
      <Select
        size="sm"
        className="w-[170px]"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        allowClear
        clearLabel={placeholder}
        options={(field.options ?? [])
          .filter((o) => o.isActive)
          .map((o) => ({ value: o.id, label: o.label }))}
      />
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

/** Pull the deferred fields out of a committed `ListParams`. */
function pickDraft(f: ListParams): DraftFilters {
  return {
    q: f.q,
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    fv: f.fv,
  };
}

/** Compare two drafts ignoring undefined/empty differences — used to disable
 *  the Search button when the inputs already match what's been applied. */
function sameDraft(a: DraftFilters, b: DraftFilters): boolean {
  if ((a.q ?? '') !== (b.q ?? '')) return false;
  if ((a.dateFrom ?? '') !== (b.dateFrom ?? '')) return false;
  if ((a.dateTo ?? '') !== (b.dateTo ?? '')) return false;
  const ka = Object.keys(a.fv ?? {});
  const kb = Object.keys(b.fv ?? {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) if ((a.fv?.[k] ?? '') !== (b.fv?.[k] ?? '')) return false;
  return true;
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
