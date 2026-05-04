import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'complaint_attachments' })
export class AttachmentEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'complaint_id', type: 'bigint' })
  complaintId!: string;

  @Column({ type: 'text' })
  filename!: string;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType!: string;

  @Column({ name: 'byte_size', type: 'int' })
  byteSize!: number;

  @Column({ type: 'bytea' })
  content!: Buffer;

  @Column({ type: 'bytea' })
  sha256!: Buffer;

  @Column({ name: 'uploaded_by', type: 'bigint' })
  uploadedBy!: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;
}
