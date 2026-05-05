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
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/utils';

const WINDOWS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

// Recharts can't read CSS variables directly — colours are baked in at
// render time. Keep these in sync with styles.css :root if the palette shifts.
const PRIMARY = '#2563eb';
const SUCCESS = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const SLATE_500 = '#64748b';
const SLATE_300 = '#94a3b8';
const GRID = '#e2e8f0';

const STATUS_COLORS: Record<string, string> = {
  open: PRIMARY,
  in_progress: WARN,
  resolved: SUCCESS,
  closed: SLATE_500,
  rejected: DANGER,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: SLATE_300,
  normal: PRIMARY,
  high: WARN,
  critical: DANGER,
};

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
  const summaryQ = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => DashboardService.summary() });
  const statusQ = useQuery({ queryKey: ['dashboard', 'by-status'], queryFn: () => DashboardService.byStatus() });
  const priorityQ = useQuery({ queryKey: ['dashboard', 'by-priority'], queryFn: () => DashboardService.byPriority() });
  const deptQ = useQuery({ queryKey: ['dashboard', 'by-department'], queryFn: () => DashboardService.byDepartment() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const agingQ = useQuery({ queryKey: ['dashboard', 'aging'], queryFn: () => DashboardService.aging() });

  const [days, setDays] = React.useState(90);
  const trendQ = useQuery({ queryKey: ['dashboard', 'by-date', days], queryFn: () => DashboardService.byDate(days) });
  const latencyQ = useQuery({ queryKey: ['dashboard', 'resolution-latency', days], queryFn: () => DashboardService.resolutionLatency(days) });

  const deptName = (id: string | null): string =>
    !id ? 'Unassigned' : (departmentsQ.data?.find((d) => d.id === id)?.name ?? `#${id}`);

  const trendSeries = useZeroFilledTrend(trendQ.data?.data, days);
  const trendTotal = trendSeries.reduce((s, p) => s + p.count, 0);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">System-wide overview across all departments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiLink to="/complaints" label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <KpiLink to="/complaints?status=open" label="Currently open" value={summaryQ.data?.open ?? '—'} emphasis="primary" />
        <KpiLink to="/complaints?priority=critical" label="High / critical" value={summaryQ.data?.highPriority ?? '—'} emphasis="warn" />
        <Kpi
          label={`Avg time to close (${days}d)`}
          value={latencyQ.data?.avgHours == null ? '—' : formatHours(latencyQ.data.avgHours)}
          sub={latencyQ.data?.count ? `over ${latencyQ.data.count} resolutions` : undefined}
        />
      </div>

      {/* Trend */}
      <Card
        title="Complaint volume"
        subtitle="by complaint date · zero-filled"
        headerAction={<WindowToggle days={days} onChange={setDays} />}
      >
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData days={days} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} />}
        <div className="text-right text-xs text-text-muted mt-2">
          {trendTotal} complaints in {days} days
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
            link: `/complaints?status=${encodeURIComponent(r.status)}`,
          }))}
          loading={statusQ.isLoading}
        />
        <BarPanel
          title="By priority"
          data={(priorityQ.data ?? []).map((r) => ({
            key: r.priority,
            count: r.count,
            color: PRIORITY_COLORS[r.priority] ?? SLATE_500,
            link: `/complaints?priority=${encodeURIComponent(r.priority)}`,
          }))}
          loading={priorityQ.isLoading}
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
        />
        <BarPanel
          title="Open complaint aging"
          subtitle="status ∈ {open, in_progress}"
          data={(agingQ.data ?? []).map((r, i) => ({ key: r.bucket, count: r.count, color: AGING_COLORS[i] }))}
          loading={agingQ.isLoading}
        />
      </div>

      {/* Resolution latency */}
      <Card title="Resolution latency" subtitle={`created → resolved/closed · last ${days} days`}>
        {latencyQ.isLoading && <p className="muted">Loading…</p>}
        {!latencyQ.isLoading && (latencyQ.data?.count ?? 0) === 0 && (
          <p className="muted">No complaints have been resolved or closed in the last {days} days.</p>
        )}
        {!latencyQ.isLoading && latencyQ.data && latencyQ.data.count > 0 && <LatencyDetail data={latencyQ.data} />}
      </Card>
    </section>
  );
}

// ─── Scoped / user dashboard ────────────────────────────────────────────

function UserDashboard() {
  const { user } = usePermissions();
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

  const [days, setDays] = React.useState(30);
  const trendQ = useQuery({ queryKey: ['dashboard', 'by-date', 'mine', days], queryFn: () => DashboardService.byDate(days) });
  const trendSeries = useZeroFilledTrend(trendQ.data?.data, days);
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
        headerAction={<WindowToggle days={days} onChange={setDays} />}
      >
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData days={days} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} />}
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
        />
      </div>

      <Card title="Open complaint aging">
        {agingQ.isLoading && <p className="muted">Loading…</p>}
        {agingQ.data && (
          <BarPanel
            title=""
            data={agingQ.data.map((r, i) => ({ key: r.bucket, count: r.count, color: AGING_COLORS[i] }))}
            loading={false}
          />
        )}
      </Card>
    </section>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────

function useZeroFilledTrend(raw: { date: string; count: number }[] | undefined, days: number) {
  return React.useMemo(() => {
    const counts = new Map((raw ?? []).map((p) => [p.date, p.count]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const out: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: counts.get(iso) ?? 0 });
    }
    return out;
  }, [raw, days]);
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

function WindowToggle({ days, onChange }: { days: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-surface-2/50 p-0.5 rounded-md border border-border">
      {WINDOWS.map((w) => (
        <button
          key={w.days}
          onClick={() => onChange(w.days)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-[5px] transition-all',
            days === w.days
              ? 'bg-surface text-text-main shadow-sm ring-1 ring-border'
              : 'text-text-muted hover:text-text-main',
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function NoTrendData({ days }: { days: number }) {
  return (
    <p className="text-text-muted text-sm">
      No complaints with a complaint date in the last {days} days. Set a complaint date when
      creating new ones to populate this chart.
    </p>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.18} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: SLATE_500 }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE_500 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke={PRIMARY} fill="url(#trendFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LatencyDetail({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof DashboardService.resolutionLatency>>>;
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
          <Bar yAxisId="count" dataKey="count" name="Resolutions" fill={PRIMARY} />
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
}: {
  title: string;
  subtitle?: string;
  data: { key: string; count: number; color?: string; link?: string }[];
  loading: boolean;
  horizontal?: boolean;
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
              <Bar dataKey="count" fill={PRIMARY} radius={[3, 3, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.color ?? PRIMARY} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {data.some((d) => d.link) && (
            <ul className="list-none p-0 m-0 flex flex-col gap-1 mt-2">
              {data.map((d) => (
                <li key={d.key}>
                  {d.link ? (
                    <Link to={d.link} className="flex items-center gap-2 px-2 py-1 rounded-sm text-sm text-text-main hover:bg-surface-hover transition-colors">
                      <Dot color={d.color ?? PRIMARY} />
                      <span className="flex-1">{d.key}</span>
                      <span className="font-mono text-xs text-text-muted">{d.count}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1 text-sm">
                      <Dot color={d.color ?? PRIMARY} />
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
