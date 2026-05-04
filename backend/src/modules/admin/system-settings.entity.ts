import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'system_settings' })
export class SystemSettingEntity {
  @PrimaryColumn({ type: 'text' })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy!: string | null;
}
