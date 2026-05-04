import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'complaint_field_values' })
@Index(['complaintId', 'fieldId'], { unique: true })
export class ComplaintFieldValueEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'complaint_id', type: 'bigint' })
  complaintId!: string;

  @Column({ name: 'field_id', type: 'bigint' })
  fieldId!: string;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText!: string | null;

  @Column({ name: 'value_number', type: 'numeric', nullable: true })
  valueNumber!: string | null;

  @Column({ name: 'value_date', type: 'date', nullable: true })
  valueDate!: string | null;

  @Column({ name: 'value_option_id', type: 'bigint', nullable: true })
  valueOptionId!: string | null;

  @Column({ name: 'owner_user_id', type: 'bigint', nullable: true })
  ownerUserId!: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
