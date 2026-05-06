import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { errorMessage, useToast } from './ui/Toast';
import type { ComplaintStatus } from '../types/api';

type Props = {
  open: boolean;
  complaintId: string;
  /** The currently-frozen status; informational, shown in the dialog body. */
  currentStatus: ComplaintStatus;
  onClose: () => void;
};

const REOPEN_TARGETS: { value: ComplaintStatus; label: string }[] = [
  { value: 'open',         label: 'Open' },
  { value: 'in_progress',  label: 'In progress' },
];

/**
 * Modal that takes a complaint from {closed, resolved} to a non-frozen
 * status. Records an optional note on the audit row so reviewers see the
 * justification next to the `reopen` action in the timeline.
 *
 * The status-change endpoint already enforces that this requires
 * `complaint:reopen`; the dialog is just one of two surface areas that
 * exercise it (the other is direct API calls for power users / scripts).
 */
export function ReopenDialog({ open, complaintId, currentStatus, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<ComplaintStatus>('open');
  const [note, setNote] = useState('');

  const m = useMutation({
    mutationFn: () =>
      // setStatus / dto.note both flow through to the audit row's `note`.
      ComplaintsService.setStatus(complaintId, target, note.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Reopened to "${target.replace('_', ' ')}"`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not reopen')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reopen complaint"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Reopen'}
          </Button>
        </>
      }
    >
      <p className="muted">
        Currently <strong>{currentStatus.replace('_', ' ')}</strong>. Reopening makes the complaint
        editable again. The action is recorded in the activity timeline as <strong>reopen</strong>{' '}
        with the note below.
      </p>
      <div className="field">
        <label>Reopen to</label>
        <Select
          value={target}
          onChange={(v) => setTarget(v as ComplaintStatus)}
          options={REOPEN_TARGETS.map((t) => ({ value: t.value, label: t.label }))}
        />
      </div>
      <div className="field">
        <label>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Reason for reopening — visible in the activity timeline." />
      </div>
    </Modal>
  );
}
