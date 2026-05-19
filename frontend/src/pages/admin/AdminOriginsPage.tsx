import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { OriginsService } from '../../services/origins.service';
import type { Origin } from '../../types/api';

export function AdminOriginsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.departments:manage');

  const q = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Origin | null>(null);

  const toggleM = useMutation({
    mutationFn: (o: Origin) => OriginsService.update(o.id, { isActive: !o.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['origins'] }); toast.success('Updated'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-main m-0">Origins of complaint</h3>
        {canManage && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New origin
          </Button>
        )}
      </div>

      {q.isLoading && <p className="muted p-4">Loading…</p>}
      {q.data && (
        <table>
          <thead>
            <tr><th>Key</th><th>Name</th><th>Sort</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {q.data.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.key}</td>
                <td>{o.name}</td>
                <td className="mono">{o.sortOrder}</td>
                <td>
                  {o.isActive
                    ? <span className="badge badge-success">active</span>
                    : <span className="badge">inactive</span>}
                </td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(o)}>Edit</Button>
                      <Button variant="ghost" onClick={() => toggleM.mutate(o)}>
                        {o.isActive ? 'Deactivate' : 'Activate'}
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
          onCreated={() => { qc.invalidateQueries({ queryKey: ['origins'] }); setCreating(false); }}
        />
      )}
      {editing && (
        <EditModal
          origin={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['origins'] }); setEditing(null); }}
        />
      )}
    </Card>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const m = useMutation({
    mutationFn: () => OriginsService.create({
      key,
      name,
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
    }),
    onSuccess: () => { toast.success('Created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title="New origin" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Creating…' : 'Create'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Key</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="email" />
        <span className="hint">Lower-snake-case. Used internally.</span>
      </div>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Email" />
      </div>
      <div className="field">
        <label>Sort order</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="(auto)"
        />
        <span className="hint">Leave blank to append. Lower sorts first.</span>
      </div>
    </Modal>
  );
}

function EditModal({
  origin, onClose, onSaved,
}: { origin: Origin; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(origin.name);
  const [sortOrder, setSortOrder] = useState(String(origin.sortOrder));
  const m = useMutation({
    mutationFn: () => OriginsService.update(origin.id, {
      name,
      sortOrder: Number(sortOrder),
    }),
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title={`Edit — ${origin.key}`} footer={
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
      <div className="field">
        <label>Sort order</label>
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>
    </Modal>
  );
}
