import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

/**
 * Batch-resolves opaque ids to human-friendly labels.
 *
 * Audit rows, assignment history rows, and similar read endpoints store
 * `user_id` / `department_id` references; the UI wants names. Doing one DB
 * round-trip per row produces an N+1; this service collects unique ids per
 * page and issues a single IN-list query per type.
 *
 * Returns Maps for cheap O(1) lookup at the call site.
 */
@Injectable()
export class DisplayNamesService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(DepartmentEntity) private readonly departments: Repository<DepartmentEntity>,
  ) {}

  async usersByIds(ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, { username: string; displayName: string }>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return new Map();
    const rows = await this.users.find({
      where: { id: In(unique) },
      select: ['id', 'username', 'displayName'],
    });
    return new Map(rows.map((u) => [u.id, { username: u.username, displayName: u.displayName }]));
  }

  async departmentsByIds(ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, { name: string; key: string }>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return new Map();
    const rows = await this.departments.find({
      where: { id: In(unique) },
      select: ['id', 'name', 'key'],
    });
    return new Map(rows.map((d) => [d.id, { name: d.name, key: d.key }]));
  }
}

function uniqueIds(ids: ReadonlyArray<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const id of ids) if (id != null) set.add(String(id));
  return [...set];
}
