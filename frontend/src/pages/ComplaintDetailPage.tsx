import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Printer, RotateCcw, Save, UserPlus } from 'lucide-react';
import { ComplaintsService } from '../services/complaints.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { DepartmentsService } from '../services/departments.service';
import { OriginsService } from '../services/origins.service';
import { SubcategoriesService } from '../services/subcategories.service';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { AssignmentDialog } from '../components/AssignmentDialog';
import { ReopenDialog } from '../components/ReopenDialog';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { AuditTimeline } from '../components/AuditTimeline';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { Select } from '../components/ui/Select';
import { errorMessage, useToast } from '../components/ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
import { useBranding } from '../hooks/useBranding';
import { titleize } from '../lib/utils';
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
  const branding = useBranding();

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
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
  const subcatsQ = useQuery({
    queryKey: ['subcategories', complaintQ.data?.assignedDepartmentId],
    queryFn: () => SubcategoriesService.listForDepartment(complaintQ.data!.assignedDepartmentId!),
    enabled: !!complaintQ.data?.assignedDepartmentId,
  });

  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  // Session-only "I clicked unlock on this field" — reset on reload so an
  // override is always a deliberate, fresh click.
  const [unlocked, setUnlocked] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (complaintQ.data) {
      setDraft({ ...complaintQ.data.values });
      setUnlocked({});
    }
  }, [complaintQ.data]);

  const dirty = React.useMemo(() => {
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

  const originM = useMutation({
    mutationFn: (next: string) => ComplaintsService.update(id, { originId: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change origin')),
  });
  const subcatM = useMutation({
    mutationFn: (next: string | null) => ComplaintsService.update(id, { subcategoryId: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change sub-category')),
  });

  if (!id) return <p>Missing complaint id.</p>;
  if (complaintQ.isLoading || fieldsQ.isLoading) return <p className="text-text-muted">Loading…</p>;
  if (!complaintQ.data) return <p>Complaint not found.</p>;

  const c = complaintQ.data;
  const isFrozen = c.status === 'closed' || c.status === 'resolved';
  const canEdit = has('complaint:update') && !isFrozen;
  const canAssign = has('complaint:assign') && !isFrozen;
  const canReopen = isFrozen && has('complaint:reopen');
  const canSeeUsers = has('admin.users:read');
  const deptName = (id: string | null) => departmentsQ.data?.find((d) => d.id === id)?.name ?? (id ? `#${id}` : '—');

  // True whenever the field has an owner that isn't the current user. We
  // intentionally don't short-circuit on override permission any more — an
  // override-holder still sees the lock and must click "Unlock" to opt in.
  const isFieldLocked = (fieldKey: string): boolean => {
    const f = (fieldsQ.data ?? []).find((x) => x.key === fieldKey);
    if (!f || f.locking !== 'first_writer_wins') return false;
    const lock = c.locks[fieldKey];
    if (!lock || !lock.ownerUserId) return false;
    return String(lock.ownerUserId) !== String(user?.id);
  };
  const canOverrideField = (fieldKey: string): boolean =>
    has(`complaint.field:${fieldKey}:override`) || has('complaint.field:*:override');

  return (
    <section className="space-y-6">
      {/* Print-only letterhead: org branding + reference no. The on-screen
          header below is hidden in print mode so the navigation buttons
          don't leak onto paper. */}
      <div className="print-only print-letterhead">
        {branding.logoUrl && <img src={branding.logoUrl} alt="" />}
        <div className="print-titles">
          <div className="print-org">{branding.organizationName}</div>
          <div className="print-sys">{branding.systemName}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-base font-bold text-black">{c.referenceNo}</div>
          <div className="text-[11px] text-[#555]">
            Status: {titleize(c.status)} · Priority: {titleize(c.priority)}
          </div>
          <div className="text-[11px] text-[#555]">
            Origin: {originsQ.data?.find((o) => o.id === c.originId)?.name ?? '—'}
            {c.subcategoryId && (
              <> · Sub-category: {subcatsQ.data?.find((s) => s.id === c.subcategoryId)?.name ?? '—'}</>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav('/complaints')} className="no-print px-2">
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-text-main m-0">{c.referenceNo}</h1>
          <StatusBadge status={c.status} />
          <PriorityBadge priority={c.priority} />
        </div>
        <div className="no-print flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>
            Print
          </Button>
          {canAssign && (
            <Button variant="secondary" size="sm" icon={<UserPlus size={14} />} onClick={() => setAssignOpen(true)}>
              Assign
            </Button>
          )}
          {canReopen && (
            <Button variant="danger" size="sm" icon={<RotateCcw size={14} />} onClick={() => setReopenOpen(true)}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      {isFrozen && (
        <div
          className="rounded-md flex items-center gap-3 px-4 py-3 text-sm"
          style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', color: 'var(--warn)' }}
        >
          <Lock size={16} className="shrink-0" />
          <div>
            <strong>This complaint is {c.status === 'closed' ? 'closed' : 'resolved'} — read-only.</strong>
            <div className="text-xs mt-0.5 text-text-muted">
              {canReopen
                ? 'Use Reopen to make changes; the action is recorded in the activity timeline.'
                : 'Ask an admin to reopen if changes are needed.'}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Fields"
            headerAction={
              canEdit && dirty ? (
                <div className="no-print flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft({ ...c.values })}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    icon={<Save size={14} />}
                    disabled={!dirty || saveM.isPending}
                    isLoading={saveM.isPending}
                    onClick={() => saveM.mutate()}
                  >
                    Save
                  </Button>
                </div>
              ) : null
            }
          >
            {(fieldsQ.data ?? []).map((f) => {
              const fieldLocked = isFieldLocked(f.key) && !unlocked[f.key];
              return (
                <DynamicFieldRenderer
                  key={f.id}
                  field={f}
                  value={draft[f.key]}
                  onChange={(v) => setDraft((s) => ({ ...s, [f.key]: v }))}
                  disabled={!canEdit}
                  locked={fieldLocked}
                  lockOwner={c.locks[f.key]?.ownerUserId ?? null}
                  canUnlock={canEdit && fieldLocked && canOverrideField(f.key)}
                  onUnlock={() => setUnlocked((s) => ({ ...s, [f.key]: true }))}
                  error={errors[f.key]?.join(', ')}
                />
              );
            })}
          </Card>

          <div className="no-print">
            <AttachmentsPanel complaintId={id} />
          </div>

          <Card className="no-print" title="Activity" subtitle="Journal of all changes and actions">
            <AuditTimeline
              entries={auditQ.data?.data ?? []}
              loading={auditQ.isLoading}
              fieldsByKey={new Map((fieldsQ.data ?? []).map((f) => [f.key, f]))}
            />
          </Card>
        </div>

        {/* Sidebar column */}
        <div className="space-y-6">
          <Card title="State">
            <div className="space-y-1">
              <div className="field">
                <label className="text-[13px] font-medium text-text-main">Status</label>
                <Select
                  value={c.status}
                  disabled={!canEdit}
                  onChange={(v) => statusM.mutate(v as ComplaintStatus)}
                  options={STATUSES.map((s) => ({ value: s, label: titleize(s) }))}
                />
              </div>
              <div className="field">
                <label className="text-[13px] font-medium text-text-main">Priority</label>
                <Select
                  value={c.priority}
                  disabled={!canEdit}
                  onChange={(v) => priorityM.mutate(v as ComplaintPriority)}
                  options={PRIORITIES.map((p) => ({ value: p, label: titleize(p) }))}
                />
              </div>
              <div className="field">
                <label className="text-[13px] font-medium text-text-main">Complaint date</label>
                <DateInput
                  value={c.complaintDate ?? ''}
                  disabled={!canEdit}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => complaintDateM.mutate(e.target.value || null)}
                />
              </div>
              <div className="field">
                <label className="text-[13px] font-medium text-text-main">Origin of complaint</label>
                <Select
                  value={c.originId ?? ''}
                  disabled={!canEdit}
                  onChange={(v) => v && originM.mutate(v)}
                  options={(originsQ.data ?? [])
                    .filter((o) => o.isActive || o.id === c.originId)
                    .map((o) => ({
                      value: o.id,
                      label: o.isActive ? o.name : `${o.name} (inactive)`,
                    }))}
                />
              </div>
              {(subcatsQ.data ?? []).filter((s) => s.isActive).length > 0 && (
                <div className="field">
                  <label className="text-[13px] font-medium text-text-main">Sub-category</label>
                  <Select
                    value={c.subcategoryId ?? ''}
                    disabled={!canEdit}
                    onChange={(v) => subcatM.mutate(v || null)}
                    options={(subcatsQ.data ?? [])
                      .filter((s) => s.isActive || s.id === c.subcategoryId)
                      .map((s) => ({
                        value: s.id,
                        label: s.isActive ? s.name : `${s.name} (inactive)`,
                      }))}
                  />
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Department</span>
                <span className="font-medium text-text-main">{deptName(c.assignedDepartmentId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Assigned to</span>
                <span className="font-medium text-text-main">
                  {c.assignedTo
                    ? historyQ.data?.find((h) => String(h.newAssignedTo) === String(c.assignedTo))?.newAssignedToName
                      ?? `#${c.assignedTo}`
                    : '— department queue —'}
                </span>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border text-[10px] text-text-subtle uppercase font-semibold tracking-wider space-y-1">
              <p className="m-0">Created: {new Date(c.createdAt).toLocaleString()}</p>
              <p className="m-0">Updated: {new Date(c.updatedAt).toLocaleString()}</p>
            </div>
          </Card>

          <Card className="no-print" title="Assignment history">
            {historyQ.isLoading && <p className="text-text-muted text-sm">Loading…</p>}
            {historyQ.data && historyQ.data.length === 0 && (
              <p className="text-text-muted text-sm">No assignments yet.</p>
            )}
            {historyQ.data && historyQ.data.length > 0 && (
              <ul className="space-y-3">
                {historyQ.data.map((h) => (
                  <li
                    key={h.id}
                    className="text-xs px-3 py-2 rounded-md border border-border bg-surface-2/40"
                  >
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-text-main">
                        {h.newDepartmentName ?? '—'}
                        {h.newAssignedToName && <> · {h.newAssignedToName}</>}
                      </span>
                      <span className="font-mono text-text-subtle">
                        {new Date(h.changedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-text-muted">
                      <span className="opacity-60">from</span>{' '}
                      {h.oldDepartmentName ?? '—'}
                      {h.oldAssignedToName && <> · {h.oldAssignedToName}</>}
                      <span className="opacity-60"> · by </span>
                      {h.changedByName ?? `#${h.changedBy}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
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
