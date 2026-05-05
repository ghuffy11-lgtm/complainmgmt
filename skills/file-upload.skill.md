# Skill — File Upload

## Purpose

Attach up to 3 documents per complaint, each ≤ 2 MB, stored in the database. Designed so that switching to S3/NAS later is an interface swap.

## Inputs / outputs

```
upload(complaintId, file, actor): AttachmentMeta
list(complaintId, actor): AttachmentMeta[]
download(complaintId, attachmentId, actor): { meta, stream }
remove(complaintId, attachmentId, actor): void
```

`AttachmentMeta`:

```ts
type AttachmentMeta = {
  id: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: number;
  uploadedAt: string;
  sha256: string;        // hex
};
```

## Logic

### Limits

- Per-complaint cap: **3** attachments. Enforced both in the service (count query inside the same transaction) and by a Postgres trigger as belt-and-braces.
- Per-file cap: **2 MB**. Enforced at:
  - NGINX `client_max_body_size 3m;` (with margin for multipart overhead).
  - NestJS `FileSizeValidator`.
  - DB column `CHECK (byte_size <= 2097152)`.

### Validation

1. **MIME sniffing.** The server determines MIME from the bytes (`file-type` package), not from the client `Content-Type` header. The reported `mime_type` in DB is the sniffed value.
2. **Allow-list.** Configurable via system settings. Default (migration `0012`): `application/pdf`, `image/png`, `image/jpeg`, `image/webp`. Other types → `415 MIME_NOT_ALLOWED`. Operators can broaden the list via Admin → Settings; the default is intentionally narrow because complaint attachments are evidence (photos, scanned letters, PDFs) and the inline viewer only renders these formats.
3. **Filename sanitization.** Path components stripped, control chars removed, length capped at 200.
4. **SHA-256** computed during read; stored as `BYTEA`. Useful for dedup and for detecting silent corruption later.

### Storage interface

```ts
interface IAttachmentStore {
  put(meta: AttachmentMeta, bytes: Buffer): Promise<{ storageRef: string }>;
  get(storageRef: string): Promise<NodeJS.ReadableStream>;
  delete(storageRef: string): Promise<void>;
}
```

Phase 1 implementation: `DbAttachmentStore` — `bytes` go into `complaint_attachments.content`, `storageRef` is the row id.
Future implementations: `S3AttachmentStore`, `FsAttachmentStore` for NAS — meta still lives in Postgres, only the bytes move.

### Download

- Streams `Content-Disposition: attachment; filename="…"` with the sanitized filename.
- Sets `Content-Type` to the **sniffed** MIME (not user-supplied).
- Sets `Cache-Control: private, no-store` — attachments may be sensitive.
- ETag = `sha256` so re-fetches are cheap.

### Audit

Upload and delete each emit an audit row with `field_key='__attachment__'`, `action='attachment.added'` / `'attachment.removed'`, and `{ filename, byteSize, sha256 }` in the value. The bytes themselves are never put into the audit log.

## Edge cases

- **Concurrent uploads pushing past 3** — the count + insert run in the same transaction with `SELECT COUNT(*) … FOR UPDATE` on the parent complaint row. Two concurrent uploaders cannot both succeed past the cap.
- **Zero-byte file** — rejected (`CHECK (byte_size > 0)`).
- **Disguised binary** (e.g. `.pdf` extension on a `.exe` file) — sniffing catches it; the file is rejected at the MIME allow-list step.
- **Long filenames / unicode** — sanitization keeps the basename only and truncates to 200 chars (NFC normalize first).
- **Large body size attack** — NGINX rejects bodies above the cap before they hit the backend.
- **Sha collision** — not a security concern at our scale (we don't dedupe at write time; sha is for integrity).

## Create-time attachments (UI flow)

The complaint create form lets operators queue attachments before saving.
Files are *not* posted as part of the create body — that would require a
multipart create endpoint and an atomic insert path. Instead:

```
1. POST /complaints                      → returns the new complaint id
2. for each queued file:
     POST /complaints/<id>/attachments
3. Navigate to the detail page
```

If the complaint creates successfully but a per-file upload fails (typically
a server-side MIME sniff that disagrees with the file's extension), the
client surfaces a warning toast naming the failures and navigates to the
detail page anyway — the user retries from the AttachmentsPanel. This is
"warning-and-continue": acceptable for the typical hospital workflow because
the user is right there to fix the rejected file, and atomic create+upload
would force a much bigger backend change (multipart create endpoint,
streaming MIME sniff during create-time validation, etc.).

## Inline viewer

The list now opens an `AttachmentViewer` modal on filename click. It uses
the same auth-aware blob-fetch path as download, then renders:

- `image/*` → `<img>` (max 70vh)
- `application/pdf` → `<embed>` (browsers render natively)
- anything else → "Preview unavailable" message + Download button

Because the system allow-list is narrowed to image+PDF, the third branch is
defence-in-depth — it only triggers if an operator broadened the policy.

## Reusability notes

- The `IAttachmentStore` interface is the single extension point. Everything else (validation, audit, count cap) is store-agnostic.
- The same service handles "remove on complaint delete" via the FK cascade — no manual cleanup needed in DB-store mode. For external stores, a post-commit hook on complaint delete iterates `storageRef`s and calls `store.delete`.
