import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AuthAuditEvent,
  AuthAuditFilter,
  AuthAuditRow,
  AuthAuditService,
} from '../../services/auth-audit.service';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { DateInput } from '../../components/ui/DateInput';

const EVENT_LABELS: Record<AuthAuditEvent, string> = {
  'login.success': 'Login success',
  'login.password_failed': 'Wrong password',
  'login.unknown_user': 'Unknown user',
  'login.account_locked': 'Attempt on locked account',
  'login.inactive': 'Attempt on inactive account',
  'login.wrong_provider': 'Wrong auth backend',
  'login.2fa_success': '2FA success',
  'login.2fa_failed': '2FA failed',
  'account.locked': 'Account locked',
  'account.unlocked_by_admin': 'Unlocked by admin',
  '2fa.enrolled': '2FA enrolled',
  '2fa.disabled': '2FA disabled',
  '2fa.reset_by_admin': '2FA reset by admin',
  logout: 'Logout',
  password_changed: 'Password changed',
};

function eventVariant(event: AuthAuditEvent): BadgeVariant {
  if (event === 'login.success' || event === 'login.2fa_success' || event === '2fa.enrolled') {
    return 'success';
  }
  if (event === 'account.locked' || event === 'login.account_locked') return 'warn';
  if (
    event === 'login.password_failed' ||
    event === 'login.unknown_user' ||
    event === 'login.inactive' ||
    event === 'login.wrong_provider' ||
    event === 'login.2fa_failed'
  ) {
    return 'danger';
  }
  return 'primary';
}

function shortUserAgent(ua: string | null): string {
  if (!ua) return '—';
  // First token, plus a hint of the rendering engine if present.
  // Full UA is shown in the expanded detail.
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|Mobile Safari|curl|Postman)[^/]*\/[\d.]+/);
  if (m) return m[0];
  return ua.slice(0, 32) + (ua.length > 32 ? '…' : '');
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function AdminLoginActivityPage() {
  const [filters, setFilters] = useState<AuthAuditFilter>({ page: 1, pageSize: 100 });
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['auth-audit', filters],
    queryFn: () => AuthAuditService.search(filters),
  });

  // Tripwire panel — IPs with ≥10 failures in the last 24h. Refreshes
  // every minute (cheap aggregate query) so it stays current while the
  // admin is investigating without manual refresh.
  const tripwireQ = useQuery({
    queryKey: ['auth-audit-tripwire'],
    queryFn: () => AuthAuditService.tripwire(),
    refetchInterval: 60_000,
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.meta.total ?? 0;
  const page = q.data?.meta.page ?? filters.page ?? 1;
  const pageSize = q.data?.meta.pageSize ?? filters.pageSize ?? 100;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-text-main m-0">Login activity</h3>
        <p className="text-xs text-text-muted mt-0.5 m-0">
          Append-only record of authentication events — login attempts, lockouts, password
          changes, and 2FA lifecycle. Filter to investigate.
        </p>
      </div>

      {tripwireQ.data && tripwireQ.data.data.length > 0 && (
        <div
          className="px-4 py-3 border-b border-border"
          style={{ background: 'var(--danger-bg)', borderBottomColor: 'var(--danger-border)' }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="font-semibold text-text-main m-0 text-sm">
              Recent failures by IP
            </h4>
            <span className="text-xs text-text-muted">
              ≥ {tripwireQ.data.meta.threshold} failures in the last{' '}
              {tripwireQ.data.meta.windowHours}h
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tripwireQ.data.data.map((r) => (
              <button
                key={r.ip}
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, ip: r.ip, success: 'false', page: 1 }))
                }
                className="bg-surface border border-border hover:border-danger px-2 py-1 rounded mono text-xs cursor-pointer text-left transition-colors"
                title={`${r.count} failures · last ${new Date(r.lastSeen).toLocaleString()}`}
              >
                <span className="font-semibold">{r.ip}</span>
                <span className="text-text-muted ml-1.5">× {r.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar p-4 bg-surface-2/30 border-b border-border flex flex-wrap items-center gap-2">
        <input
          placeholder="Username"
          value={filters.username ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, username: e.target.value || undefined, page: 1 }))
          }
          style={{ maxWidth: 160 }}
        />
        <input
          placeholder="IP"
          value={filters.ip ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, ip: e.target.value || undefined, page: 1 }))}
          style={{ maxWidth: 160 }}
        />
        <Select
          size="sm"
          className="w-[220px]"
          placeholder="Any event"
          value={filters.event ?? ''}
          onChange={(v) =>
            setFilters((f) => ({ ...f, event: v || undefined, success: undefined, page: 1 }))
          }
          allowClear
          clearLabel="Any event"
          options={(Object.keys(EVENT_LABELS) as AuthAuditEvent[]).map((e) => ({
            value: e,
            label: EVENT_LABELS[e],
          }))}
        />
        <Select
          size="sm"
          className="w-[160px]"
          placeholder="All outcomes"
          value={filters.success ?? ''}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              success: v === 'true' || v === 'false' ? (v as 'true' | 'false') : undefined,
              event: undefined,
              page: 1,
            }))
          }
          allowClear
          clearLabel="All outcomes"
          disabled={!!filters.event}
          options={[
            { value: 'true', label: 'Successes only' },
            { value: 'false', label: 'Failures only' },
          ]}
        />
        <DateInput
          value={filters.from ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, from: e.target.value || undefined, page: 1 }))
          }
          style={{ maxWidth: 150 }}
          placeholder="From"
        />
        <DateInput
          value={filters.to ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, to: e.target.value || undefined, page: 1 }))
          }
          style={{ maxWidth: 150 }}
          placeholder="To"
        />
        <span className="spacer" />
        <Button
          variant="ghost"
          onClick={() => setFilters({ page: 1, pageSize: 100 })}
        >
          Clear
        </Button>
      </div>

      <div className="p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Event</th>
              <th>IP</th>
              <th>Client</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="text-center text-text-muted py-8">
                  Loading…
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-text-muted py-8">
                  No events match the current filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono whitespace-nowrap">{formatTs(r.occurredAt)}</td>
                  <td>
                    <div className="font-medium">{r.username}</div>
                    {r.userDisplayName && r.userDisplayName !== r.username && (
                      <div className="text-xs text-text-muted">{r.userDisplayName}</div>
                    )}
                  </td>
                  <td>
                    <Badge variant={eventVariant(r.event)}>{EVENT_LABELS[r.event]}</Badge>
                  </td>
                  <td className="mono">{r.ip ?? '—'}</td>
                  <td className="text-xs text-text-muted">{shortUserAgent(r.userAgent)}</td>
                  <td className="text-text-muted">{expanded === r.id ? '▾' : '▸'}</td>
                </tr>
                {expanded === r.id && <ExpandedRow row={r} />}
              </Fragment>
            ))}
          </tbody>
        </table>

        {q.data && total > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-xs text-text-muted">
              Page {page} · showing {rows.length} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))
                }
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page * pageSize >= total}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ExpandedRow({ row }: { row: AuthAuditRow }) {
  return (
    <tr>
      <td colSpan={6} className="bg-surface-2/40 p-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-text-muted mb-0.5">Full timestamp</div>
            <div className="mono">{row.occurredAt}</div>
          </div>
          <div>
            <div className="text-text-muted mb-0.5">User ID</div>
            <div className="mono">{row.userId ?? '—'}</div>
          </div>
          <div className="col-span-2">
            <div className="text-text-muted mb-0.5">User-Agent</div>
            <div className="mono break-all">{row.userAgent ?? '—'}</div>
          </div>
          <div className="col-span-2">
            <div className="text-text-muted mb-0.5">Detail</div>
            <pre className="mono bg-surface p-2 rounded border border-border text-xs overflow-x-auto m-0">
              {row.detail ? JSON.stringify(row.detail, null, 2) : '—'}
            </pre>
          </div>
        </div>
      </td>
    </tr>
  );
}
