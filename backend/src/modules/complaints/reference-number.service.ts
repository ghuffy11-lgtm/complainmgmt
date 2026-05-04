import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { formatReference } from './format-reference';
import { SystemSettingEntity } from '../admin/system-settings.entity';

const DEFAULT_TEMPLATE = 'CMP-{YYYY}-{seq:6}';

@Injectable()
export class ReferenceNumberService {
  /**
   * Allocate the next reference number for `now`, atomically.
   *
   * Runs inside the caller's transaction so a rolled-back complaint creation
   * also rolls back the sequence increment — no wasted numbers.
   *
   * Concurrency: the UPSERT row-locks per year, serialising concurrent creates
   * within a year. At Excel-replacement scale this is irrelevant; at high QPS
   * we'd switch to a Postgres SEQUENCE per year.
   */
  async next(em: EntityManager, now: Date = new Date()): Promise<string> {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const rows = await em.query<Array<{ seq: number }>>(
      `INSERT INTO complaint_reference_sequence (year, next_seq)
            VALUES ($1, 2)
       ON CONFLICT (year) DO UPDATE
              SET next_seq = complaint_reference_sequence.next_seq + 1
        RETURNING next_seq - 1 AS seq`,
      [year],
    );
    const seq = Number(rows[0].seq);

    const template = await this.template(em);
    return formatReference(template, year, month, seq);
  }

  private async template(em: EntityManager): Promise<string> {
    const row = await em
      .getRepository(SystemSettingEntity)
      .findOne({ where: { key: 'complaint.reference_format' } });
    const value = row?.value;
    return typeof value === 'string' && value.length > 0 ? value : DEFAULT_TEMPLATE;
  }
}
