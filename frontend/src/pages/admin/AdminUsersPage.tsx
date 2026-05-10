import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersService } from '../../services/users.service';
import { RolesService } from '../../services/roles.service';
import { DepartmentsService } from '../../services/departments.service';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import type { Department, Role, UserSummary } from '../../types/api';

function isLocked(u: UserSummary): boolean {
  if (!u.lockedUntil) return false;
  return new Date(u.lockedUntil).getTime() > Date.now();
}

export function AdminUsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.users:manage');
  const canUnlock = has('user:unlock');
  const canReset2fa = has('user:reset_2fa');
  const [unlocking, setUnlocking] = useState<UserSummary | null>(null);
  const [resetting2fa, setResetting2fa] = useState<UserSummary | null>(null);

  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => UsersService.list(1, 200) });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => RolesService.list() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });

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

  const unlockM = useMutation({
    mutationFn: (u: UserSummary) => UsersService.unlock(u.id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(result.unlocked ? 'User unlocked' : 'User was already unlocked');
      setUnlocking(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reset2faM = useMutation({
    mutationFn: (u: UserSummary) => UsersService.resetTwoFactor(u.id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(
        result.wasEnrolled
          ? '2FA reset — the user will be prompted to re-enroll on next login.'
          : 'User was not enrolled in 2FA; nothing changed.',
      );
      setResetting2fa(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-main m-0">Users</h3>
        {canManage && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New user</Button>
        )}
      </div>
      {usersQ.isLoading && <p className="muted p-4">Loading…</p>}
      {usersQ.data && (
        <table>
          <thead>
            <tr>
              <th>Username</th><th>Display name</th><th>Email</th><th>Department</th>
              <th>Active</th><th>Last login</th><th></th>
            </tr>
          </thead>
          <tbody>
            {usersQ.data.data.map((u) => {
              const deptName = u.departmentId
                ? departmentsQ.data?.find((d) => d.id === u.departmentId)?.name
                : null;
              return (
              <tr key={u.id}>
                <td className="mono">{u.username}</td>
                <td>{u.displayName}</td>
                <td className="mono muted">{u.email ?? '—'}</td>
                <td>{deptName ?? <span className="muted">—</span>}</td>
                <td>
                  {isLocked(u) ? (
                    <span
                      className="badge badge-warn"
                      title={`Locked until ${new Date(u.lockedUntil!).toLocaleString()}`}
                    >
                      locked
                    </span>
                  ) : u.isActive ? (
                    <span className="badge badge-success">active</span>
                  ) : (
                    <span className="badge">inactive</span>
                  )}
                </td>
                <td className="mono muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                <td className="right">
                  {canUnlock && isLocked(u) && (
                    <Button variant="ghost" onClick={() => setUnlocking(u)}>Unlock</Button>
                  )}
                  {canReset2fa && u.twoFactorEnrolled && (
                    <Button variant="ghost" onClick={() => setResetting2fa(u)}>Reset 2FA</Button>
                  )}
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
              );
            })}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateUserModal
          roles={rolesQ.data ?? []}
          departments={departmentsQ.data ?? []}
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
          departments={departmentsQ.data ?? []}
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
      {resetting2fa && (
        <Modal
          open
          onClose={() => setResetting2fa(null)}
          title={`Reset 2FA — ${resetting2fa.username}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetting2fa(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => reset2faM.mutate(resetting2fa)}
                disabled={reset2faM.isPending}
              >
                {reset2faM.isPending ? 'Resetting…' : 'Reset 2FA'}
              </Button>
            </>
          }
        >
          <p className="text-sm m-0 mb-2">
            This clears <strong>{resetting2fa.username}</strong>'s authenticator secret and all
            backup codes. The user will be prompted to enroll again on their next login.
          </p>
          <p className="muted text-xs m-0">
            Use this when the user has lost both their authenticator and their backup codes.
            All of their sessions will be signed out. The action is recorded in the Login Activity
            audit log under <span className="mono">2fa.reset_by_admin</span>.
          </p>
        </Modal>
      )}
      {unlocking && (
        <Modal
          open
          onClose={() => setUnlocking(null)}
          title={`Unlock ${unlocking.username}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUnlocking(null)}>Cancel</Button>
              <Button onClick={() => unlockM.mutate(unlocking)} disabled={unlockM.isPending}>
                {unlockM.isPending ? 'Unlocking…' : 'Unlock user'}
              </Button>
            </>
          }
        >
          <p>
            This will clear the failed-login counter and lift the lock on{' '}
            <strong>{unlocking.username}</strong>. They can attempt to log in immediately.
          </p>
          {unlocking.lockedUntil && (
            <p className="muted text-xs mt-2 m-0">
              Currently locked until{' '}
              <span className="mono">{new Date(unlocking.lockedUntil).toLocaleString()}</span>.
            </p>
          )}
          <p className="muted text-xs mt-2 m-0">
            The action is recorded in the Login Activity audit log under{' '}
            <span className="mono">account.unlocked_by_admin</span>.
          </p>
        </Modal>
      )}
    </Card>
  );
}

function CreateUserModal({
  roles, departments, onClose, onCreated,
}: { roles: Role[]; departments: Department[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string>('');

  const m = useMutation({
    mutationFn: () =>
      UsersService.create({
        username, displayName,
        email: email || undefined,
        password, roleIds,
        departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
        departmentId: primaryId || undefined,
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
      <DepartmentPicker
        departments={departments}
        memberships={departmentIds}
        primaryId={primaryId}
        onChange={(next) => {
          setDepartmentIds(next.memberships);
          setPrimaryId(next.primaryId);
        }}
      />
      <div className="field"><label>Roles</label>
        <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
      </div>
    </Modal>
  );
}

function EditUserModal({
  user, roles, departments, onClose, onSaved,
}: { user: UserSummary; roles: Role[]; departments: Department[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? '');
  const [departmentIds, setDepartmentIds] = useState<string[]>(user.departmentIds ?? []);
  const [primaryId, setPrimaryId] = useState<string>(user.departmentId ?? '');
  // Pre-populate from the user's current roles. The role-picker checkbox
  // state is now authoritative on save — unticking a role actually
  // removes it (used to be: empty array meant "leave alone", which made
  // it impossible to clear a role from the modal and broke the mental
  // model of "what I see is what I get").
  const [roleIds, setRoleIds] = useState<string[]>(user.roleIds ?? []);

  const updateM = useMutation({
    mutationFn: async () => {
      await UsersService.update(user.id, {
        displayName,
        email: email || null,
        departmentIds,
        departmentId: primaryId === '' ? null : primaryId,
      });
      // Always sync roles — if the user un-ticked everything, that's an
      // intentional "remove all roles" rather than "no change".
      await UsersService.setRoles(user.id, roleIds);
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
      <DepartmentPicker
        departments={departments}
        memberships={departmentIds}
        primaryId={primaryId}
        onChange={(next) => {
          setDepartmentIds(next.memberships);
          setPrimaryId(next.primaryId);
        }}
      />
      <div className="field"><label>Roles</label>
        <span className="hint">
          Tick the roles this user should have. Saving sets the role list to exactly what's
          checked — un-ticking removes that role from the user.
        </span>
        <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
      </div>
    </Modal>
  );
}

/** Multi-checkbox department membership editor with a primary radio.
 *  Emits both lists at once so the parent never holds a primary that isn't
 *  one of the memberships (the backend rejects that combo). */
function DepartmentPicker({
  departments,
  memberships,
  primaryId,
  onChange,
}: {
  departments: Department[];
  memberships: string[];
  primaryId: string;
  onChange: (next: { memberships: string[]; primaryId: string }) => void;
}) {
  const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name));
  const setMembership = (id: string, on: boolean) => {
    let nextMemberships = on
      ? Array.from(new Set([...memberships, id]))
      : memberships.filter((d) => d !== id);
    let nextPrimary = primaryId;
    if (!on && primaryId === id) nextPrimary = nextMemberships[0] ?? '';
    if (on && !primaryId) nextPrimary = id;
    onChange({ memberships: nextMemberships, primaryId: nextPrimary });
  };
  const setPrimary = (id: string) => {
    if (!memberships.includes(id)) {
      // Promoting a non-member also adds them as a member.
      onChange({ memberships: [...memberships, id], primaryId: id });
    } else {
      onChange({ memberships, primaryId: id });
    }
  };

  // Active departments are the only ones we want bulk-selectable —
  // inactive rows aren't a normal target. `allActiveSelected` flips the
  // toggle's label and behaviour: true → "Clear all" (deselect actives),
  // false → "Select all" (add every active to memberships, preserving
  // any inactive ones already in the set).
  const activeIds = sorted.filter((d) => d.isActive).map((d) => d.id);
  const allActiveSelected =
    activeIds.length > 0 && activeIds.every((id) => memberships.includes(id));
  const toggleAll = () => {
    if (allActiveSelected) {
      const next = memberships.filter((id) => !activeIds.includes(id));
      const nextPrimary = next.includes(primaryId) ? primaryId : '';
      onChange({ memberships: next, primaryId: nextPrimary });
    } else {
      const next = Array.from(new Set([...memberships, ...activeIds]));
      const nextPrimary = primaryId || activeIds[0] || '';
      onChange({ memberships: next, primaryId: nextPrimary });
    }
  };

  return (
    <div className="field">
      <div className="flex items-center justify-between">
        <label className="m-0">Departments</label>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-primary hover:underline bg-transparent border-0 cursor-pointer p-0"
        >
          {allActiveSelected ? 'Clear all' : `Select all (${activeIds.length})`}
        </button>
      </div>
      <span className="hint">
        Tick every department this user belongs to. The starred row is the primary —
        used to default form pickers and label the dashboard scope.
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        {sorted.map((d) => {
          const isMember = memberships.includes(d.id);
          const isPrimary = primaryId === d.id;
          return (
            <label
              key={d.id}
              className="row"
              style={{
                background: isMember ? 'var(--surface-2)' : 'transparent',
                padding: '6px 10px',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                opacity: d.isActive ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={isMember}
                onChange={(e) => setMembership(d.id, e.target.checked)}
                disabled={!d.isActive && !isMember}
              />
              <span style={{ flex: 1 }}>
                {d.name}
                {!d.isActive && <span className="muted"> (inactive)</span>}
              </span>
              <button
                type="button"
                onClick={() => setPrimary(d.id)}
                title={isPrimary ? 'Primary department' : 'Make primary'}
                className={cn(
                  'bg-transparent border-0 cursor-pointer text-base',
                  isPrimary ? 'text-warn' : 'text-text-subtle',
                )}
              >
                {isPrimary ? '★' : '☆'}
              </button>
            </label>
          );
        })}
      </div>
    </div>
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
