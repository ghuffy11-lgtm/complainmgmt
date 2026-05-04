import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'complaint_assignment_history' })
export class AssignmentHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'complaint_id', type: 'bigint' })
  complaintId!: string;

  @Column({ name: 'old_assigned_to', type: 'bigint', nullable: true })
  oldAssignedTo!: string | null;

  @Column({ name: 'new_assigned_to', type: 'bigint', nullable: true })
  newAssignedTo!: string | null;

  @Column({ name: 'old_department_id', type: 'bigint', nullable: true })
  oldDepartmentId!: string | null;

  @Column({ name: 'new_department_id', type: 'bigint', nullable: true })
  newDepartmentId!: string | null;

  @Column({ name: 'changed_by', type: 'bigint' })
  changedBy!: string;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt!: Date;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
