import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { DynamicFieldsService } from '../services/dynamic-fields.service';
import { DepartmentsService } from '../services/departments.service';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { Button } from '../components/ui/Button';
import { errorMessage, useToast } from '../components/ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
import type { ComplaintPriority } from '../types/api';

const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export function ComplaintCreatePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();

  const fieldsQ = useQuery({ queryKey: ['dynamic-fields'], queryFn: () => DynamicFieldsService.list() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [priority, setPriority] = useState<ComplaintPriority>('normal');
  const [departmentId, setDepartmentId] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const createM = useMutation({
    mutationFn: () =>
      ComplaintsService.create({
        values,
        priority,
        departmentId: departmentId || undefined,
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Created ${c.referenceNo}`);
      nav(`/complaints/${c.id}`, { replace: true });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { code?: string; errors?: Record<string, string[]> } } };
      if (e?.response?.data?.code === 'VALIDATION_FAILED' && e.response.data.errors) {
        setErrors(e.response.data.errors);
      }
      toast.error(errorMessage(err, 'Could not create complaint'));
    },
  });

  if (fieldsQ.isLoading) return <p className="muted">Loading form…</p>;

  return (
    <section>
      <h1>New complaint</h1>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          createM.mutate();
        }}
      >
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

        {has('complaint:assign') && (
          <div className="field">
            <label>Assign to department (optional)</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— unassigned —</option>
              {(departmentsQ.data ?? []).filter((d) => d.isActive).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="row-end" style={{ marginTop: 12 }}>
          <Button type="button" variant="secondary" onClick={() => nav('/complaints')}>Cancel</Button>
          <Button type="submit" disabled={createM.isPending}>
            {createM.isPending ? 'Creating…' : 'Create complaint'}
          </Button>
        </div>
      </form>
    </section>
  );
}
