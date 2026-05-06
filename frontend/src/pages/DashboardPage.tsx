import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardService } from '../services/dashboard.service';
import { DepartmentsService } from '../services/departments.service';
import { usePermissions } from '../hooks/usePermissions';
import { useBranding } from '../hooks/useBranding';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { cn } from '../lib/utils';

const WINDOWS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

// Recharts can't read CSS variables directly — colours are baked in at
// render time. The primary is themeable (admin-picked); the rest stay
// fixed because they signal status (success/warn/danger) and shouldn't
// drift with the theme.
const SUCCESS = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const SLATE_500 = '#64748b';
const SLATE_300 = '#94a3b8';
const GRID = '#e2e8f0';

function buildStatusColors(primary: string): Record<string, string> {
  return {
    open: primary,
    in_progress: WARN,
    resolved: SUCCESS,
    closed: SLATE_500,
    rejected: DANGER,
  };
}

function buildPriorityColors(primary: string): Record<string, string> {
  return {
    low: SLATE_300,
    normal: primary,
    high: WARN,
    critical: DANGER,
  };
}

const AGING_COLORS = [SUCCESS, WARN, DANGER, '#7f1d1d'];

export function DashboardPage() {
  const { has, user } = usePermissions();
  const isFullView = has('dashboard:read');
  const isScopedOnly = !isFullView && has('dashboard.own:read');

  if (isScopedOnly) {
    const memberCount = user?.departmentIds?.length ?? 0;
    if (memberCount === 0) {
      return (
        <section className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight m-0">Dashboard</h1>
          <Card>
            <p className="muted m-0">
              You're not assigned to any department yet, so there's nothing to scope the
              dashboard to. Ask an admin to add you to one or more departments on Admin → Users.
            </p>
          </Card>
        </section>
      );
    }
    return <UserDashboard />;
  }

  return <ManagerDashboard />;
}

// ─── Full / manager dashboard ───────────────────────────────────────────

function ManagerDashboard() {
  const primary = useBranding().primaryColor;
  const STATUS_COLORS = buildStatusColors(primary);
  const PRIORITY_COLORS = buildPriorityColors(primary);

  // Department drilldown — null = all departments. Manager's full-picture
  // view is the default; picking one narrows every panel + KPI.
  const [departmentId, setDepartmentId] = React.useState<string | null>(null);
  const deptScope = departmentId ? { departmentId } : {};

  // Time window for trend + latency. `days` mode shows last N days from
  // today; `month` mode shows a single calendar month picked from the
  // last 12. Other panels (summary, status, priority, by-dept, aging)
  // are all-time — they answer "what's the picture right now".
  const [window, setWindow] = React.useState<TimeWindow>({ kind: 'days', days: 90 });
  const windowOpts: { days?: number; from?: string; to?: string } =
    window.kind === 'days' ? { days: window.days } : { from: window.from, to: window.to };
  const windowKey = window.kind === 'days' ? `d:${window.days}` : `m:${window.month}`;
  const windowLabel = window.kind === 'days' ? `last ${window.days} days` : monthLabel(window.month);

  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary', departmentId],
    queryFn: () => DashboardService.summary(deptScope),
  });
  const statusQ = useQuery({
    queryKey: ['dashboard', 'by-status', departmentId],
    queryFn: () => DashboardService.byStatus(deptScope),
  });
  const priorityQ = useQuery({
    queryKey: ['dashboard', 'by-priority', departmentId],
    queryFn: () => DashboardService.byPriority(deptScope),
  });
  const deptQ = useQuery({
    // when manager has narrowed to a single dept, the by-department panel
    // collapses to one row — still useful to confirm the scope.
    queryKey: ['dashboard', 'by-department', departmentId],
    queryFn: () => DashboardService.byDepartment(deptScope),
  });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const agingQ = useQuery({
    queryKey: ['dashboard', 'aging', departmentId],
    queryFn: () => DashboardService.aging(deptScope),
  });

  const trendQ = useQuery({
    queryKey: ['dashboard', 'by-date', windowKey, departmentId],
    queryFn: () => DashboardService.byDate({ ...windowOpts, ...deptScope }),
  });
  const latencyQ = useQuery({
    queryKey: ['dashboard', 'resolution-latency', windowKey, departmentId],
    queryFn: () => DashboardService.resolutionLatency({ ...windowOpts, ...deptScope }),
  });

  const deptName = (id: string | null): string =>
    !id ? 'Unassigned' : (departmentsQ.data?.find((d) => d.id === id)?.name ?? `#${id}`);

  const trendSeries = useTrendSeries(trendQ.data?.data, window);
  const trendTotal = trendSeries.reduce((s, p) => s + p.count, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            {departmentId
              ? `Showing ${deptName(departmentId)} only`
              : 'System-wide overview across all departments'}
          </p>
        </div>
        <DepartmentScopePicker
          departments={departmentsQ.data ?? []}
          value={departmentId}
          onChange={setDepartmentId}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiLink to={complaintsLink({ departmentId })} label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <KpiLink to={complaintsLink({ departmentId, status: 'open' })} label="Currently open" value={summaryQ.data?.open ?? '—'} emphasis="primary" />
        <KpiLink to={complaintsLink({ departmentId, priority: 'critical' })} label="High / critical" value={summaryQ.data?.highPriority ?? '—'} emphasis="warn" />
        <Kpi
          label={`Avg time to close (${windowLabel})`}
          value={latencyQ.data?.avgHours == null ? '—' : formatHours(latencyQ.data.avgHours)}
          sub={latencyQ.data?.count ? `over ${latencyQ.data.count} resolutions` : undefined}
        />
      </div>

      {/* Trend */}
      <Card
        title="Complaint volume"
        subtitle="by complaint date · zero-filled"
        headerAction={<WindowPicker window={window} onChange={setWindow} />}
      >
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData label={windowLabel} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} primary={primary} />}
        <div className="text-right text-xs text-text-muted mt-2">
          {trendTotal} complaints · {windowLabel}
        </div>
      </Card>

      {/* Status pie + Priority bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PiePanel
          title="By status"
          data={(statusQ.data ?? []).map((r) => ({
            name: r.status.replace('_', ' '),
            value: r.count,
            color: STATUS_COLORS[r.status] ?? SLATE_500,
            link: complaintsLink({ departmentId, status: r.status }),
          }))}
          loading={statusQ.isLoading}
        />
        <BarPanel
          title="By priority"
          data={(priorityQ.data ?? []).map((r) => ({
            key: r.priority,
            count: r.count,
            color: PRIORITY_COLORS[r.priority] ?? SLATE_500,
            link: complaintsLink({ departmentId, priority: r.priority }),
          }))}
          loading={priorityQ.isLoading}
          primary={primary}
        />
      </div>

      {/* Department + Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarPanel
          title="By department"
          data={(deptQ.data ?? []).map((r) => ({
            key: deptName(r.departmentId),
            count: r.count,
            link: r.departmentId ? `/complaints?departmentId=${r.departmentId}` : '/complaints',
          }))}
          loading={deptQ.isLoading}
          horizontal
          primary={primary}
        />
        <BarPanel
          title="Open complaint aging"
          subtitle="status ∈ {open, in_progress}"
          data={(agingQ.data ?? []).map((r, i) => ({ key: r.bucket, count: r.count, color: AGING_COLORS[i] }))}
          loading={agingQ.isLoading}
          primary={primary}
        />
      </div>

      {/* Resolution latency */}
      <Card title="Resolution latency" subtitle={`created → resolved/closed · ${windowLabel}`}>
        {latencyQ.isLoading && <p className="muted">Loading…</p>}
        {!latencyQ.isLoading && (latencyQ.data?.count ?? 0) === 0 && (
          <p className="muted">No complaints have been resolved or closed in {windowLabel}.</p>
        )}
        {!latencyQ.isLoading && latencyQ.data && latencyQ.data.count > 0 && <LatencyDetail data={latencyQ.data} primary={primary} />}
      </Card>
    </section>
  );
}

// ─── Time-window state ───────────────────────────────────────────────────

type TimeWindow =
  | { kind: 'days'; days: number }
  | { kind: 'month'; month: string; from: string; to: string };

function buildMonthWindow(month: string): { kind: 'month'; month: string; from: string; to: string } {
  // month is YYYY-MM. Compute first / last day.
  const [y, m] = month.split('-').map((s) => parseInt(s, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // last day of (y, m)
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    kind: 'month',
    month,
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay)}`,
  };
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map((s) => parseInt(s, 10));
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return monthName;
}

/** Build a "?departmentId=...&status=...&priority=..." complaints-list link. */
function complaintsLink(opts: {
  departmentId?: string | null;
  status?: string;
  priority?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts.departmentId) sp.set('departmentId', String(opts.departmentId));
  if (opts.status) sp.set('status', opts.status);
  if (opts.priority) sp.set('priority', opts.priority);
  const qs = sp.toString();
  return qs ? `/complaints?${qs}` : '/complaints';
}

// ─── Scoped / user dashboard ────────────────────────────────────────────

function UserDashboard() {
  const { user } = usePermissions();
  const primary = useBranding().primaryColor;
  const STATUS_COLORS = buildStatusColors(primary);
  const PRIORITY_COLORS = buildPriorityColors(primary);
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const myDeptIds = user?.departmentIds ?? [];
  const myDeptNames = myDeptIds
    .map((id) => departmentsQ.data?.find((d) => d.id === id)?.name)
    .filter((n): n is string => !!n);
  const myDeptLabel =
    myDeptNames.length === 0 ? 'your departments'
    : myDeptNames.length === 1 ? myDeptNames[0]
    : `${myDeptNames.length} departments`;

  const summaryQ = useQuery({ queryKey: ['dashboard', 'summary', 'mine'], queryFn: () => DashboardService.summary() });
  const statusQ = useQuery({ queryKey: ['dashboard', 'by-status', 'mine'], queryFn: () => DashboardService.byStatus() });
  const priorityQ = useQuery({ queryKey: ['dashboard', 'by-priority', 'mine'], queryFn: () => DashboardService.byPriority() });
  const agingQ = useQuery({ queryKey: ['dashboard', 'aging', 'mine'], queryFn: () => DashboardService.aging() });

  // Same TimeWindow shape as the manager dashboard so the picker's
  // "Specific month…" entry actually does something. UserDashboard
  // previously held a days-only state and silently dropped month picks.
  const [window, setWindow] = React.useState<TimeWindow>({ kind: 'days', days: 30 });
  const windowOpts: { days?: number; from?: string; to?: string } =
    window.kind === 'days' ? { days: window.days } : { from: window.from, to: window.to };
  const windowKey = window.kind === 'days' ? `d:${window.days}` : `m:${window.month}`;
  const windowLabel = window.kind === 'days' ? `the last ${window.days} days` : monthLabel(window.month);

  const trendQ = useQuery({
    queryKey: ['dashboard', 'by-date', 'mine', windowKey],
    queryFn: () => DashboardService.byDate(windowOpts),
  });
  const trendSeries = useTrendSeries(trendQ.data?.data, window);
  const trendTotal = trendSeries.reduce((s, p) => s + p.count, 0);

  // Click-throughs land on the complaints list which already scopes to the
  // user's departments via complaint.own:read — no extra ?departmentId
  // needed (and supplying just one would be wrong for multi-dept users).
  const linkBase = '/complaints';

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Dashboard</h1>
          <Badge variant="primary">{myDeptLabel}</Badge>
        </div>
        <p className="text-sm text-text-muted mt-1">Showing complaints assigned to your department.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiLink to={linkBase} label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <KpiLink to={`${linkBase}?status=open`} label="Currently open" value={summaryQ.data?.open ?? '—'} emphasis="primary" />
        <KpiLink to={`${linkBase}?priority=critical`} label="High / critical" value={summaryQ.data?.highPriority ?? '—'} emphasis="warn" />
      </div>

      <Card
        title="Volume in your department"
        headerAction={<WindowPicker window={window} onChange={setWindow} />}
      >
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData label={windowLabel} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} primary={primary} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PiePanel
          title="By status"
          data={(statusQ.data ?? []).map((r) => ({
            name: r.status.replace('_', ' '),
            value: r.count,
            color: STATUS_COLORS[r.status] ?? SLATE_500,
            link: `${linkBase}?status=${encodeURIComponent(r.status)}`,
          }))}
          loading={statusQ.isLoading}
        />
        <BarPanel
          title="By priority"
          data={(priorityQ.data ?? []).map((r) => ({
            key: r.priority,
            count: r.count,
            color: PRIORITY_COLORS[r.priority] ?? SLATE_500,
            link: `${linkBase}?priority=${encodeURIComponent(r.priority)}`,
          }))}
          loading={priorityQ.isLoading}
          primary={primary}
        />
      </div>

      <Card title="Open complaint aging">
        {agingQ.isLoading && <p className="muted">Loading…</p>}
        {agingQ.data && (
          <BarPanel
            title=""
            data={agingQ.data.map((r, i) => ({ key: r.bucket, count: r.count, color: AGING_COLORS[i] }))}
            loading={false}
            primary={primary}
          />
        )}
      </Card>
    </section>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────

/** Zero-fill the trend series so missing days show as 0 on the chart. */
function useTrendSeries(
  raw: { date: string; count: number }[] | undefined,
  window: TimeWindow,
) {
  return React.useMemo(() => {
    const counts = new Map((raw ?? []).map((p) => [p.date, p.count]));
    const out: { date: string; count: number }[] = [];
    if (window.kind === 'days') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      for (let i = window.days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        out.push({ date: iso, count: counts.get(iso) ?? 0 });
      }
    } else {
      // Iterate through the picked month's calendar days.
      const start = new Date(window.from + 'T00:00:00Z');
      const end = new Date(window.to + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        out.push({ date: iso, count: counts.get(iso) ?? 0 });
      }
    }
    return out;
  }, [raw, window]);
}

// Backwards compat — UserDashboard still uses the simpler days-only path.
function useZeroFilledTrend(raw: { date: string; count: number }[] | undefined, days: number) {
  return useTrendSeries(raw, { kind: 'days', days });
}

function Kpi({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: number | string;
  sub?: string;
  emphasis?: 'primary' | 'warn';
}) {
  const accent =
    emphasis === 'primary' ? 'text-primary' :
    emphasis === 'warn' ? 'text-warn' : 'text-text-main';
  const accentBorder =
    emphasis === 'primary' ? 'border-l-4 border-l-primary' :
    emphasis === 'warn' ? 'border-l-4 border-l-warn' : '';
  return (
    <div className={cn('p-5 bg-surface border border-border rounded-[10px] shadow-sm', accentBorder)}>
      <p className={cn('text-xs font-semibold uppercase tracking-wider mb-1', emphasis ? accent : 'text-text-muted')}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-3xl font-bold tabular-nums tracking-tight', accent)}>{value}</span>
        {sub && <span className="text-xs text-text-muted font-normal">{sub}</span>}
      </div>
    </div>
  );
}

function KpiLink({
  to,
  label,
  value,
  sub,
  emphasis,
}: {
  to: string;
  label: string;
  value: number | string;
  sub?: string;
  emphasis?: 'primary' | 'warn';
}) {
  return (
    <Link
      to={to}
      className="block transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[10px]"
      title={`Open ${label.toLowerCase()} list`}
    >
      <Kpi label={label} value={value} sub={sub} emphasis={emphasis} />
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 px-3 py-2 rounded-md">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/** Time-window picker on the trend / latency cards. Presets for last
 *  N days + a "Specific month…" dropdown listing the last 12 months. */
function WindowPicker({
  window,
  onChange,
}: {
  window: TimeWindow;
  onChange: (w: TimeWindow) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-surface-2/50 p-0.5 rounded-md border border-border">
        {WINDOWS.map((w) => {
          const isActive = window.kind === 'days' && window.days === w.days;
          return (
            <button
              key={w.days}
              onClick={() => onChange({ kind: 'days', days: w.days })}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-[5px] transition-all',
                isActive
                  ? 'bg-surface text-text-main shadow-sm ring-1 ring-border'
                  : 'text-text-muted hover:text-text-main',
              )}
            >
              {w.label}
            </button>
          );
        })}
      </div>
      <Select
        size="sm"
        className="w-[180px]"
        placeholder="Specific month…"
        value={window.kind === 'month' ? window.month : ''}
        onChange={(v) => {
          if (!v) return;
          onChange(buildMonthWindow(v));
        }}
        options={lastNMonths(12).map((m) => ({ value: m, label: monthLabel(m) }))}
      />
    </div>
  );
}

/** Generate YYYY-MM strings for the last N months ending with the current month. */
function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function NoTrendData({ label }: { label: string }) {
  return (
    <p className="text-text-muted text-sm">
      No complaints with a complaint date in {label}. Set a complaint date when
      creating new ones to populate this chart.
    </p>
  );
}

/** Department drilldown picker for the manager dashboard. Hidden when
 *  there are no departments to choose from. */
function DepartmentScopePicker({
  departments,
  value,
  onChange,
}: {
  departments: { id: string; name: string; isActive: boolean }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = departments.filter((d) => d.isActive);
  if (active.length === 0) return null;
  return (
    <Select
      className="w-[200px]"
      placeholder="All departments"
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      allowClear
      clearLabel="All departments"
      options={active.map((d) => ({ value: d.id, label: d.name }))}
    />
  );
}

function TrendChart({ data, primary }: { data: { date: string; count: number }[]; primary: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity={0.18} />
            <stop offset="100%" stopColor={primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: SLATE_500 }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke={primary} fill="url(#trendFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LatencyDetail({
  data,
  primary,
}: {
  data: NonNullable<Awaited<ReturnType<typeof DashboardService.resolutionLatency>>>;
  primary: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat label="Resolutions" value={String(data.count)} />
        <Stat label="Average" value={formatHours(data.avgHours ?? 0)} />
        <Stat label="Median" value={formatHours(data.medianHours ?? 0)} />
        <Stat label="P95" value={formatHours(data.p95Hours ?? 0)} />
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data.perWeek} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="count" dataKey="count" name="Resolutions" fill={primary} />
          <Bar yAxisId="hours" dataKey="avgHours" name="Avg hours" fill={WARN} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function PiePanel({
  title,
  data,
  loading,
}: {
  title: string;
  data: { name: string; value: number; color: string; link?: string }[];
  loading: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card title={title}>
      {loading && <p className="muted">Loading…</p>}
      {!loading && total === 0 && <p className="muted">No data yet.</p>}
      {!loading && total > 0 && (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="list-none p-0 m-0 flex flex-col gap-1 mt-2">
            {data.map((d) => (
              <li key={d.name}>
                {d.link ? (
                  <Link to={d.link} className="flex items-center gap-2 px-2 py-1 rounded-sm text-sm text-text-main hover:bg-surface-hover transition-colors">
                    <Dot color={d.color} />
                    <span className="flex-1">{d.name}</span>
                    <span className="font-mono text-xs text-text-muted">{d.value}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1 text-sm">
                    <Dot color={d.color} />
                    <span className="flex-1">{d.name}</span>
                    <span className="font-mono text-xs text-text-muted">{d.value}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function BarPanel({
  title,
  subtitle,
  data,
  loading,
  horizontal,
  primary,
}: {
  title: string;
  subtitle?: string;
  data: { key: string; count: number; color?: string; link?: string }[];
  loading: boolean;
  horizontal?: boolean;
  primary: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card title={title || undefined} subtitle={subtitle}>
      {loading && <p className="muted">Loading…</p>}
      {!loading && total === 0 && <p className="muted">No data yet.</p>}
      {!loading && total > 0 && (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={data}
              layout={horizontal ? 'vertical' : 'horizontal'}
              margin={{ top: 8, right: 8, left: horizontal ? 0 : -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              {horizontal ? (
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
              ) : (
                <XAxis dataKey="key" tick={{ fontSize: 11, fill: SLATE_500 }} interval={0} axisLine={false} tickLine={false} />
              )}
              {horizontal ? (
                <YAxis type="category" dataKey="key" width={120} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
              ) : (
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
              )}
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={primary} radius={[3, 3, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.color ?? primary} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {data.some((d) => d.link) && (
            <ul className="list-none p-0 m-0 flex flex-col gap-1 mt-2">
              {data.map((d) => (
                <li key={d.key}>
                  {d.link ? (
                    <Link to={d.link} className="flex items-center gap-2 px-2 py-1 rounded-sm text-sm text-text-main hover:bg-surface-hover transition-colors">
                      <Dot color={d.color ?? primary} />
                      <span className="flex-1">{d.key}</span>
                      <span className="font-mono text-xs text-text-muted">{d.count}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1 text-sm">
                      <Dot color={d.color ?? primary} />
                      <span className="flex-1">{d.key}</span>
                      <span className="font-mono text-xs text-text-muted">{d.count}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color }}
    />
  );
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--border)',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  fontSize: 12,
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
