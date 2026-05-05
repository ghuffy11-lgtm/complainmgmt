import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { DepartmentsService } from '../services/departments.service';
import { UsersService } from '../services/users.service';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { errorMessage, useToast } from './ui/Toast';

type Props = {
  open: boolean;
  complaintId: string;
  current: { departmentId: string | null; assignedTo: string | null };
  onClose: () => void;
  canSeeUsers: boolean;
};

export function AssignmentDialog({ open, complaintId, current, onClose, canSeeUsers }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [departmentId, setDepartmentId] = useState<string | null>(current.departmentId);
  const [userId, setUserId] = useState<string | null>(current.assignedTo);
  const [note, setNote] = useState('');

  const departmentsQ = useQuery({
    queryKey: ['departments'],
    queryFn: () => DepartmentsService.list(),
    enabled: open,
  });
  // Cascade: assignee list narrows to active members of the chosen department.
  // The backend rejects mismatches anyway (USER_NOT_IN_DEPARTMENT), so this
  // is defence-in-depth + a better UX (no invalid options shown).
  const usersQ = useQuery({
    queryKey: ['users-list', { departmentId }],
    queryFn: () =>
      UsersService.list({ pageSize: 200, isActive: true, departmentId: departmentId ?? undefined }),
    enabled: open && canSeeUsers && !!departmentId,
  });

  // Clear assignee when the department changes — they may not be a member of
  // the new one. (If the previously-selected user IS in the new dept, the
  // effect below will re-pick them.)
  useEffect(() => {
    if (!departmentId) {
      setUserId(null);
      return;
    }
    if (userId && usersQ.data) {
      const stillValid = usersQ.data.data.some((u) => u.id === userId);
      if (!stillValid) setUserId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, usersQ.data]);

  const assignM = useMutation({
    mutationFn: () =>
      ComplaintsService.assign(complaintId, {
        departmentId: departmentId || null,
        assignedTo: userId || null,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'history'] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      toast.success('Assignment updated');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not assign')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign complaint"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => assignM.mutate()} disabled={assignM.isPending || !departmentId}>
            {assignM.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Department</label>
        <select value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value || null)}>
          <option value="">— pick a department —</option>
          {(departmentsQ.data ?? []).filter((d) => d.isActive).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <span className="hint">Required. The assignee list below narrows to members of this department.</span>
      </div>

      {canSeeUsers && (
        <div className="field">
          <label>Assigned to (optional)</label>
          <select
            value={userId ?? ''}
            onChange={(e) => setUserId(e.target.value || null)}
            disabled={!departmentId}
          >
            <option value="">— department queue —</option>
            {(usersQ.data?.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>
            ))}
          </select>
          {departmentId && usersQ.data && usersQ.data.data.length === 0 && (
            <span className="hint">No active members in this department yet.</span>
          )}
        </div>
      )}

      <div className="field">
        <label>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}
