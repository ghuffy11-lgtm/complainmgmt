import { useMemo, useState } from 'react';
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

const WINDOWS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year',  days: 365 },
];

const STATUS_COLORS: Record<string, string> = {
  open:        '#2563eb',
  in_progress: '#b45309',
  resolved:    '#047857',
  closed:      '#6b7280',
  rejected:    '#b91c1c',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:      '#9ca3af',
  normal:   '#2563eb',
  high:     '#b45309',
  critical: '#b91c1c',
};

const AGING_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#7c2d12'];

export function DashboardPage() {
  const { has, user } = usePermissions();

  // `dashboard:read` = full picture (manager / admin). Otherwise the server
  // forces scope-to-own-department; the page renders a slimmer layout.
  const isFullView = has('dashboard:read');
  const isScopedOnly = !isFullView && has('dashboard.own:read');

  if (isScopedOnly) {
    if (!user?.departmentId) {
      return (
        <section>
          <h1>Dashboard</h1>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Your account isn't linked to a department yet, so there's nothing to scope the
              dashboard to. Ask an admin to set your "home department" on Admin → Users.
            </p>
          </div>
        </section>
      );
    }
    return <UserDashboard />;
  }

  return <ManagerDashboard />;
}

// ─── Full / manager dashboard ───────────────────────────────────────────

function ManagerDashboard() {
  const summaryQ     = useQuery({ queryKey: ['dashboard', 'summary'],       queryFn: () => DashboardService.summary() });
  const statusQ      = useQuery({ queryKey: ['dashboard', 'by-status'],     queryFn: () => DashboardService.byStatus() });
  const priorityQ    = useQuery({ queryKey: ['dashboard', 'by-priority'],   queryFn: () => DashboardService.byPriority() });
  const deptQ        = useQuery({ queryKey: ['dashboard', 'by-department'], queryFn: () => DashboardService.byDepartment() });
  const departmentsQ = useQuery({ queryKey: ['departments'],                queryFn: () => DepartmentsService.list() });
  const agingQ       = useQuery({ queryKey: ['dashboard', 'aging'],         queryFn: () => DashboardService.aging() });

  const [days, setDays] = useState(90);
  const trendQ   = useQuery({ queryKey: ['dashboard', 'by-date', days],            queryFn: () => DashboardService.byDate(days) });
  const latencyQ = useQuery({ queryKey: ['dashboard', 'resolution-latency', days], queryFn: () => DashboardService.resolutionLatency(days) });

  const deptName = (id: string | null): string =>
    !id ? 'Unassigned' : (departmentsQ.data?.find((d) => d.id === id)?.name ?? `#${id}`);

  const trendSeries = useZeroFilledTrend(trendQ.data?.data, days);
  const trendTotal = trendSeries.reduce((s, p) => s + p.count, 0);

  return (
    <section>
      <h1>Dashboard</h1>

      {/* KPI strip — clickable */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <KpiLink to="/complaints" label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <KpiLink
          to="/complaints?status=open"
          label="Currently open"
          value={summaryQ.data?.open ?? '—'}
          emphasis="primary"
        />
        <KpiLink
          to="/complaints?priority=critical"
          label="High / critical"
          value={summaryQ.data?.highPriority ?? '—'}
          emphasis="warn"
        />
        <Kpi
          label={`Avg time to close (last ${days}d)`}
          value={latencyQ.data?.avgHours == null ? '—' : formatHours(latencyQ.data.avgHours)}
          sub={latencyQ.data?.count ? `over ${latencyQ.data.count} resolutions` : undefined}
        />
      </div>

      {/* Trend */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Complaint volume</h3>
          <span className="muted" style={{ fontSize: 12 }}>by complaint date · zero-filled</span>
          <span className="spacer" />
          <WindowToggle days={days} onChange={setDays} />
        </div>
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData days={days} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} />}
        <div className="muted" style={{ fontSize: 12, textAlign: 'right', marginTop: 4 }}>
          {trendTotal} complaints in {days} days
        </div>
      </div>

      {/* Status pie + Priority bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginTop: 16 }}>
        <PiePanel
          title="By status"
          data={(statusQ.data ?? []).map((r) => ({
            name: r.status.replace('_', ' '),
            value: r.count,
            color: STATUS_COLORS[r.status] ?? '#6b7280',
            link: `/complaints?status=${encodeURIComponent(r.status)}`,
          }))}
          loading={statusQ.isLoading}
        />
        <BarPanel
          title="By priority"
          data={(priorityQ.data ?? []).map((r) => ({
            key: r.priority, count: r.count,
            color: PRIORITY_COLORS[r.priority] ?? '#6b7280',
            link: `/complaints?priority=${encodeURIComponent(r.priority)}`,
          }))}
          loading={priorityQ.isLoading}
        />
      </div>

      {/* Department + Aging */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginTop: 12 }}>
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
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Resolution latency</h3>
          <span className="muted" style={{ fontSize: 12 }}>created → resolved/closed · last {days} days</span>
        </div>
        {latencyQ.isLoading && <p className="muted">Loading…</p>}
        {!latencyQ.isLoading && (latencyQ.data?.count ?? 0) === 0 && (
          <p className="muted">No complaints have been resolved or closed in the last {days} days.</p>
        )}
        {!latencyQ.isLoading && latencyQ.data && latencyQ.data.count > 0 && (
          <LatencyDetail data={latencyQ.data} />
        )}
      </div>
    </section>
  );
}

// ─── Scoped / user dashboard ────────────────────────────────────────────

function UserDashboard() {
  const { user } = usePermissions();
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const myDeptName = departmentsQ.data?.find((d) => d.id === user?.departmentId)?.name ?? 'your department';

  const summaryQ  = useQuery({ queryKey: ['dashboard', 'summary', 'mine'],     queryFn: () => DashboardService.summary() });
  const statusQ   = useQuery({ queryKey: ['dashboard', 'by-status', 'mine'],   queryFn: () => DashboardService.byStatus() });
  const priorityQ = useQuery({ queryKey: ['dashboard', 'by-priority', 'mine'], queryFn: () => DashboardService.byPriority() });
  const agingQ    = useQuery({ queryKey: ['dashboard', 'aging', 'mine'],       queryFn: () => DashboardService.aging() });

  const [days, setDays] = useState(30);
  const trendQ = useQuery({ queryKey: ['dashboard', 'by-date', 'mine', days], queryFn: () => DashboardService.byDate(days) });
  const trendSeries = useZeroFilledTrend(trendQ.data?.data, days);
  const trendTotal = trendSeries.reduce((s, p) => s + p.count, 0);

  const linkBase = `/complaints?departmentId=${user?.departmentId ?? ''}`;

  return (
    <section>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <span className="badge badge-primary" style={{ marginLeft: 8 }}>{myDeptName}</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Showing complaints assigned to your department.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <KpiLink to={linkBase} label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <KpiLink to={`${linkBase}&status=open`} label="Currently open" value={summaryQ.data?.open ?? '—'} emphasis="primary" />
        <KpiLink to={`${linkBase}&priority=critical`} label="High / critical" value={summaryQ.data?.highPriority ?? '—'} emphasis="warn" />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Volume in your department</h3>
          <span className="spacer" />
          <WindowToggle days={days} onChange={setDays} />
        </div>
        {trendQ.isLoading && <p className="muted">Loading…</p>}
        {!trendQ.isLoading && trendTotal === 0 && <NoTrendData days={days} />}
        {!trendQ.isLoading && trendTotal > 0 && <TrendChart data={trendSeries} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginTop: 12 }}>
        <PiePanel
          title="By status"
          data={(statusQ.data ?? []).map((r) => ({
            name: r.status.replace('_', ' '),
            value: r.count,
            color: STATUS_COLORS[r.status] ?? '#6b7280',
            link: `${linkBase}&status=${encodeURIComponent(r.status)}`,
          }))}
          loading={statusQ.isLoading}
        />
        <BarPanel
          title="By priority"
          data={(priorityQ.data ?? []).map((r) => ({
            key: r.priority, count: r.count,
            color: PRIORITY_COLORS[r.priority] ?? '#6b7280',
            link: `${linkBase}&priority=${encodeURIComponent(r.priority)}`,
          }))}
          loading={priorityQ.isLoading}
        />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Open complaint aging</h3>
        {agingQ.isLoading && <p className="muted">Loading…</p>}
        {agingQ.data && (
          <BarPanel
            title=""
            data={agingQ.data.map((r, i) => ({ key: r.bucket, count: r.count, color: AGING_COLORS[i] }))}
            loading={false}
          />
        )}
      </div>
    </section>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────

function useZeroFilledTrend(raw: { date: string; count: number }[] | undefined, days: number) {
  return useMemo(() => {
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
  label, value, sub, emphasis,
}: { label: string; value: number | string; sub?: string; emphasis?: 'primary' | 'warn' }) {
  const accent =
    emphasis === 'primary' ? 'var(--primary)' :
    emphasis === 'warn'    ? 'var(--warn)'    : 'var(--text)';
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4, color: accent }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function KpiLink({
  to, label, value, sub, emphasis,
}: { to: string; label: string; value: number | string; sub?: string; emphasis?: 'primary' | 'warn' }) {
  return (
    <Link
      to={to}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      className="kpi-link"
      title={`Open ${label.toLowerCase()} list`}
    >
      <div
        className="card"
        style={{
          cursor: 'pointer',
          transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.borderColor = 'var(--border-strong)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '';
          e.currentTarget.style.borderColor = '';
        }}
      >
        <Kpi label={label} value={value} sub={sub} emphasis={emphasis} />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function WindowToggle({ days, onChange }: { days: number; onChange: (n: number) => void }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {WINDOWS.map((w) => (
        <button
          key={w.days}
          onClick={() => onChange(w.days)}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
            background: days === w.days ? 'var(--primary)' : 'var(--surface)',
            color: days === w.days ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >{w.label}</button>
      ))}
    </div>
  );
}

function NoTrendData({ days }: { days: number }) {
  return (
    <p className="muted">
      No complaints with a complaint date in the last {days} days. Set a complaint date when
      creating new ones to populate this chart.
    </p>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2563eb" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} interval="preserveStartEnd" minTickGap={40} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
        <Tooltip />
        <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#trendFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LatencyDetail({ data }: { data: NonNullable<Awaited<ReturnType<typeof DashboardService.resolutionLatency>>> }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
        <Stat label="Resolutions" value={String(data.count)} />
        <Stat label="Average"     value={formatHours(data.avgHours    ?? 0)} />
        <Stat label="Median"      value={formatHours(data.medianHours ?? 0)} />
        <Stat label="P95"         value={formatHours(data.p95Hours    ?? 0)} />
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data.perWeek} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="count" dataKey="count"    name="Resolutions" fill="#2563eb" />
          <Bar yAxisId="hours" dataKey="avgHours" name="Avg hours"   fill="#b45309" />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function PiePanel({
  title, data, loading,
}: {
  title: string;
  data: { name: string; value: number; color: string; link?: string }[];
  loading: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      {loading && <p className="muted">Loading…</p>}
      {!loading && total === 0 && <p className="muted">No data yet.</p>}
      {!loading && total > 0 && (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend doubles as a click-through list — much more useful than recharts'
              built-in legend for our case */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.map((d) => (
              <li key={d.name}>
                {d.link ? (
                  <Link to={d.link} style={legendItemStyle}>
                    <Dot color={d.color} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span className="mono muted">{d.value}</span>
                  </Link>
                ) : (
                  <div style={legendItemStyle}>
                    <Dot color={d.color} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span className="mono muted">{d.value}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function BarPanel({
  title, subtitle, data, loading, horizontal,
}: {
  title: string;
  subtitle?: string;
  data: { key: string; count: number; color?: string; link?: string }[];
  loading: boolean;
  horizontal?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="card">
      {(title || subtitle) && (
        <div className="row" style={{ marginBottom: 8 }}>
          {title && <h3 style={{ margin: 0 }}>{title}</h3>}
          {subtitle && <span className="muted" style={{ fontSize: 12 }}>{subtitle}</span>}
        </div>
      )}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              {horizontal
                ? <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                : <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} />}
              {horizontal
                ? <YAxis type="category" dataKey="key" width={120} tick={{ fontSize: 11, fill: '#6b7280' }} />
                : <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />}
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb">
                {data.map((d, i) => <Cell key={i} fill={d.color ?? '#2563eb'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {data.some((d) => d.link) && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.map((d) => (
                <li key={d.key}>
                  {d.link ? (
                    <Link to={d.link} style={legendItemStyle}>
                      <Dot color={d.color ?? '#2563eb'} />
                      <span style={{ flex: 1 }}>{d.key}</span>
                      <span className="mono muted">{d.count}</span>
                    </Link>
                  ) : (
                    <div style={legendItemStyle}>
                      <Dot color={d.color ?? '#2563eb'} />
                      <span style={{ flex: 1 }}>{d.key}</span>
                      <span className="mono muted">{d.count}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );
}

const legendItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  textDecoration: 'none',
  fontSize: 13,
  transition: 'background-color 120ms ease',
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
