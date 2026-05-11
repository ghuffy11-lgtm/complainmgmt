import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ComplaintsService } from '../services/complaints.service';
import { Button } from './ui/Button';
import { errorMessage, useToast } from './ui/Toast';
import { usePermissions } from '../hooks/usePermissions';
import { AttachmentViewer } from './AttachmentViewer';
import {
  ACCEPT_ATTR,
  ALLOWED_MIME_LABEL,
  MAX_FILES,
  validateAttachmentFile,
} from './attachment-policy';
import type { AttachmentMeta } from '../types/api';

type Props = { complaintId: string };

export function AttachmentsPanel({ complaintId }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const { has, user } = usePermissions();
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<AttachmentMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listQ = useQuery({
    queryKey: ['complaint', complaintId, 'attachments'],
    queryFn: () => ComplaintsService.listAttachments(complaintId),
  });

  const uploadM = useMutation({
    mutationFn: (file: File) => ComplaintsService.uploadAttachment(complaintId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'attachments'] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'audit'] });
      toast.success('Uploaded');
    },
    onError: (err) => toast.error(errorMessage(err, 'Upload failed')),
  });

  const deleteM = useMutation({
    mutationFn: (attId: string) => ComplaintsService.deleteAttachment(complaintId, attId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'attachments'] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId, 'audit'] });
      toast.success('Deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Delete failed')),
  });

  const accept = (file: File | null | undefined) => {
    if (!file) return;
    const err = validateAttachmentFile(file, listQ.data?.length ?? 0);
    if (err) {
      toast.error(err);
      return;
    }
    uploadM.mutate(file);
  };

  const canUpload = has('complaint:update') && (listQ.data?.length ?? 0) < MAX_FILES;

  const download = async (att: AttachmentMeta) => {
    try {
      const { url, revoke } = await ComplaintsService.fetchAttachmentBlob(complaintId, att.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(revoke, 0);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    }
  };

  // Owner can always delete their own; deleting other people's needs the
  // explicit `complaint.attachment:delete_any` permission (seeded for admin
  // + supervisor). The backend enforces the same rule.
  const canDelete = (att: AttachmentMeta) =>
    String(att.uploadedBy) === String(user?.id) || has('complaint.attachment:delete_any');

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Attachments</h3>
      <p className="muted no-print" style={{ marginTop: 0 }}>
        Up to {MAX_FILES} files · max 2 MB each · {ALLOWED_MIME_LABEL}.
      </p>

      {canUpload && (
        <div
          className={`dropzone no-print ${over ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            accept(e.dataTransfer.files?.[0]);
          }}
        >
          {uploadM.isPending ? 'Uploading…' : 'Click or drop a file here to upload'}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}

      {listQ.isLoading && <p className="muted">Loading…</p>}
      {listQ.data && listQ.data.length === 0 && <p className="muted">No attachments yet.</p>}
      {listQ.data && listQ.data.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th className="no-print"></th></tr>
          </thead>
          <tbody>
            {listQ.data.map((a) => (
              <tr key={a.id}>
                <td>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    onClick={() => setViewing(a)}
                    title="Click to preview"
                  >{a.filename}</button>
                </td>
                <td className="mono muted">{a.mimeType}</td>
                <td className="mono">{(a.byteSize / 1024).toFixed(1)} KB</td>
                <td className="mono muted">{new Date(a.uploadedAt).toLocaleString()}</td>
                <td className="right no-print">
                  <Button variant="ghost" onClick={() => download(a)}>Download</Button>
                  {canDelete(a) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${a.filename}"?`)) deleteM.mutate(a.id);
                      }}
                    >Delete</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AttachmentViewer
        open={!!viewing}
        attachment={viewing}
        complaintId={complaintId}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
