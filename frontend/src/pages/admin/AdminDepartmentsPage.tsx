import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DepartmentsService } from '../../services/departments.service';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import type { Department } from '../../types/api';

export function AdminDepartmentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.departments:manage');

  const q = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const toggleM = useMutation({
    mutationFn: (d: Department) => DepartmentsService.update(d.id, { isActive: !d.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast.success('Updated'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-main m-0">Departments</h3>
        {canManage && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New department</Button>
        )}
      </div>

      {q.isLoading && <p className="muted p-4">Loading…</p>}
      {q.data && (
        <table>
          <thead><tr><th>Key</th><th>Name</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {q.data.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.key}</td>
                <td>{d.name}</td>
                <td>{d.isActive
                  ? <span className="badge badge-success">active</span>
                  : <span className="badge">inactive</span>}</td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                      <Button variant="ghost" onClick={() => toggleM.mutate(d)}>
                        {d.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['departments'] }); setCreating(false); }}
        />
      )}
      {editing && (
        <EditModal
          dept={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['departments'] }); setEditing(null); }}
        />
      )}
    </Card>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => DepartmentsService.create({ key, name }),
    onSuccess: () => { toast.success('Created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title="New department" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? 'Creating…' : 'Create'}</Button>
      </>
    }>
      <div className="field"><label>Key</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="pharmacy" />
        <span className="hint">Lower-snake-case. Used internally.</span>
      </div>
      <div className="field"><label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pharmacy" />
      </div>
    </Modal>
  );
}

function EditModal({ dept, onClose, onSaved }: { dept: Department; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(dept.name);
  const m = useMutation({
    mutationFn: () => DepartmentsService.update(dept.id, { name }),
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title={`Edit — ${dept.key}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Save'}</Button>
      </>
    }>
      <div className="field"><label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Modal>
  );
}
