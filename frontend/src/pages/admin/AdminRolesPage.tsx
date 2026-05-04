import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PermissionsService, RolesService } from '../../services/roles.service';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import type { Permission, Role } from '../../types/api';

/**
 * Roles + permission grid editor.
 *
 * Layout:
 *   - Left: list of roles. Click a row to load its permissions.
 *   - Right: permission grid grouped by resource. Each cell is a checkbox.
 */
export function AdminRolesPage() {
  const { has } = usePermissions();
  const canManage = has('admin.roles:manage');
  const qc = useQueryClient();
  const toast = useToast();

  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => RolesService.list() });
  const permsQ = useQuery({ queryKey: ['permissions'], queryFn: () => PermissionsService.list() });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Auto-select the first role once data loads.
  useEffect(() => {
    if (selectedId == null && rolesQ.data && rolesQ.data.length > 0) {
      setSelectedId(rolesQ.data[0].id);
    }
  }, [rolesQ.data, selectedId]);

  const selected = rolesQ.data?.find((r) => r.id === selectedId) ?? null;

  const removeM = useMutation({
    mutationFn: (id: string) => RolesService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Deleted'); setSelectedId(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <section>
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Roles &amp; Permissions</h2>
        <span className="spacer" />
        {canManage && <Button onClick={() => setCreating(true)}>New role</Button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          {(rolesQ.data ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                background: selectedId === r.id ? 'var(--surface-2)' : 'transparent',
                borderLeft: selectedId === r.id ? '3px solid var(--primary)' : '3px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 500 }}>{r.name}</div>
              <div className="mono muted" style={{ fontSize: 12 }}>
                {r.key} {r.isSystem && <span className="badge" style={{ marginLeft: 4 }}>system</span>}
              </div>
            </button>
          ))}
        </div>

        <div>
          {selected ? (
            <RoleEditor
              role={selected}
              perms={permsQ.data ?? []}
              canManage={canManage}
              onDeleted={(id) => removeM.mutate(id)}
            />
          ) : (
            <div className="card"><p className="muted">Select a role to edit.</p></div>
          )}
        </div>
      </div>

      {creating && (
        <CreateRoleModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            setSelectedId(id);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}

function RoleEditor({
  role, perms, canManage, onDeleted,
}: { role: Role; perms: Permission[]; canManage: boolean; onDeleted: (id: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();

  // The current grant set isn't returned by the list endpoint; we maintain it
  // as a local "draft" the admin commits via Save. (A future GET /roles/:id
  // could pre-populate; phase-1 trade-off — kept simple.)
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');

  // Reset form whenever the selected role changes.
  useEffect(() => {
    setGranted(new Set());
    setName(role.name);
    setDescription(role.description ?? '');
  }, [role.id]);

  const grouped = useMemo(() => groupByResource(perms), [perms]);

  const saveM = useMutation({
    mutationFn: async () => {
      await RolesService.update(role.id, { name, description });
      await RolesService.setPermissions(role.id, [...granted]);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Saved'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggle = (pid: string) => {
    setGranted((s) => {
      const next = new Set(s);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{role.name}</h3>
        <span className="mono muted">{role.key}</span>
        {role.isSystem && <span className="badge">system</span>}
        <span className="spacer" />
        {canManage && !role.isSystem && (
          <Button variant="danger" onClick={() => { if (confirm(`Delete role "${role.name}"?`)) onDeleted(role.id); }}>
            Delete
          </Button>
        )}
      </div>

      <div className="field"><label>Name</label>
        <input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field"><label>Description</label>
        <textarea value={description} disabled={!canManage} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <h3>Permissions</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Tick to grant. Saving replaces the role's permission set with whatever's checked here.
      </p>
      <div className="col">
        {grouped.map((group) => (
          <div key={group.resource} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="mono" style={{ fontWeight: 600, marginBottom: 6 }}>{group.resource}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.actions.map((p) => (
                <label
                  key={p.id}
                  className="row"
                  style={{
                    background: 'var(--surface)',
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    cursor: canManage ? 'pointer' : 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={granted.has(p.id)}
                    disabled={!canManage}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="mono">{p.action}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="row-end" style={{ marginTop: 12 }}>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}

function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const m = useMutation({
    mutationFn: () => RolesService.create({ key, name, description: description || undefined }),
    onSuccess: (r) => { toast.success('Role created'); onCreated(r.id); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="New role"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="field"><label>Key (machine name)</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="pharmacy_lead" />
        <span className="hint">Lower-snake-case. Cannot be changed later.</span>
      </div>
      <div className="field"><label>Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field"><label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}

function groupByResource(perms: Permission[]): { resource: string; actions: Permission[] }[] {
  const map = new Map<string, Permission[]>();
  for (const p of perms) {
    if (!map.has(p.resource)) map.set(p.resource, []);
    map.get(p.resource)!.push(p);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([resource, actions]) => ({ resource, actions: actions.sort((a, b) => a.action.localeCompare(b.action)) }));
}
