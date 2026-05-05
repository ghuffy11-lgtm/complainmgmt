import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { DepartmentsService } from '../services/departments.service';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { AssignmentDialog } from '../components/AssignmentDialog';
import { ReopenDialog } from '../components/ReopenDialog';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { AuditTimeline } from '../components/AuditTimeline';
import { Button } from '../components/ui/Button';
import { errorMessage, useToast } from '../components/ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
import { PriorityBadge, StatusBadge } from './ComplaintsListPage';
import type { ComplaintPriority, ComplaintStatus } from '../types/api';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { has, user } = usePermissions();

  const complaintQ = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => ComplaintsService.get(id),
    enabled: !!id,
  });
  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const historyQ = useQuery({
    queryKey: ['complaint', id, 'history'],
    queryFn: () => ComplaintsService.assignmentHistory(id),
    enabled: !!id,
  });
  const auditQ = useQuery({
    queryKey: ['complaint', id, 'audit'],
    queryFn: () => ComplaintsService.auditTimeline(id),
    enabled: !!id,
  });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  // Local edit buffer for dynamic field values, primed when the complaint loads.
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [assignOpen, setAssignOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  useEffect(() => {
    if (complaintQ.data) setDraft({ ...complaintQ.data.values });
  }, [complaintQ.data]);

  const dirty = useMemo(() => {
    if (!complaintQ.data) return false;
    return JSON.stringify(changedOnly(complaintQ.data.values, draft)) !== '{}';
  }, [complaintQ.data, draft]);

  const saveM = useMutation({
    mutationFn: () => ComplaintsService.update(id, { values: changedOnly(complaintQ.data?.values ?? {}, draft) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      toast.success('Changes saved');
      setErrors({});
    },
    onError: (err) => {
      const e = err as { response?: { data?: { code?: string; errors?: Record<string, string[]>; fieldKey?: string } } };
      const data = e?.response?.data;
      if (data?.code === 'VALIDATION_FAILED' && data.errors) {
        setErrors(data.errors);
      } else if (data?.code === 'FIELD_LOCKED' && data.fieldKey) {
        toast.error(`Field "${data.fieldKey}" is locked. Use override if you have permission.`);
      } else {
        toast.error(errorMessage(err, 'Save failed'));
      }
    },
  });

  const statusM = useMutation({
    mutationFn: (s: ComplaintStatus) => ComplaintsService.setStatus(id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const priorityM = useMutation({
    mutationFn: (p: ComplaintPriority) => ComplaintsService.setPriority(id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Inline edit of complaint_date — null clears, string sets.
  const complaintDateM = useMutation({
    mutationFn: (next: string | null) => ComplaintsService.update(id, { complaintDate: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save complaint date')),
  });

  if (!id) return <p>Missing complaint id.</p>;
  if (complaintQ.isLoading || fieldsQ.isLoading) return <p className="muted">Loading…</p>;
  if (!complaintQ.data) return <p>Complaint not found.</p>;

  const c = complaintQ.data;
  // Closed/resolved complaints are read-only. Reopening requires
  // `complaint:reopen` (which the backend also enforces). Both controls below
  // gate on `editable` so the UI matches what the API will let through.
  const isFrozen = c.status === 'closed' || c.status === 'resolved';
  const canEdit = has('complaint:update') && !isFrozen;
  const canAssign = has('complaint:assign') && !isFrozen;
  const canReopen = isFrozen && has('complaint:reopen');
  const canSeeUsers = has('admin.users:read');
  const deptName = (id: string | null) => departmentsQ.data?.find((d) => d.id === id)?.name ?? (id ? `#${id}` : '—');

  const isFieldLocked = (fieldKey: string): boolean => {
    const f = (fieldsQ.data ?? []).find((x) => x.key === fieldKey);
    if (!f || f.locking !== 'first_writer_wins') return false;
    const lock = c.locks[fieldKey];
    if (!lock || !lock.ownerUserId) return false;
    const ownedByMe = String(lock.ownerUserId) === String(user?.id);
    if (ownedByMe) return false;
    const canOverride =
      has(`complaint.field:${fieldKey}:override`) || has('complaint.field:*:override');
    return !canOverride;
  };

  return (
    <section>
      <div className="row" style={{ marginBottom: 12 }}>
        <Button variant="ghost" onClick={() => nav('/complaints')}>← Back</Button>
        <h1 style={{ margin: 0 }}>{c.referenceNo}</h1>
        <StatusBadge status={c.status} />
        <PriorityBadge priority={c.priority} />
        <span className="spacer" />
        {canAssign && <Button variant="secondary" onClick={() => setAssignOpen(true)}>Assign…</Button>}
        {canReopen && <Button variant="danger" onClick={() => setReopenOpen(true)}>Reopen…</Button>}
      </div>

      {isFrozen && (
        <div className="card" style={{
          background: '#fffbeb', borderColor: '#fde68a',
          marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <strong>This complaint is {c.status === 'closed' ? 'closed' : 'resolved'} — read-only.</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {canReopen
                ? 'Use Reopen to make changes; the action is recorded in the activity timeline.'
                : 'Ask an admin to reopen if changes are needed.'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16 }}>
        <div className="col">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Fields</h3>
            {(fieldsQ.data ?? []).map((f) => (
              <DynamicFieldRenderer
                key={f.id}
                field={f}
                value={draft[f.key]}
                onChange={(v) => setDraft((s) => ({ ...s, [f.key]: v }))}
                disabled={!canEdit}
                locked={isFieldLocked(f.key)}
                lockOwner={c.locks[f.key]?.ownerUserId ?? null}
                error={errors[f.key]?.join(', ')}
              />
            ))}
            {canEdit && (
              <div className="row-end" style={{ marginTop: 12 }}>
                <Button variant="ghost" disabled={!dirty} onClick={() => setDraft({ ...c.values })}>Discard</Button>
                <Button disabled={!dirty || saveM.isPending} onClick={() => saveM.mutate()}>
                  {saveM.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            )}
          </div>

          <AttachmentsPanel complaintId={id} />

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Activity</h3>
            <AuditTimeline
              entries={auditQ.data?.data ?? []}
              loading={auditQ.isLoading}
              fieldsByKey={new Map((fieldsQ.data ?? []).map((f) => [f.key, f]))}
            />
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>State</h3>
            <div className="field">
              <label>Status</label>
              <select
                value={c.status}
                disabled={!canEdit}
                onChange={(e) => statusM.mutate(e.target.value as ComplaintStatus)}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select
                value={c.priority}
                disabled={!canEdit}
                onChange={(e) => priorityM.mutate(e.target.value as ComplaintPriority)}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Complaint date</label>
              <input
                type="date"
                value={c.complaintDate ?? ''}
                disabled={!canEdit}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => complaintDateM.mutate(e.target.value || null)}
              />
            </div>
            <div className="field">
              <label>Department</label>
              <input value={deptName(c.assignedDepartmentId)} disabled />
            </div>
            <div className="field">
              <label>Assigned to</label>
              <input
                value={
                  c.assignedTo
                    ? historyQ.data?.find((h) => String(h.newAssignedTo) === String(c.assignedTo))?.newAssignedToName
                      ?? `#${c.assignedTo}`
                    : '— department queue —'
                }
                disabled
              />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Created {new Date(c.createdAt).toLocaleString()}<br />
              Updated {new Date(c.updatedAt).toLocaleString()}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Assignment history</h3>
            {historyQ.isLoading && <p className="muted">Loading…</p>}
            {historyQ.data && historyQ.data.length === 0 && <p className="muted">No assignments yet.</p>}
            {historyQ.data && historyQ.data.length > 0 && (
              <table>
                <thead>
                  <tr><th>When</th><th>Department</th><th>User</th><th>By</th></tr>
                </thead>
                <tbody>
                  {historyQ.data.map((h) => (
                    <tr key={h.id}>
                      <td className="mono muted">{new Date(h.changedAt).toLocaleString()}</td>
                      <td>
                        <span className="muted">{h.oldDepartmentName ?? '—'}</span>{' → '}
                        <span>{h.newDepartmentName ?? '—'}</span>
                      </td>
                      <td>
                        <span className="muted">{h.oldAssignedToName ?? '—'}</span>{' → '}
                        <span>{h.newAssignedToName ?? '—'}</span>
                      </td>
                      <td className="muted">{h.changedByName ?? `#${h.changedBy}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <AssignmentDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        complaintId={id}
        current={{ departmentId: c.assignedDepartmentId, assignedTo: c.assignedTo }}
        canSeeUsers={canSeeUsers}
      />

      <ReopenDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        complaintId={id}
        currentStatus={c.status}
      />
    </section>
  );
}

/** Send only fields whose value changed — keeps the audit trail honest. */
function changedOnly(orig: Record<string, unknown>, draft: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(orig), ...Object.keys(draft)]);
  for (const k of keys) {
    const a = orig[k] ?? null;
    const b = draft[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = b;
  }
  return out;
}
