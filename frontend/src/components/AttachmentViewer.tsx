import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ComplaintsService } from '../services/complaints.service';
import { errorMessage, useToast } from './ui/Toast';
import type { AttachmentMeta } from '../types/api';

type Props = {
  open: boolean;
  attachment: AttachmentMeta | null;
  complaintId: string;
  onClose: () => void;
};

/**
 * Inline viewer for image / PDF attachments.
 *
 * The system allow-list (system_settings.attachments.allowed_mime_types) is
 * restricted to images + PDF, so reaching the viewer means we know how to
 * render the bytes. We stream via `fetchAttachmentBlob` (same auth-aware
 * code path used for downloads) and present a blob: URL to <img> / <embed>.
 *
 * Blob URLs are revoked on close to free the in-memory copy.
 */
export function AttachmentViewer({ open, attachment, complaintId, onClose }: Props) {
  const toast = useToast();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !attachment) return;
    let revoke = () => {};
    let cancelled = false;
    setError(null);
    setBlobUrl(null);
    ComplaintsService.fetchAttachmentBlob(complaintId, attachment.id)
      .then((r) => {
        if (cancelled) {
          r.revoke();
          return;
        }
        setBlobUrl(r.url);
        revoke = r.revoke;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err, 'Could not load file'));
      });
    return () => {
      cancelled = true;
      revoke();
    };
  }, [open, attachment, complaintId]);

  if (!open || !attachment) return null;

  const isImage = attachment.mimeType.startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';

  const download = async () => {
    try {
      const { url, revoke } = await ComplaintsService.fetchAttachmentBlob(complaintId, attachment.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(revoke, 0);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`${attachment.filename} · ${(attachment.byteSize / 1024).toFixed(1)} KB`}
      footer={
        <>
          <Button variant="secondary" onClick={download}>Download</Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {error && <p className="danger">{error}</p>}
      {!error && !blobUrl && <p className="muted">Loading…</p>}

      {/* Image preview */}
      {!error && blobUrl && isImage && (
        <div style={{ display: 'grid', placeItems: 'center', maxHeight: '70vh', overflow: 'auto' }}>
          <img
            src={blobUrl}
            alt={attachment.filename}
            style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }}
          />
        </div>
      )}

      {/* PDF preview */}
      {!error && blobUrl && isPdf && (
        <embed
          src={blobUrl}
          type="application/pdf"
          style={{ width: '100%', height: '70vh', border: '1px solid var(--border)' }}
        />
      )}

      {/* Defence-in-depth: if an admin has loosened the policy and an unsupported
          type sneaks through, give the user a clean download instead of a
          broken element. */}
      {!error && blobUrl && !isImage && !isPdf && (
        <p className="muted">
          Preview unavailable for this MIME type ({attachment.mimeType}). Use Download.
        </p>
      )}
    </Modal>
  );
}
