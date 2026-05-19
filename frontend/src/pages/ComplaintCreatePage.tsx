import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Paperclip, Plus, X } from 'lucide-react';
import { ComplaintsService } from '../services/complaints.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { DepartmentsService } from '../services/departments.service';
import { OriginsService } from '../services/origins.service';
import { SubcategoriesService } from '../services/subcategories.service';
import { UsersService } from '../services/users.service';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { Select } from '../components/ui/Select';
import { errorMessage, useToast } from '../components/ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
import { cn, titleize } from '../lib/utils';
import {
  ACCEPT_ATTR,
  ALLOWED_MIME_LABEL,
  MAX_FILES,
  validateAttachmentFile,
} from '../components/attachment-policy';
import type { ComplaintPriority } from '../types/api';

const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintCreatePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();

  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
  const canSeeUsers = has('admin.users:read');

  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [priority, setPriority] = React.useState<ComplaintPriority>('normal');
  const [departmentId, setDepartmentId] = React.useState('');
  const [assignedTo, setAssignedTo] = React.useState('');
  const [originId, setOriginId] = React.useState('');
  const [subcategoryId, setSubcategoryId] = React.useState('');

  const subcatsQ = useQuery({
    queryKey: ['subcategories', departmentId],
    queryFn: () => SubcategoriesService.listForDepartment(departmentId),
    enabled: !!departmentId,
  });
  // Clear sub-category when department changes — it may belong to a
  // different department under the new selection.
  React.useEffect(() => {
    setSubcategoryId('');
  }, [departmentId]);

  // Cascade: assignee list narrows to active members of the chosen
  // department. The backend rejects mismatches; this just hides the
  // invalid choices.
  const usersQ = useQuery({
    queryKey: ['users-list', { departmentId }],
    queryFn: () =>
      UsersService.list({ pageSize: 200, isActive: true, departmentId: departmentId || undefined }),
    enabled: canSeeUsers && !!departmentId,
  });

  // Clear the assignee whenever the department changes — they may not be
  // a member of the new one.
  React.useEffect(() => {
    setAssignedTo('');
  }, [departmentId]);
  const [complaintDate, setComplaintDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const [pending, setPending] = React.useState<File[]>([]);
  const [over, setOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const queue = (file: File | null | undefined) => {
    if (!file) return;
    const err = validateAttachmentFile(file, pending.length);
    if (err) {
      toast.error(err);
      return;
    }
    setPending((s) => [...s, file]);
  };

  const removePending = (idx: number) => setPending((s) => s.filter((_, i) => i !== idx));

  const submit = async () => {
    setErrors({});
    setBusy(true);
    try {
      const c = await ComplaintsService.create({
        values,
        priority,
        departmentId: departmentId || undefined,
        assignedTo: assignedTo || undefined,
        complaintDate: complaintDate || undefined,
        originId,
        subcategoryId: subcategoryId || undefined,
      });

      const failures: string[] = [];
      for (const f of pending) {
        try {
          await ComplaintsService.uploadAttachment(c.id, f);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('attachment upload failed', f.name, err);
          failures.push(f.name);
        }
      }

      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['complaint', c.id, 'attachments'] });

      if (failures.length === 0) {
        toast.success(`Created ${c.referenceNo}`);
      } else {
        toast.error(
          `${c.referenceNo} created, but ${failures.length} attachment${failures.length > 1 ? 's' : ''} failed: ` +
          failures.join(', ') + '. Retry from the detail page.',
        );
      }
      nav(`/complaints/${c.id}`, { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { code?: string; errors?: Record<string, string[]> } } };
      if (e?.response?.data?.code === 'VALIDATION_FAILED' && e.response.data.errors) {
        setErrors(e.response.data.errors);
      }
      toast.error(errorMessage(err, 'Could not create complaint'));
    } finally {
      setBusy(false);
    }
  };

  if (fieldsQ.isLoading) return <p className="text-text-muted">Loading form…</p>;

  return (
    <section className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => nav('/complaints')} className="px-2">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">New complaint</h1>
          <p className="text-sm text-text-muted mt-1">
            Register a new patient feedback or incident.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Incident details" subtitle="When the complaint occurred and what was reported">
          <div className="field">
            <label className="text-[13px] font-medium text-text-main">Complaint date</label>
            <DateInput
              value={complaintDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setComplaintDate(e.target.value)}
            />
            <span className="hint">
              When the complaint actually occurred. Defaults to today; can be backdated for events recorded later.
            </span>
          </div>

          {(fieldsQ.data ?? []).map((f) => (
            <DynamicFieldRenderer
              key={f.id}
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              error={errors[f.key]?.join(', ')}
            />
          ))}
        </Card>

        <Card title="Classification" subtitle="Initial routing and priority assessment">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="field">
              <label className="text-[13px] font-medium text-text-main">Priority</label>
              <Select
                value={priority}
                onChange={(v) => setPriority(v as ComplaintPriority)}
                options={PRIORITIES.map((p) => ({ value: p, label: titleize(p) }))}
              />
            </div>

            <div className="field">
              <label className="text-[13px] font-medium text-text-main">
                Department <span className="text-danger">*</span>
              </label>
              <Select
                placeholder="Pick a department"
                value={departmentId}
                onChange={setDepartmentId}
                options={(departmentsQ.data ?? [])
                  .filter((d) => d.isActive)
                  .map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          </div>

          {departmentId && (subcatsQ.data ?? []).filter((s) => s.isActive).length > 0 && (
            <div className="field">
              <label className="text-[13px] font-medium text-text-main">
                Sub-category <span className="text-danger">*</span>
              </label>
              <Select
                placeholder="Pick a sub-category"
                value={subcategoryId}
                onChange={setSubcategoryId}
                options={(subcatsQ.data ?? [])
                  .filter((s) => s.isActive)
                  .map((s) => {
                    const dName = (departmentsQ.data ?? []).find((d) => d.id === departmentId)?.name ?? '';
                    return { value: s.id, label: dName ? `${dName}: ${s.name}` : s.name };
                  })}
              />
              {errors.subcategory && (
                <span className="text-danger text-xs">{errors.subcategory.join(', ')}</span>
              )}
            </div>
          )}

          <div className="field">
            <label className="text-[13px] font-medium text-text-main">
              Origin of complaint <span className="text-danger">*</span>
            </label>
            <Select
              placeholder="Pick an origin"
              value={originId}
              onChange={setOriginId}
              options={(originsQ.data ?? [])
                .filter((o) => o.isActive)
                .map((o) => ({ value: o.id, label: o.name }))}
            />
            {errors.origin && (
              <span className="text-danger text-xs">{errors.origin.join(', ')}</span>
            )}
          </div>

          {canSeeUsers && (
            <div className="field">
              <label className="text-[13px] font-medium text-text-main">Assigned to</label>
              <Select
                placeholder={departmentId ? 'Department queue' : 'Pick a department first'}
                value={assignedTo}
                onChange={setAssignedTo}
                disabled={!departmentId}
                allowClear
                clearLabel="Department queue"
                options={(usersQ.data?.data ?? []).map((u) => ({
                  value: u.id,
                  label: `${u.displayName} (${u.username})`,
                }))}
              />
              <span className="hint">
                {!departmentId
                  ? 'Pick a department first — the assignee list narrows to its active members.'
                  : (usersQ.data && usersQ.data.data.length === 0)
                  ? 'No active members in this department yet — leaves the complaint in the department queue.'
                  : 'Leave unassigned to route to the department queue. Reassignment later requires complaint:assign.'}
              </span>
            </div>
          )}
        </Card>

        <Card title="Attachments" subtitle={`Up to ${MAX_FILES} files · max 2 MB each · ${ALLOWED_MIME_LABEL}`}>
          {pending.length < MAX_FILES && (
            <div
              className={cn('dropzone', over && 'over')}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                queue(e.dataTransfer.files?.[0]);
              }}
            >
              <Paperclip className="text-text-subtle" size={24} />
              <p className="text-sm font-medium m-0">Click or drop a file here</p>
              <p className="text-xs text-text-muted m-0">
                {pending.length}/{MAX_FILES} queued · upload starts after the complaint is saved
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                  queue(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          )}
          {pending.length > 0 && (
            <ul className="space-y-2 mt-4 list-none p-0 m-0">
              {pending.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between p-2 rounded-md text-xs"
                  style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Check size={14} className="text-success shrink-0" />
                    <span className="font-medium truncate">{f.name}</span>
                    <span className="font-mono text-text-muted">({(f.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="px-1 py-0.5 h-auto" onClick={() => removePending(i)}>
                    <X size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Sticky footer aligned with the workspace area (sidebar width is dynamic). */}
        <div
          className="fixed bottom-0 right-0 bg-surface border-t border-border p-4 flex justify-end gap-3 z-30"
          style={{
            left: 'var(--cts-sidebar-width, 240px)',
            boxShadow: '0 -4px 10px rgb(0 0 0 / 0.02)',
          }}
        >
          <Button type="button" variant="secondary" onClick={() => nav('/complaints')}>
            Cancel
          </Button>
          <Button type="submit" icon={<Plus size={16} />} isLoading={busy}>
            Create complaint
          </Button>
        </div>
      </form>
    </section>
  );
}
