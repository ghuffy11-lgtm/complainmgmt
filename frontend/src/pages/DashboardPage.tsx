import { useQuery } from '@tanstack/react-query';
import { DashboardService } from '../services/dashboard.service';
import { DepartmentsService } from '../services/departments.service';

export function DashboardPage() {
  const summaryQ = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => DashboardService.summary() });
  const statusQ = useQuery({ queryKey: ['dashboard', 'by-status'], queryFn: () => DashboardService.byStatus() });
  const priorityQ = useQuery({ queryKey: ['dashboard', 'by-priority'], queryFn: () => DashboardService.byPriority() });
  const deptQ = useQuery({ queryKey: ['dashboard', 'by-department'], queryFn: () => DashboardService.byDepartment() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  const deptName = (id: string | null): string => {
    if (!id) return 'Unassigned';
    return departmentsQ.data?.find((d) => d.id === id)?.name ?? `#${id}`;
  };

  return (
    <section>
      <h1>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <Card label="Total complaints" value={summaryQ.data?.total ?? '—'} />
        <Card label="High / critical" value={summaryQ.data?.highPriority ?? '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, marginTop: 16 }}>
        <Breakdown title="By status"     loading={statusQ.isLoading}    data={statusQ.data?.map(r => ({ key: r.status, count: r.count })) ?? []} />
        <Breakdown title="By priority"   loading={priorityQ.isLoading}  data={priorityQ.data?.map(r => ({ key: r.priority, count: r.count })) ?? []} />
        <Breakdown title="By department" loading={deptQ.isLoading}      data={deptQ.data?.map(r => ({ key: deptName(r.departmentId), count: r.count })) ?? []} />
      </div>
    </section>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Breakdown({ title, data, loading }: { title: string; data: { key: string; count: number }[]; loading: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      {loading && <p className="muted">Loading…</p>}
      {!loading && data.length === 0 && <p className="muted">No data yet.</p>}
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map((d) => (
            <div key={d.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{d.key}</span>
                <span className="mono muted">{d.count}</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: 'var(--primary)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
