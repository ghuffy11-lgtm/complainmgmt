import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { DepartmentsService } from '../../services/departments.service';
import { SubcategoriesService } from '../../services/subcategories.service';
import type { Subcategory } from '../../types/api';

export function AdminSubcategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.departments:manage');

  const deptsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const [deptId, setDeptId] = useState<string>('');

  useEffect(() => {
    if (!deptId && deptsQ.data && deptsQ.data.length > 0) {
      const first = deptsQ.data.find((d) => d.isActive) ?? deptsQ.data[0];
      setDeptId(first.id);
    }
  }, [deptId, deptsQ.data]);

  const subsQ = useQuery({
    queryKey: ['subcategories', deptId],
    queryFn: () => SubcategoriesService.listForDepartment(deptId),
    enabled: !!deptId,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subcategory | null>(null);

  const toggleM = useMutation({
    mutationFn: (s: Subcategory) => SubcategoriesService.update(s.id, { isActive: !s.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
      toast.success('Updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-text-main m-0">Sub-categories</h3>
          <Select
            size="sm"
            className="w-[220px]"
            value={deptId}
            onChange={setDeptId}
            options={(deptsQ.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {canManage && deptId && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New sub-category
          </Button>
        )}
      </div>

      {subsQ.isLoading && <p className="muted p-4">Loading…</p>}
      {subsQ.data && subsQ.data.length === 0 && (
        <p className="muted p-4">
          No sub-categories yet. New complaints for this department will skip the sub-category
          step until you add one.
        </p>
      )}
      {subsQ.data && subsQ.data.length > 0 && (
        <table>
          <thead>
            <tr><th>Key</th><th>Name</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {subsQ.data.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.key}</td>
                <td>{s.name}</td>
                <td>
                  {s.isActive
                    ? <span className="badge badge-success">active</span>
                    : <span className="badge">inactive</span>}
                </td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                      <Button variant="ghost" onClick={() => toggleM.mutate(s)}>
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && deptId && (
        <CreateModal
          departmentId={deptId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditModal
          sub={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function CreateModal({
  departmentId, onClose, onCreated,
}: { departmentId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => SubcategoriesService.create(departmentId, { key, name }),
    onSuccess: () => { toast.success('Created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title="New sub-category" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Creating…' : 'Create'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Key</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="network" />
        <span className="hint">Lower-snake-case. Used internally.</span>
      </div>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Network" />
      </div>
    </Modal>
  );
}

function EditModal({
  sub, onClose, onSaved,
}: { sub: Subcategory; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(sub.name);
  const m = useMutation({
    mutationFn: () => SubcategoriesService.update(sub.id, { name }),
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title={`Edit — ${sub.key}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Saving…' : 'Save'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Modal>
  );
}
