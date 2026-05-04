import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'node:stream';
import { AttachmentEntity } from './entities/attachment.entity';
import { AttachmentMetaInput, IAttachmentStore } from './attachment-store.interface';

/**
 * Store attachment bytes in `complaint_attachments.content` (BYTEA).
 *
 * `storageRef` is the row id. Future S3 / NAS implementations will swap this
 * out without touching meta storage; the `complaint_attachments` row itself
 * is the metadata header in either case.
 */
@Injectable()
export class DbAttachmentStore implements IAttachmentStore {
  constructor(@InjectRepository(AttachmentEntity) private readonly repo: Repository<AttachmentEntity>) {}

  async put(input: { complaintId: string; bytes: Buffer; meta: AttachmentMetaInput }): Promise<{ storageRef: string }> {
    const row = await this.repo.save(
      this.repo.create({
        complaintId: input.complaintId,
        filename: input.meta.filename,
        mimeType: input.meta.mimeType,
        byteSize: input.meta.byteSize,
        sha256: input.meta.sha256,
        uploadedBy: input.meta.uploadedBy,
        content: input.bytes,
      }),
    );
    return { storageRef: row.id };
  }

  async getStream(storageRef: string): Promise<NodeJS.ReadableStream> {
    const row = await this.repo.findOne({ where: { id: storageRef } });
    if (!row) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });
    // 2 MB max — load into memory and wrap as a stream so the API surface
    // matches future S3/FS stores that genuinely stream.
    return Readable.from(row.content);
  }

  async delete(storageRef: string): Promise<void> {
    await this.repo.delete({ id: storageRef });
  }
}
