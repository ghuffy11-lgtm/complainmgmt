/**
 * IAttachmentStore — pluggable storage for attachment bytes.
 *
 * Phase 1: DbAttachmentStore (bytes in `complaint_attachments.content`).
 * Future:  S3AttachmentStore, FsAttachmentStore — meta still in Postgres,
 *          only the bytes move.
 */
export interface IAttachmentStore {
  put(input: { complaintId: string; bytes: Buffer; meta: AttachmentMetaInput }): Promise<{ storageRef: string }>;
  getStream(storageRef: string): Promise<NodeJS.ReadableStream>;
  delete(storageRef: string): Promise<void>;
}

export type AttachmentMetaInput = {
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: Buffer;
  uploadedBy: string;
};
