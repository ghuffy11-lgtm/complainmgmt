import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DynamicFieldEntity } from './dynamic-field.entity';

@Entity({ name: 'dynamic_field_options' })
@Index(['fieldId', 'value'], { unique: true })
export class DynamicFieldOptionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'field_id', type: 'bigint' })
  fieldId!: string;

  @ManyToOne(() => DynamicFieldEntity, (f) => f.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field?: DynamicFieldEntity;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
