import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Single-row-per-kind store for branding binary assets (logo today, room
 * for favicon / banner later). Bytes live here so jsonb settings stay
 * lean.
 */
@Entity({ name: 'branding_assets' })
export class BrandingAssetEntity {
  /** 'logo' is the only kind today. Add 'favicon' / etc. as needed. */
  @PrimaryColumn({ type: 'text' })
  kind!: string;

  @Column({ type: 'text' })
  mime!: string;

  @Column({ type: 'bytea' })
  bytes!: Buffer;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy!: string | null;
}
