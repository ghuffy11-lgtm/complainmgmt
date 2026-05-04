import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AttachmentEntity } from './entities/attachment.entity';
import { ComplaintEntity } from '../complaints/entities/complaint.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user.type';
import { AppConfig } from '../../config/configuration';
import { DbAttachmentStore } from './db-attachment-store';
import {
  isMimeAllowed,
  sanitizeFilename,
  sniffMime,
} from './file-validation';

const DEFAULT_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: Date;
  sha256: string;            // hex
};

@Injectable()
export class AttachmentsService {
  private readonly maxFiles: number;
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(AttachmentEntity) private readonly repo: Repository<AttachmentEntity>,
    @InjectRepository(SystemSettingEntity) private readonly settings: Repository<SystemSettingEntity>,
    private readonly dataSource: DataSource,
    private readonly store: DbAttachmentStore,
    private readonly audit: AuditService,
    cfg: ConfigService,
  ) {
    const app = cfg.get<AppConfig>('app')!;
    this.maxFiles = app.attachments.maxFilesPerComplaint;
    this.maxBytes = app.attachments.maxBytes;
  }

  async list(complaintId: string): Promise<AttachmentMeta[]> {
    await this.assertComplaintExists(complaintId);
    const rows = await this.repo.find({ where: { complaintId }, order: { uploadedAt: 'ASC' } });
    return rows.map(this.toMeta);
  }

  async upload(
    complaintId: string,
    file: { originalname: string; buffer: Buffer; size: number },
    actor: AuthUser,
  ): Promise<AttachmentMeta> {
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException({ code: 'EMPTY_FILE' });
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', maxBytes: this.maxBytes });
    }

    const mime = await sniffMime(file.buffer);
    if (!mime) throw new UnsupportedMediaTypeException({ code: 'UNKNOWN_MIME' });

    const allowList = await this.allowedMimes();
    if (!isMimeAllowed(mime, allowList)) {
      throw new UnsupportedMediaTypeException({ code: 'MIME_NOT_ALLOWED', mimeType: mime });
    }

    const filename = sanitizeFilename(file.originalname);
    const sha = crypto.createHash('sha256').update(file.buffer).digest();

    return this.dataSource.transaction(async (em) => {
      // Lock the parent row so two concurrent uploads can't both pass the
      // count check. The DB trigger in 0004 backstops if this slips.
      const complaint = await em
        .getRepository(ComplaintEntity)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: complaintId })
        .getOne();
      if (!complaint) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });

      const count = await em.getRepository(AttachmentEntity).count({ where: { complaintId } });
      if (count >= this.maxFiles) {
        throw new BadRequestException({ code: 'ATTACHMENT_CAP_EXCEEDED', max: this.maxFiles });
      }

      const row = await em.getRepository(AttachmentEntity).save(
        em.getRepository(AttachmentEntity).create({
          complaintId,
          filename,
          mimeType: mime,
          byteSize: file.size,
          sha256: sha,
          content: file.buffer,
          uploadedBy: String(actor.id),
        }),
      );

      await this.audit.recordChange({
        em,
        complaintId,
        fieldKey: '__attachment__',
        action: 'attachment.added',
        oldValue: null,
        newValue: { id: row.id, filename, mimeType: mime, byteSize: file.size, sha256: sha.toString('hex') },
        actorId: String(actor.id),
      });

      return this.toMeta(row);
    });
  }

  /**
   * Streams the bytes back. Caller is expected to set the response headers
   * appropriate to the returned MimeType, sanitised filename, and ETag.
   */
  async download(
    complaintId: string,
    attachmentId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; meta: AttachmentMeta }> {
    const row = await this.findRow(complaintId, attachmentId);
    const stream = await this.store.getStream(row.id);
    return { stream, meta: this.toMeta(row) };
  }

  async remove(complaintId: string, attachmentId: string, actor: AuthUser): Promise<void> {
    return this.dataSource.transaction(async (em) => {
      const row = await em
        .getRepository(AttachmentEntity)
        .findOne({ where: { id: attachmentId, complaintId } });
      if (!row) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });

      // Owner can delete their own; otherwise the caller must hold complaint:update.
      const isOwner = String(row.uploadedBy) === String(actor.id);
      const canManage = actor.permissions.has('complaint:update');
      if (!isOwner && !canManage) {
        throw new ForbiddenException({ code: 'RBAC_DENIED' });
      }

      await em.getRepository(AttachmentEntity).delete({ id: row.id });

      await this.audit.recordChange({
        em,
        complaintId,
        fieldKey: '__attachment__',
        action: 'attachment.removed',
        oldValue: {
          id: row.id,
          filename: row.filename,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          sha256: row.sha256.toString('hex'),
        },
        newValue: null,
        actorId: String(actor.id),
      });
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────
  private async findRow(complaintId: string, attachmentId: string): Promise<AttachmentEntity> {
    const row = await this.repo.findOne({ where: { id: attachmentId, complaintId } });
    if (!row) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });
    return row;
  }

  private async assertComplaintExists(complaintId: string): Promise<void> {
    const exists = await this.dataSource
      .getRepository(ComplaintEntity)
      .exists({ where: { id: complaintId } });
    if (!exists) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });
  }

  private async allowedMimes(): Promise<string[]> {
    const row = await this.settings.findOne({ where: { key: 'attachments.allowed_mime_types' } });
    if (!row || !Array.isArray(row.value)) return DEFAULT_ALLOWED_MIME;
    return (row.value as unknown[]).filter((v): v is string => typeof v === 'string');
  }

  private toMeta = (row: AttachmentEntity): AttachmentMeta => ({
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    sha256: row.sha256.toString('hex'),
  });
}
