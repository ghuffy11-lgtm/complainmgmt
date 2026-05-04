import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersService } from '../../services/users.service';
import { RolesService } from '../../services/roles.service';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import type { Role, UserSummary } from '../../types/api';

export function AdminUsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.users:manage');

  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => UsersService.list(1, 200) });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => RolesService.list() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [resetting, setResetting] = useState<UserSummary | null>(null);

  const toggleActiveM = useMutation({
    mutationFn: (u: UserSummary) => UsersService.update(u.id, { isActive: !u.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <section>
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <span className="spacer" />
        {canManage && <Button onClick={() => setCreating(true)}>New user</Button>}
      </div>

      {usersQ.isLoading && <p className="muted">Loading…</p>}
      {usersQ.data && (
        <table>
          <thead>
            <tr>
              <th>Username</th><th>Display name</th><th>Email</th><th>Provider</th>
              <th>Active</th><th>Last login</th><th></th>
            </tr>
          </thead>
          <tbody>
            {usersQ.data.data.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td>
                <td>{u.displayName}</td>
                <td className="mono muted">{u.email ?? '—'}</td>
                <td className="mono">{u.authProvider}</td>
                <td>{u.isActive
                  ? <span className="badge badge-success">active</span>
                  : <span className="badge">inactive</span>}</td>
                <td className="mono muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                      <Button variant="ghost" onClick={() => setResetting(u)}>Reset pw</Button>
                      <Button variant="ghost" onClick={() => toggleActiveM.mutate(u)}>
                        {u.isActive ? 'Deactivate' : 'Activate'}
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
        <CreateUserModal
          roles={rolesQ.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['users'] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          roles={rolesQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['users'] });
            setEditing(null);
          }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => setResetting(null)}
        />
      )}
    </section>
  );
}

function CreateUserModal({
  roles, onClose, onCreated,
}: { roles: Role[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const m = useMutation({
    mutationFn: () =>
      UsersService.create({
        username, displayName,
        email: email || undefined,
        password, roleIds,
      }),
    onSuccess: () => { toast.success('User created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err, 'Create failed')),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="New user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="field"><label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field"><label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="field"><label>Email (optional)</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field"><label>Initial password</label>
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">Min 10 chars. The user should change it on first login.</span>
      </div>
      <div className="field"><label>Roles</label>
        <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
      </div>
    </Modal>
  );
}

function EditUserModal({
  user, roles, onClose, onSaved,
}: { user: UserSummary; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? '');
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const updateM = useMutation({
    mutationFn: async () => {
      await UsersService.update(user.id, { displayName, email: email || null });
      if (roleIds.length > 0) await UsersService.setRoles(user.id, roleIds);
    },
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
            {updateM.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="field"><label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="field"><label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field"><label>Replace roles</label>
        <span className="hint">
          Pick one or more to replace this user's current roles. Leave all unchecked to keep them as-is.
        </span>
        <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user, onClose, onDone,
}: { user: UserSummary; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const m = useMutation({
    mutationFn: () => UsersService.resetPassword(user.id, password),
    onSuccess: () => { toast.success('Password reset'); onDone(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password — ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => m.mutate()} disabled={m.isPending || password.length < 10}>
            {m.isPending ? 'Saving…' : 'Reset'}
          </Button>
        </>
      }
    >
      <p className="muted">All of this user's sessions will be force-logged-out.</p>
      <div className="field"><label>New password</label>
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">Min 10 characters.</span>
      </div>
    </Modal>
  );
}

function RolePicker({
  roles, value, onChange,
}: { roles: Role[]; value: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {roles.map((r) => (
        <label
          key={r.id}
          className="row"
          style={{ background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 'var(--radius)', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={value.includes(r.id)} onChange={() => toggle(r.id)} />
          <span>{r.name}</span>
        </label>
      ))}
    </div>
  );
}
