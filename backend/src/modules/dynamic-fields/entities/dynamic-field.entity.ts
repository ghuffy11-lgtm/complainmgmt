import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DynamicFieldOptionEntity } from './dynamic-field-option.entity';

export type DynamicFieldType = 'text' | 'number' | 'date' | 'dropdown' | 'file';
export type FieldLocking = 'none' | 'first_writer_wins';

@Entity({ name: 'dynamic_fields' })
export class DynamicFieldEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text', unique: true })
  key!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'text' })
  type!: DynamicFieldType;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  validation!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'{"roles":"*"}'::jsonb` })
  visibility!: { roles: '*' | string[] };

  @Column({ type: 'text', default: 'none' })
  locking!: FieldLocking;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => DynamicFieldOptionEntity, (o) => o.field)
  options?: DynamicFieldOptionEntity[];
}
