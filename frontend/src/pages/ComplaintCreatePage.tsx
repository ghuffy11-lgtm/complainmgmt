import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { DepartmentsService } from '../services/departments.service';
import { UsersService } from '../services/users.service';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { Button } from '../components/ui/Button';
import { errorMessage, useToast } from '../components/ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
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
  const canSeeUsers = has('admin.users:read');
  const usersQ = useQuery({
    queryKey: ['users-list'],
    queryFn: () => UsersService.list(1, 200),
    enabled: canSeeUsers,
  });

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [priority, setPriority] = useState<ComplaintPriority>('normal');
  const [departmentId, setDepartmentId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [complaintDate, setComplaintDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Files queued in the form. They're not uploaded until the complaint is
  // created (and we know its id). On partial failure we navigate to the
  // detail page with a warning toast naming the failures — see submit().
  const [pending, setPending] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
      });

      // Upload queued files in order. Warning-and-continue on per-file
      // failure: the complaint is already created, so navigate the user to
      // detail with a clear message naming what didn't make it. They can
      // retry from the AttachmentsPanel.
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

  if (fieldsQ.isLoading) return <p className="muted">Loading form…</p>;

  return (
    <section>
      <h1>New complaint</h1>

      <form
        className="card"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="field">
          <label>Complaint date</label>
          <input
            type="date"
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

        <div className="field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as ComplaintPriority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Department (optional)</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">— unassigned —</option>
            {(departmentsQ.data ?? []).filter((d) => d.isActive).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {canSeeUsers && (
          <div className="field">
            <label>Assigned to (optional)</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— department queue —</option>
              {(usersQ.data?.data ?? []).filter((u) => u.isActive).map((u) => (
                <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>
              ))}
            </select>
            <span className="hint">
              Leave unassigned to route to the department queue. Reassignment later requires `complaint:assign`.
            </span>
          </div>
        )}

        {/* ─── Attachments queue ───────────────────────────────────────── */}
        <div className="field">
          <label>Attachments (optional)</label>
          <span className="hint">
            Up to {MAX_FILES} files · max 2 MB each · {ALLOWED_MIME_LABEL}. Files upload after the
            complaint is saved.
          </span>
          {pending.length < MAX_FILES && (
            <div
              className={`dropzone ${over ? 'over' : ''}`}
              style={{ marginTop: 6 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                queue(e.dataTransfer.files?.[0]);
              }}
            >
              Click or drop a file here ({pending.length}/{MAX_FILES} queued)
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                style={{ display: 'none' }}
                onChange={(e) => { queue(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          )}
          {pending.length > 0 && (
            <ul style={{ marginTop: 8, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pending.map((f, i) => (
                <li key={`${f.name}-${i}`} className="row" style={{
                  background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 'var(--radius)',
                }}>
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>{(f.size / 1024).toFixed(1)} KB</span>
                  <Button type="button" variant="ghost" onClick={() => removePending(i)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="row-end" style={{ marginTop: 12 }}>
          <Button type="button" variant="secondary" onClick={() => nav('/complaints')}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create complaint'}
          </Button>
        </div>
      </form>
    </section>
  );
}
