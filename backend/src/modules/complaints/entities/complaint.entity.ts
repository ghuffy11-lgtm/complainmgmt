import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'rejected';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'critical';

@Entity({ name: 'complaints' })
export class ComplaintEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'reference_no', type: 'text', unique: true })
  referenceNo!: string;

  @Column({ type: 'text', default: 'open' })
  status!: ComplaintStatus;

  @Column({ type: 'text', default: 'normal' })
  priority!: ComplaintPriority;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'assigned_department_id', type: 'bigint', nullable: true })
  assignedDepartmentId!: string | null;

  @Column({ name: 'assigned_to', type: 'bigint', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'assigned_by', type: 'bigint', nullable: true })
  assignedBy!: string | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt!: Date | null;

  /**
   * The date the complaint actually occurred (operator-supplied), distinct
   * from `created_at` (when the row landed in CTS). YYYY-MM-DD; nullable
   * because the operator may not know it at submission time.
   */
  @Column({ name: 'complaint_date', type: 'date', nullable: true })
  complaintDate!: string | null;

  @Column({ name: 'subcategory_id', type: 'bigint', nullable: true })
  subcategoryId!: string | null;

  @Column({ name: 'origin_id', type: 'bigint', nullable: true })
  originId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
